// A backtest: what a chosen mix would have done over a stretch of real
// history, with monthly contributions and periodic rebalancing. It answers
// "what happened", never "what will happen".
//
// Pure: prices come in as arguments, the same inputs always give the same result.

import { annualized, deviation, maxDrawdown, mean } from "./stats.ts";

export type Rebalance = "never" | "monthly" | "quarterly" | "yearly";

/** The stablecoin-yield side of a portfolio is held under this name. */
export const CASH = "CASH";

export interface Holding {
  ticker: string;
  /** Target share of the portfolio, 0..1. */
  weight: number;
}

export interface BacktestSeries {
  ticker: string;
  months: string[];
  prices: number[];
}

export interface BacktestInput {
  holdings: Holding[];
  /** First and last month to include, as YYYY-MM. */
  start: string;
  end: string;
  initial: number;
  monthly: number;
  rebalance: Rebalance;
  /** Yearly yield on the stablecoin side by month, as a fraction; months missing here use `cashRate`. */
  cashRates?: Map<string, number>;
  cashRate: number;
  benchmark?: string;
}

export interface BacktestPoint {
  month: string;
  value: number;
  contributed: number;
  /** The benchmark bought with the same contributions on the same dates. */
  benchmark: number | null;
}

export interface BacktestStats {
  finalValue: number;
  contributed: number;
  gain: number;
  /** Yearly growth of the investments themselves, ignoring when money was added. */
  yearlyReturn: number;
  /** How much yearly returns swung, as a fraction. */
  volatility: number;
  maxDrawdown: number;
  drawdownFrom: string;
  drawdownTo: string;
  /** Return per unit of swing, over what cash earned. */
  sharpe: number | null;
  bestYear: { year: string; change: number } | null;
  worstYear: { year: string; change: number } | null;
}

export interface BacktestResult {
  start: string;
  end: string;
  months: number;
  points: BacktestPoint[];
  stats: BacktestStats;
  benchmark: { ticker: string; stats: BacktestStats } | null;
  years: Array<{ year: string; change: number; benchmark: number | null; partial: boolean }>;
  /** Each holding's share of the final value. */
  finalMix: Array<{ ticker: string; target: number; actual: number }>;
  notes: string[];
}

export class BacktestError extends Error {}

const EVERY: Record<Rebalance, number> = { never: Infinity, monthly: 1, quarterly: 3, yearly: 12 };

interface Track {
  /** Monthly growth factor (1.02 = up 2%) of each holding, aligned to the run's months. */
  growth: number[][];
  weights: number[];
}

/** Runs one portfolio through the months and returns its value and return series. */
function run(track: Track, months: string[], input: Pick<BacktestInput, "initial" | "monthly" | "rebalance">) {
  const every = EVERY[input.rebalance];
  const values: number[] = [];
  const returns: number[] = [];
  let parts = track.weights.map((weight) => weight * input.initial);

  months.forEach((_, index) => {
    if (index > 0) {
      const before = parts.reduce((total, part) => total + part, 0);
      parts = parts.map((part, holding) => part * track.growth[holding][index]);
      const after = parts.reduce((total, part) => total + part, 0);
      returns.push(before > 0 ? after / before - 1 : 0);
      // New money buys the target mix.
      parts = parts.map((part, holding) => part + track.weights[holding] * input.monthly);
      if (index % every === 0) {
        const total = parts.reduce((sum, part) => sum + part, 0);
        parts = track.weights.map((weight) => weight * total);
      }
    }
    values.push(parts.reduce((total, part) => total + part, 0));
  });
  return { values, returns, parts };
}

function stats(
  months: string[],
  values: number[],
  returns: number[],
  contributed: number,
  cashReturns: number[],
): BacktestStats {
  // A growth index of $1 with no contributions: the clean measure of how the mix performed.
  const index = [1];
  for (const change of returns) index.push(index[index.length - 1] * (1 + change));
  const years = returns.length / 12;
  const drawdown = maxDrawdown(index);
  const volatility = deviation(returns) * Math.sqrt(12);
  const excess = returns.map((change, i) => change - (cashReturns[i] ?? 0));
  const sharpe = volatility > 0 && returns.length >= 12 ? (mean(excess) * 12) / volatility : null;

  const byYear = yearly(months, returns);
  const full = byYear.filter((row) => !row.partial);
  const pick = (compare: (a: number, b: number) => boolean) =>
    full.reduce<{ year: string; change: number } | null>(
      (chosen, row) => (!chosen || compare(row.change, chosen.change) ? { year: row.year, change: row.change } : chosen),
      null,
    );

  const finalValue = values[values.length - 1];
  return {
    finalValue,
    contributed,
    gain: finalValue - contributed,
    yearlyReturn: annualized(1, index[index.length - 1], years),
    volatility,
    maxDrawdown: drawdown.depth,
    drawdownFrom: months[drawdown.peakIndex],
    drawdownTo: months[drawdown.troughIndex],
    sharpe: sharpe !== null && Number.isFinite(sharpe) ? sharpe : null,
    bestYear: pick((a, b) => a > b),
    worstYear: pick((a, b) => a < b),
  };
}

/** Calendar-year returns from monthly ones; `returns[i]` is the change during `months[i + 1]`. */
function yearly(months: string[], returns: number[]): Array<{ year: string; change: number; partial: boolean }> {
  const byYear = new Map<string, { growth: number; count: number }>();
  returns.forEach((change, i) => {
    const year = months[i + 1].slice(0, 4);
    const entry = byYear.get(year) ?? { growth: 1, count: 0 };
    entry.growth *= 1 + change;
    entry.count += 1;
    byYear.set(year, entry);
  });
  return [...byYear].map(([year, entry]) => ({ year, change: entry.growth - 1, partial: entry.count < 12 }));
}

export function runBacktest(input: BacktestInput, series: BacktestSeries[]): BacktestResult {
  const notes: string[] = [];
  const holdings = input.holdings.filter((holding) => holding.weight > 0);
  if (!holdings.length) throw new BacktestError("Add at least one holding.");
  const total = holdings.reduce((sum, holding) => sum + holding.weight, 0);
  if (Math.abs(total - 1) > 0.001) throw new BacktestError("Holdings must add up to 100%.");
  if (!(input.initial > 0) && !(input.monthly > 0)) throw new BacktestError("Enter a starting amount or a monthly amount.");

  const byTicker = new Map(series.map((item) => [item.ticker.toUpperCase(), item]));
  const needed = holdings.filter((holding) => holding.ticker !== CASH).map((holding) => holding.ticker.toUpperCase());
  const benchmarkTicker = input.benchmark?.toUpperCase();
  for (const ticker of needed) {
    if (!byTicker.has(ticker)) throw new BacktestError(`No price history for ${ticker}.`);
  }

  // The run covers the months every holding has prices for.
  let months: string[] | null = null;
  for (const ticker of needed) {
    const own = new Set(byTicker.get(ticker)!.months);
    months = months ? months.filter((month) => own.has(month)) : [...byTicker.get(ticker)!.months];
  }
  months ??= monthRange(input.start, input.end);
  const asked = months.filter((month) => month >= input.start && month <= input.end);
  if (asked.length < 13) throw new BacktestError("These holdings share less than a year of history in that range.");
  if (asked[0] > input.start) {
    const limiting = needed.find((ticker) => byTicker.get(ticker)!.months[0] === asked[0]) ?? "one holding";
    notes.push(`Starts in ${asked[0]} rather than ${input.start}: that is as far back as ${limiting} goes.`);
  }

  const cashGrowth = asked.map((month) => (1 + (input.cashRates?.get(month) ?? input.cashRate)) ** (1 / 12));
  const growthOf = (ticker: string): number[] => {
    if (ticker === CASH) return cashGrowth;
    const own = byTicker.get(ticker)!;
    const price = new Map(own.months.map((month, index) => [month, own.prices[index]]));
    return asked.map((month, index) => (index === 0 ? 1 : price.get(month)! / price.get(asked[index - 1])!));
  };

  const track: Track = {
    growth: holdings.map((holding) => growthOf(holding.ticker.toUpperCase())),
    weights: holdings.map((holding) => holding.weight / total),
  };
  const contributed = input.initial + input.monthly * (asked.length - 1);
  const main = run(track, asked, input);
  const cashReturns = cashGrowth.slice(1).map((growth) => growth - 1);

  // The benchmark gets the same money on the same dates.
  let benchmark: BacktestResult["benchmark"] = null;
  let benchmarkRun: ReturnType<typeof run> | null = null;
  const benchmarkSeries = benchmarkTicker ? byTicker.get(benchmarkTicker) : undefined;
  if (benchmarkTicker && benchmarkSeries) {
    const own = new Set(benchmarkSeries.months);
    if (asked.every((month) => own.has(month))) {
      benchmarkRun = run({ growth: [growthOf(benchmarkTicker)], weights: [1] }, asked, { ...input, rebalance: "never" });
      benchmark = {
        ticker: benchmarkTicker,
        stats: stats(asked, benchmarkRun.values, benchmarkRun.returns, contributed, cashReturns),
      };
    } else {
      notes.push(`${benchmarkTicker} does not cover the whole period, so it is not shown for comparison.`);
    }
  }

  const benchmarkYears = benchmarkRun ? new Map(yearly(asked, benchmarkRun.returns).map((row) => [row.year, row.change])) : null;
  const finalTotal = main.parts.reduce((sum, part) => sum + part, 0);
  if (holdings.some((holding) => holding.ticker === CASH)) {
    notes.push(
      input.cashRates
        ? "The stablecoin side earns the 3-month Treasury bill rate of each month, standing in for lending rates before they existed."
        : `The stablecoin side earns a fixed ${(input.cashRate * 100).toFixed(2)}% a year throughout.`,
    );
  }

  let running = input.initial;
  return {
    start: asked[0],
    end: asked[asked.length - 1],
    months: asked.length,
    points: asked.map((month, index) => {
      if (index > 0) running += input.monthly;
      return {
        month,
        value: main.values[index],
        contributed: running,
        benchmark: benchmarkRun ? benchmarkRun.values[index] : null,
      };
    }),
    stats: stats(asked, main.values, main.returns, contributed, cashReturns),
    benchmark,
    years: yearly(asked, main.returns).map((row) => ({ ...row, benchmark: benchmarkYears?.get(row.year) ?? null })),
    finalMix: holdings.map((holding, index) => ({
      ticker: holding.ticker.toUpperCase(),
      target: track.weights[index],
      actual: finalTotal > 0 ? main.parts[index] / finalTotal : 0,
    })),
    notes,
  };
}

/** Every month from `start` to `end` inclusive, as YYYY-MM. */
export function monthRange(start: string, end: string): string[] {
  const out: string[] = [];
  let [year, month] = start.split("-").map(Number);
  const [endYear, endMonth] = end.split("-").map(Number);
  while (year < endYear || (year === endYear && month <= endMonth)) {
    out.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    if (out.length > 1200) break;
  }
  return out;
}
