// The server side of the simulators: reading and checking a request, fetching
// the price history a backtest needs, and the live defaults the planner opens
// with. The maths lives in lib/sim and knows nothing about where data comes from.

import { loadPrices, loadTreasuryBillRates, isTicker, type PriceSeries } from "./prices";
import { loadYields, steadyRate } from "./yields";
import {
  BacktestError,
  CASH,
  runBacktest,
  type BacktestInput,
  type BacktestResult,
  type Holding,
  type Rebalance,
} from "@/lib/sim/backtest";

export const BACKTEST_LIMITS = { holdings: 12, firstMonth: "1990-01" } as const;

export interface BacktestRequest {
  holdings: Holding[];
  start: string;
  end: string;
  initial: number;
  monthly: number;
  rebalance: Rebalance;
  /** "fixed" uses `cashRate` throughout; "treasury" uses each month's 3-month Treasury bill rate. */
  cashMode: "fixed" | "treasury";
  cashRate: number;
  benchmark: string | null;
}

export interface BacktestResponse extends BacktestResult {
  holdings: Array<{ ticker: string; name: string; weight: number }>;
  sources: Array<{ ticker: string; url: string; adjusted: boolean }>;
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const REBALANCE: Rebalance[] = ["never", "monthly", "quarterly", "yearly"];
const thisMonth = () => new Date().toISOString().slice(0, 7);

/** Reads an untrusted request body into a checked request, or says what is wrong with it. */
export function parseBacktestRequest(body: unknown): BacktestRequest {
  if (!body || typeof body !== "object") throw new BacktestError("Send a JSON object.");
  const raw = body as Record<string, unknown>;
  const amount = (value: unknown, name: string) => {
    const parsed = typeof value === "number" ? value : Number(value ?? 0);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100_000_000) throw new BacktestError(`${name} must be between 0 and 100,000,000.`);
    return parsed;
  };

  if (!Array.isArray(raw.holdings) || !raw.holdings.length) throw new BacktestError("Add at least one holding.");
  if (raw.holdings.length > BACKTEST_LIMITS.holdings) {
    throw new BacktestError(`A backtest can hold at most ${BACKTEST_LIMITS.holdings} holdings.`);
  }
  const seen = new Set<string>();
  const holdings: Holding[] = raw.holdings.map((item) => {
    const entry = (item ?? {}) as Record<string, unknown>;
    const ticker = String(entry.ticker ?? "").trim().toUpperCase();
    const weight = Number(entry.weight);
    if (ticker !== CASH && !isTicker(ticker)) throw new BacktestError(`"${ticker}" is not a ticker.`);
    if (seen.has(ticker)) throw new BacktestError(`${ticker} is listed twice.`);
    if (!Number.isFinite(weight) || weight < 0 || weight > 1) throw new BacktestError(`${ticker}'s weight must be between 0 and 1.`);
    seen.add(ticker);
    return { ticker, weight };
  });

  const start = typeof raw.start === "string" && MONTH.test(raw.start) ? raw.start : "2016-01";
  const end = typeof raw.end === "string" && MONTH.test(raw.end) ? raw.end : thisMonth();
  if (start < BACKTEST_LIMITS.firstMonth) throw new BacktestError(`History starts in ${BACKTEST_LIMITS.firstMonth}.`);
  if (end <= start) throw new BacktestError("The end month must come after the start month.");

  const rebalance = REBALANCE.includes(raw.rebalance as Rebalance) ? (raw.rebalance as Rebalance) : "yearly";
  const cashRate = Number(raw.cashRate ?? 0.04);
  if (!Number.isFinite(cashRate) || cashRate < -0.05 || cashRate > 0.3) {
    throw new BacktestError("The stablecoin yield must be between -5% and 30%.");
  }
  const benchmark = raw.benchmark === null || raw.benchmark === "" ? null : String(raw.benchmark ?? "SPY").trim().toUpperCase();
  if (benchmark && !isTicker(benchmark)) throw new BacktestError(`"${benchmark}" is not a ticker.`);

  return {
    holdings,
    start,
    end: end > thisMonth() ? thisMonth() : end,
    initial: amount(raw.initial, "The starting amount"),
    monthly: amount(raw.monthly, "The monthly amount"),
    rebalance,
    cashMode: raw.cashMode === "treasury" ? "treasury" : "fixed",
    cashRate,
    benchmark,
  };
}

export async function backtest(request: BacktestRequest): Promise<BacktestResponse> {
  const tickers = request.holdings.filter((holding) => holding.weight > 0 && holding.ticker !== CASH).map((holding) => holding.ticker);
  const wanted = [...new Set([...tickers, ...(request.benchmark ? [request.benchmark] : [])])];

  const loaded = await Promise.all(
    wanted.map(async (ticker): Promise<PriceSeries | null> => {
      try {
        return (await loadPrices(ticker)).value;
      } catch {
        // A missing benchmark is a footnote; a missing holding is a failure.
        if (tickers.includes(ticker)) throw new BacktestError(`No price history was found for ${ticker}.`);
        return null;
      }
    }),
  );
  const series = loaded.filter((item): item is PriceSeries => item !== null);

  const holdsCash = request.holdings.some((holding) => holding.ticker === CASH && holding.weight > 0);
  const cashRates =
    request.cashMode === "treasury" && holdsCash ? (await loadTreasuryBillRates().catch(() => null))?.value : undefined;

  const input: BacktestInput = {
    holdings: request.holdings,
    start: request.start,
    end: request.end,
    initial: request.initial,
    monthly: request.monthly,
    rebalance: request.rebalance,
    cashRate: request.cashRate,
    cashRates,
    benchmark: request.benchmark ?? undefined,
  };
  const result = runBacktest(input, series);
  if (request.cashMode === "treasury" && holdsCash && !cashRates) {
    result.notes.push("Treasury bill rates could not be read, so the fixed yield was used instead.");
  }
  if (series.some((item) => !item.adjusted)) {
    result.notes.push("Some prices were not adjusted for dividends, which understates their return.");
  }
  result.notes.push(
    "Run on the real stocks and funds, not their tokens: tokens are too new to have this history, and can trade slightly above or below the share.",
  );

  const names = new Map(series.map((item) => [item.ticker, item.name]));
  return {
    ...result,
    holdings: request.holdings
      .filter((holding) => holding.weight > 0)
      .map((holding) => ({
        ticker: holding.ticker,
        name: holding.ticker === CASH ? "Stablecoin yield" : names.get(holding.ticker) ?? holding.ticker,
        weight: holding.weight,
      })),
    sources: series.map((item) => ({ ticker: item.ticker, url: item.source, adjusted: item.adjusted })),
  };
}

export interface PlannerDefaults {
  /** A typical steady rate on the established tier right now, as a fraction; null if unreadable. */
  stableReturn: number | null;
  stableReturnBasis: string;
}

/** The median steady rate across established-tier pools, to open the planner on something real. */
export async function plannerDefaults(): Promise<PlannerDefaults> {
  try {
    const yields = await loadYields();
    const rates = yields.value.opportunities
      .filter((item) => item.risk === 1 && !item.flags.some((flag) => flag.tone === "caution"))
      .map(steadyRate)
      .sort((a, b) => a - b);
    if (!rates.length) throw new Error("no rates");
    const median = rates[Math.floor(rates.length / 2)];
    return {
      stableReturn: Math.round(median * 10) / 1000,
      stableReturnBasis: `The middle rate across ${rates.length} established lending and savings pools today.`,
    };
  } catch {
    return { stableReturn: null, stableReturnBasis: "Live rates could not be read, so a round figure is used." };
  }
}
