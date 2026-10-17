// Monthly price history of the real stocks and funds behind the tokens, for
// backtests. Tokenized stocks are too new to have meaningful history of their
// own, so a backtest runs on the underlying and says so.
//
// Prices are adjusted closes: dividends and splits are folded in, so a series
// measures total return, which is also how most stock tokens treat dividends.

import { cached, HOUR, type Cached } from "./cache";
import { fetchJson } from "./http";

export interface PriceSeries {
  ticker: string;
  name: string;
  /** Month ends as YYYY-MM, oldest first. */
  months: string[];
  /** Adjusted close for each month. */
  prices: number[];
  adjusted: boolean;
  source: string;
}

interface YahooChart {
  chart?: {
    result?: Array<{
      meta?: { longName?: string; shortName?: string; instrumentType?: string };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{ close?: Array<number | null> }>;
        adjclose?: Array<{ adjclose?: Array<number | null> }>;
      };
    }>;
    error?: { description?: string } | null;
  };
}

const TICKER = /^[\^]?[A-Z][A-Z0-9.\-]{0,9}$/;
const FIRST_MONTH = Date.UTC(1990, 0, 1) / 1000;

export function isTicker(value: string): boolean {
  return TICKER.test(value);
}

async function yahoo(ticker: string): Promise<PriceSeries> {
  const now = Math.floor(Date.now() / 1000);
  // Yahoo writes share classes with a dash (BRK-B), exchanges with a dot.
  const symbol = ticker.replace(".", "-");
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?period1=${FIRST_MONTH}&period2=${now}&interval=1mo&events=div%2Csplit`;
  const body = await fetchJson<YahooChart>(url, { timeoutMs: 15_000 });
  const result = body.chart?.result?.[0];
  const stamps = result?.timestamp ?? [];
  const adjusted = result?.indicators?.adjclose?.[0]?.adjclose;
  const closes = adjusted ?? result?.indicators?.quote?.[0]?.close ?? [];
  if (!result || !stamps.length) throw new Error(body.chart?.error?.description ?? "no price history");

  const byMonth = new Map<string, number>();
  stamps.forEach((stamp, index) => {
    const price = closes[index];
    if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return;
    // The last entry is the month in progress; it overwrites nothing earlier.
    byMonth.set(new Date(stamp * 1000).toISOString().slice(0, 7), price);
  });
  const months = [...byMonth.keys()].sort();
  if (months.length < 13) throw new Error("less than a year of price history");
  return {
    ticker,
    name: result.meta?.longName ?? result.meta?.shortName ?? ticker,
    months,
    prices: months.map((month) => byMonth.get(month)!),
    adjusted: Boolean(adjusted),
    source: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/history/`,
  };
}

export async function loadPrices(ticker: string): Promise<Cached<PriceSeries>> {
  const key = ticker.trim().toUpperCase();
  if (!isTicker(key)) throw new Error(`"${ticker}" is not a ticker`);
  return cached(`prices:${key}`, { ttlMs: 12 * HOUR, staleMs: 7 * 24 * HOUR }, () => yahoo(key));
}

/**
 * The 3-month Treasury bill rate by month, as an annual fraction. Stablecoin
 * lending has only a few years of history, so this stands in for "what cash
 * earned" in a backtest that starts before on-chain rates existed.
 */
export async function loadTreasuryBillRates(): Promise<Cached<Map<string, number>>> {
  return cached("prices:tbill", { ttlMs: 12 * HOUR, staleMs: 7 * 24 * HOUR }, async () => {
    const series = await yahoo("^IRX");
    return new Map(series.months.map((month, index) => [month, series.prices[index] / 100]));
  });
}
