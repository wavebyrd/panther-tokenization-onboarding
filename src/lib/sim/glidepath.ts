// A glide path: a portfolio that starts mostly in stocks and shifts toward
// steady stablecoin yield as the goal date nears, the way a target-date fund
// does. This projects where such a plan could end up by simulating thousands
// of possible futures. It illustrates a range, it does not predict.
//
// Pure: no I/O, the same inputs always give the same result.

import { normalSource, percentile, seededRandom } from "./stats.ts";

export type GlideShape = "steady" | "late" | "early";

export interface GlidePathInput {
  /** Years until the money is needed. */
  years: number;
  initial: number;
  monthly: number;
  /** Share held in tokenized stocks at the start and at the goal, 0..1. */
  startStocks: number;
  endStocks: number;
  shape: GlideShape;
  /** Expected yearly return and swing of the stock side, as fractions. */
  stockReturn: number;
  stockVolatility: number;
  /** Expected yearly yield on the stablecoin side, and how much it wanders. */
  stableReturn: number;
  stableVolatility: number;
  /** Yearly inflation, to show results in today's dollars. 0 to leave them as is. */
  inflation: number;
  /** How closely the two sides move together, -1..1. Optional; 0 treats them as independent. */
  correlation?: number;
  simulations: number;
  seed: number;
}

export interface GlideYear {
  year: number;
  stocks: number;
  stable: number;
  contributed: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

export interface GlideOutcome {
  p10: number;
  p50: number;
  p90: number;
  /** Share of simulated futures that ended with more than was paid in. */
  chanceAhead: number;
  /**
   * How far a bad year (the worst one in ten) drops the portfolio during the
   * last ten years before the goal, as a positive fraction. Contributions are
   * taken out, so this is investment loss only.
   */
  lateSwing: number;
}

export interface GlidePathResult {
  years: GlideYear[];
  contributed: number;
  glide: GlideOutcome;
  /** The same plan without the shift, holding the starting mix throughout. */
  noShift: GlideOutcome;
  /** The same plan held entirely in stablecoin yield. */
  allStable: GlideOutcome;
  inTodaysDollars: boolean;
}

export const GLIDE_LIMITS = {
  years: { min: 1, max: 50 },
  simulations: { min: 200, max: 5000 },
  amount: { min: 0, max: 100_000_000 },
} as const;

export const GLIDE_DEFAULTS: GlidePathInput = {
  years: 25,
  initial: 5_000,
  monthly: 300,
  startStocks: 0.9,
  endStocks: 0.3,
  shape: "steady",
  stockReturn: 0.08,
  stockVolatility: 0.16,
  stableReturn: 0.04,
  stableVolatility: 0.01,
  inflation: 0.025,
  simulations: 2000,
  seed: 20260928,
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Forces every field into its allowed range, so the engine never sees nonsense. */
export function sanitizeGlideInput(raw: Partial<GlidePathInput>): GlidePathInput {
  const pick = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
  const d = GLIDE_DEFAULTS;
  return {
    years: Math.round(clamp(pick(raw.years, d.years), GLIDE_LIMITS.years.min, GLIDE_LIMITS.years.max)),
    initial: clamp(pick(raw.initial, d.initial), GLIDE_LIMITS.amount.min, GLIDE_LIMITS.amount.max),
    monthly: clamp(pick(raw.monthly, d.monthly), GLIDE_LIMITS.amount.min, GLIDE_LIMITS.amount.max),
    startStocks: clamp(pick(raw.startStocks, d.startStocks), 0, 1),
    endStocks: clamp(pick(raw.endStocks, d.endStocks), 0, 1),
    shape: raw.shape === "late" || raw.shape === "early" ? raw.shape : "steady",
    stockReturn: clamp(pick(raw.stockReturn, d.stockReturn), -0.5, 0.5),
    stockVolatility: clamp(pick(raw.stockVolatility, d.stockVolatility), 0, 1),
    stableReturn: clamp(pick(raw.stableReturn, d.stableReturn), -0.2, 0.3),
    stableVolatility: clamp(pick(raw.stableVolatility, d.stableVolatility), 0, 0.5),
    inflation: clamp(pick(raw.inflation, d.inflation), 0, 0.2),
    correlation: clamp(pick(raw.correlation, 0), -0.99, 0.99),
    simulations: Math.round(
      clamp(pick(raw.simulations, d.simulations), GLIDE_LIMITS.simulations.min, GLIDE_LIMITS.simulations.max),
    ),
    seed: Math.round(pick(raw.seed, d.seed)) >>> 0,
  };
}

/** Share in stocks at `progress` (0 at the start, 1 at the goal). */
export function stockShare(input: Pick<GlidePathInput, "startStocks" | "endStocks" | "shape">, progress: number): number {
  const t = clamp(progress, 0, 1);
  // "late" holds stocks longer and shifts near the end; "early" shifts soon and coasts.
  const eased = input.shape === "late" ? t * t : input.shape === "early" ? 1 - (1 - t) * (1 - t) : t;
  return input.startStocks + (input.endStocks - input.startStocks) * eased;
}

interface Drift {
  mean: number;
  sigma: number;
}

/** Monthly log-return parameters that compound to the stated yearly return. */
function monthly(yearlyReturn: number, yearlyVolatility: number): Drift {
  const sigma = yearlyVolatility / Math.sqrt(12);
  return { mean: Math.log(1 + yearlyReturn) / 12 - (sigma * sigma) / 2, sigma };
}

interface Simulated {
  /** Balance at each year's end, per run. */
  yearEnd: Float64Array[];
  /** Investment return in each year, per run, with contributions taken out. */
  yearReturn: Float64Array[];
  final: Float64Array;
}

function simulate(input: GlidePathInput, share: (progress: number) => number): Simulated {
  const months = input.years * 12;
  const stock = monthly(input.stockReturn, input.stockVolatility);
  const stable = monthly(input.stableReturn, input.stableVolatility);
  const deflate = Math.log(1 + input.inflation) / 12;
  const rho = input.correlation ?? 0;
  const spread = Math.sqrt(1 - rho * rho);
  const yearEnd = Array.from({ length: input.years }, () => new Float64Array(input.simulations));
  const yearReturn = Array.from({ length: input.years }, () => new Float64Array(input.simulations));
  const final = new Float64Array(input.simulations);
  // Seeded the same for every plan and drawn in the same order, so plans are
  // compared across identical futures rather than different luck.
  const normal = normalSource(seededRandom(input.seed));

  for (let run = 0; run < input.simulations; run++) {
    let balance = input.initial;
    let growthThisYear = 1;
    for (let month = 0; month < months; month++) {
      // Rebalanced to the path's mix every month; contributions arrive at the month's start.
      if (month > 0) balance += input.monthly;
      const inStocks = share(month / months);
      const first = normal();
      const second = rho * first + spread * normal();
      const stockGrowth = Math.exp(stock.mean + stock.sigma * first - deflate);
      const stableGrowth = Math.exp(stable.mean + stable.sigma * second - deflate);
      const growth = inStocks * stockGrowth + (1 - inStocks) * stableGrowth;
      balance *= growth;
      growthThisYear *= growth;
      if ((month + 1) % 12 === 0) {
        const year = (month + 1) / 12 - 1;
        yearEnd[year][run] = balance;
        yearReturn[year][run] = growthThisYear - 1;
        growthThisYear = 1;
      }
    }
    final[run] = balance;
  }
  return { yearEnd, yearReturn, final };
}

function outcome(simulated: Simulated, contributed: number): GlideOutcome {
  const { yearReturn, final } = simulated;
  const sorted = Float64Array.from(final).sort();
  let ahead = 0;
  for (const value of final) if (value > contributed) ahead++;

  // How rough the ride is near the goal: a bad year (the worst one in ten) within the last ten years.
  let worst = 0;
  for (let year = Math.max(0, yearReturn.length - 10); year < yearReturn.length; year++) {
    worst = Math.min(worst, percentile(Float64Array.from(yearReturn[year]).sort(), 0.1));
  }
  return {
    p10: percentile(sorted, 0.1),
    p50: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    chanceAhead: final.length ? ahead / final.length : NaN,
    lateSwing: worst < 0 ? -worst : 0,
  };
}

export function runGlidePath(raw: Partial<GlidePathInput>): GlidePathResult {
  const input = sanitizeGlideInput(raw);
  const months = input.years * 12;

  // Balances are kept in today's dollars, so the monthly amount is too: the
  // plan assumes contributions rise with inflation.
  let contributed = input.initial;
  const contributedByYear: number[] = [];
  for (let month = 1; month <= months; month++) {
    if (month < months) contributed += input.monthly;
    if (month % 12 === 0) contributedByYear.push(contributed);
  }

  const glide = simulate(input, (progress) => stockShare(input, progress));
  const noShift = simulate(input, () => input.startStocks);
  const allStable = simulate(input, () => 0);

  const years: GlideYear[] = glide.yearEnd.map((values, index) => {
    const sorted = Float64Array.from(values).sort();
    const stocks = stockShare(input, (index + 1) / input.years);
    return {
      year: index + 1,
      stocks,
      stable: 1 - stocks,
      contributed: contributedByYear[index],
      p10: percentile(sorted, 0.1),
      p25: percentile(sorted, 0.25),
      p50: percentile(sorted, 0.5),
      p75: percentile(sorted, 0.75),
      p90: percentile(sorted, 0.9),
    };
  });

  return {
    years,
    contributed,
    glide: outcome(glide, contributed),
    noShift: outcome(noShift, contributed),
    allStable: outcome(allStable, contributed),
    inTodaysDollars: input.inflation > 0,
  };
}
