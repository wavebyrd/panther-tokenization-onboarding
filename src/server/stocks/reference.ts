// What the real share is worth right now, the yardstick every token price is
// measured against. During market hours that is the exchange's last sale.
// Outside them the exchange only has the closing price, so Robinhood's
// round-the-clock quote is used where it exists and is tight enough to trust.

import { cached, SECOND, type Cached } from "../cache";
import { fetchJson } from "../http";

export const ROBINHOOD_PRICES = "https://api.robinhood.com/rhj/prices";
const nasdaqUrl = (ticker: string, assetClass: string) =>
  `https://api.nasdaq.com/api/quote/${encodeURIComponent(ticker)}/info?assetclass=${assetClass}`;

// Robinhood's quote widens sharply at weekends; past this it is a guess, not a price.
const MAX_QUOTE_SPREAD = 0.01;
const QUOTE_FRESH_MS = 10 * 60 * 1000;

export interface Reference {
  price: number;
  basis: "exchange" | "round-the-clock" | "last-close" | "consensus";
  label: string;
  /** Whether the stock's home exchange is in its regular session. */
  marketOpen: boolean;
  /** Whether `price` reflects trading happening now. */
  live: boolean;
  /** The source's own timestamp, as it gives it. */
  asOf: string | null;
  source: string;
}

interface NasdaqInfo {
  data?: {
    marketStatus?: string;
    primaryData?: { lastSalePrice?: string; lastTradeTimestamp?: string; isRealTime?: boolean };
  } | null;
}

export interface RobinhoodQuote {
  tokenSymbol: string;
  bid: number | null;
  ask: number | null;
  tokenBid: number | null;
  tokenAsk: number | null;
  halted: boolean;
  generatedAt: string | null;
}

const money = (value: unknown): number | null => {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = Number(String(value).replace(/[$,]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

async function nasdaq(ticker: string) {
  for (const assetClass of ["stocks", "etf"]) {
    const body = await fetchJson<NasdaqInfo>(nasdaqUrl(ticker, assetClass), { timeoutMs: 4_000, retries: 0 }).catch(
      () => null,
    );
    const price = money(body?.data?.primaryData?.lastSalePrice);
    if (body?.data && price !== null) {
      return {
        price,
        open: body.data.marketStatus === "Open",
        realTime: body.data.primaryData?.isRealTime === true,
        asOf: body.data.primaryData?.lastTradeTimestamp ?? null,
        source: `https://www.nasdaq.com/market-activity/${assetClass === "etf" ? "etf" : "stocks"}/${ticker.toLowerCase()}`,
      };
    }
  }
  return null;
}

/** Every Robinhood stock-token quote, keyed by ticker. One request covers the whole catalog. */
export async function loadRobinhoodQuotes(): Promise<Cached<Map<string, RobinhoodQuote>>> {
  return cached("robinhood-quotes", { ttlMs: 15 * SECOND, staleMs: 5 * 60 * SECOND }, async () => {
    const body = await fetchJson<{
      quotes?: Array<{
        tokenSymbol: string;
        bid?: string;
        ask?: string;
        tokenBid?: string;
        tokenAsk?: string;
        isTradingHalt?: boolean;
        generatedAt?: string;
        currency?: string;
      }>;
    }>(ROBINHOOD_PRICES, { timeoutMs: 4_000, retries: 0 });
    const out = new Map<string, RobinhoodQuote>();
    for (const quote of body.quotes ?? []) {
      if (quote.currency && quote.currency !== "USD") continue;
      out.set(quote.tokenSymbol.toUpperCase(), {
        tokenSymbol: quote.tokenSymbol,
        bid: money(quote.bid),
        ask: money(quote.ask),
        tokenBid: money(quote.tokenBid),
        tokenAsk: money(quote.tokenAsk),
        halted: quote.isTradingHalt === true,
        generatedAt: quote.generatedAt ?? null,
      });
    }
    if (!out.size) throw new Error("no quotes came back");
    return out;
  });
}

function usableQuote(quote: RobinhoodQuote | undefined): { mid: number; asOf: string } | null {
  if (!quote || quote.halted || quote.bid === null || quote.ask === null || !quote.generatedAt) return null;
  if (quote.ask < quote.bid || (quote.ask - quote.bid) / quote.ask > MAX_QUOTE_SPREAD) return null;
  const age = Date.now() - Date.parse(quote.generatedAt);
  if (!Number.isFinite(age) || age < -60_000 || age > QUOTE_FRESH_MS) return null;
  return { mid: (quote.bid + quote.ask) / 2, asOf: quote.generatedAt };
}

export async function loadReference(ticker: string): Promise<Cached<Reference | null>> {
  const key = ticker.toUpperCase();
  return cached(`reference:${key}`, { ttlMs: 20 * SECOND, staleMs: 10 * 60 * SECOND }, async () => {
    const [exchange, quotes] = await Promise.all([nasdaq(key), loadRobinhoodQuotes().catch(() => null)]);
    const quote = usableQuote(quotes?.value.get(key));

    if (exchange?.open) {
      return {
        price: exchange.price,
        basis: "exchange",
        label: "Latest trade on the stock exchange",
        marketOpen: true,
        live: exchange.realTime,
        asOf: exchange.asOf,
        source: exchange.source,
      } satisfies Reference;
    }
    if (quote) {
      return {
        price: quote.mid,
        basis: "round-the-clock",
        label: "Robinhood's round-the-clock quote",
        marketOpen: false,
        live: true,
        asOf: quote.asOf,
        source: ROBINHOOD_PRICES,
      } satisfies Reference;
    }
    if (exchange) {
      return {
        price: exchange.price,
        basis: "last-close",
        label: "Last price before the market closed",
        marketOpen: false,
        live: false,
        asOf: exchange.asOf,
        source: exchange.source,
      } satisfies Reference;
    }
    return null;
  });
}
