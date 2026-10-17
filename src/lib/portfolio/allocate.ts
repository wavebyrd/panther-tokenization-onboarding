// From a few answers to a target portfolio: how much goes to stocks and bonds
// today, how that split moves along the glide path, and how each side is
// spread across asset classes by mean-variance optimisation.
//
// Pure: no I/O. The same inputs always give the same plan.

import { runGlidePath, type GlidePathResult, type GlideShape } from "../sim/glidepath.ts";
import {
  ASSET_CLASSES,
  CLASS_BY_ID,
  correlation,
  covariance,
  DEFAULT_ASSUMPTIONS,
  type Assumption,
  type ClassId,
  type Sleeve,
} from "./classes.ts";
import { optimize, portfolioReturn, portfolioVariance } from "./optimize.ts";

export type RiskProfile = "steady" | "balanced" | "growth";

/** Risk aversion for the optimizer: higher means it gives up more return to swing less. */
export const RISK_AVERSION: Record<RiskProfile, number> = { steady: 8, balanced: 4, growth: 2 };

export interface PortfolioInput {
  /** Dollars to invest now. */
  capital: number;
  /** Dollars added each month. */
  monthly: number;
  /** Share in stocks today, 0..1. The rest is fixed income. */
  equityShare: number;
  /** Share in stocks at the goal, 0..1. */
  endEquityShare: number;
  /** Years until the goal. */
  years: number;
  shape: GlideShape;
  risk: RiskProfile;
  /** Classes the user has turned on. Unknown ids are ignored. */
  classes: ClassId[];
  /** User overrides to the default assumptions. */
  assumptions: Partial<Record<ClassId, Partial<Assumption>>>;
  inflation: number;
}

export const PORTFOLIO_LIMITS = {
  capital: { min: 100, max: 10_000_000 },
  monthly: { min: 0, max: 1_000_000 },
  years: { min: 1, max: 45 },
} as const;

export const PORTFOLIO_DEFAULTS: PortfolioInput = {
  capital: 25_000,
  monthly: 500,
  equityShare: 0.7,
  endEquityShare: 0.35,
  years: 20,
  shape: "steady",
  risk: "balanced",
  classes: ASSET_CLASSES.filter((assetClass) => assetClass.defaultOn).map((assetClass) => assetClass.id),
  assumptions: {},
  inflation: 0.025,
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const finite = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);

/** Forces every field into range, so the planner never sees nonsense. */
export function sanitizePortfolioInput(raw: Partial<PortfolioInput>): PortfolioInput {
  const d = PORTFOLIO_DEFAULTS;
  const known = new Set<string>(ASSET_CLASSES.map((assetClass) => assetClass.id));
  const classes = Array.isArray(raw.classes)
    ? [...new Set(raw.classes.filter((id): id is ClassId => typeof id === "string" && known.has(id)))]
    : d.classes;
  const assumptions: PortfolioInput["assumptions"] = {};
  if (raw.assumptions && typeof raw.assumptions === "object") {
    for (const [id, value] of Object.entries(raw.assumptions)) {
      if (!known.has(id) || !value || typeof value !== "object") continue;
      const entry: Partial<Assumption> = {};
      if (typeof value.expectedReturn === "number" && Number.isFinite(value.expectedReturn)) {
        entry.expectedReturn = clamp(value.expectedReturn, -0.2, 0.3);
      }
      if (typeof value.volatility === "number" && Number.isFinite(value.volatility)) {
        entry.volatility = clamp(value.volatility, 0.001, 1);
      }
      assumptions[id as ClassId] = entry;
    }
  }
  return {
    capital: clamp(finite(raw.capital, d.capital), PORTFOLIO_LIMITS.capital.min, PORTFOLIO_LIMITS.capital.max),
    monthly: clamp(finite(raw.monthly, d.monthly), PORTFOLIO_LIMITS.monthly.min, PORTFOLIO_LIMITS.monthly.max),
    equityShare: clamp(finite(raw.equityShare, d.equityShare), 0, 1),
    endEquityShare: clamp(finite(raw.endEquityShare, d.endEquityShare), 0, 1),
    years: Math.round(clamp(finite(raw.years, d.years), PORTFOLIO_LIMITS.years.min, PORTFOLIO_LIMITS.years.max)),
    shape: raw.shape === "late" || raw.shape === "early" ? raw.shape : "steady",
    risk: raw.risk === "steady" || raw.risk === "growth" ? raw.risk : "balanced",
    classes,
    assumptions,
    inflation: clamp(finite(raw.inflation, d.inflation), 0, 0.2),
  };
}

export function resolvedAssumptions(input: PortfolioInput): Record<ClassId, Assumption> {
  const out = { ...DEFAULT_ASSUMPTIONS };
  for (const [id, override] of Object.entries(input.assumptions) as Array<[ClassId, Partial<Assumption>]>) {
    out[id] = { ...out[id], ...override };
  }
  return out;
}

export interface SleeveMix {
  sleeve: Sleeve;
  classes: Array<{ id: ClassId; name: string; weight: number }>;
  expectedReturn: number;
  volatility: number;
}

/** The optimised mix inside one sleeve. A sleeve with nothing turned on falls back to its core class. */
export function sleeveMix(sleeve: Sleeve, input: PortfolioInput, assumptions: Record<ClassId, Assumption>): SleeveMix {
  let ids = ASSET_CLASSES.filter((assetClass) => assetClass.sleeve === sleeve && input.classes.includes(assetClass.id)).map(
    (assetClass) => assetClass.id,
  );
  if (!ids.length) ids = [sleeve === "equity" ? "us_large" : "tbills"];
  const weights = optimize({
    expectedReturns: ids.map((id) => assumptions[id].expectedReturn),
    covariance: covariance(ids, assumptions),
    bounds: ids.map((id) => ({ min: CLASS_BY_ID.get(id)!.minShare, max: CLASS_BY_ID.get(id)!.maxShare })),
    riskAversion: RISK_AVERSION[input.risk],
  });
  const sigma = covariance(ids, assumptions);
  return {
    sleeve,
    classes: ids.map((id, index) => ({ id, name: CLASS_BY_ID.get(id)!.name, weight: weights[index] })),
    expectedReturn: portfolioReturn(weights, ids.map((id) => assumptions[id].expectedReturn)),
    volatility: Math.sqrt(Math.max(0, portfolioVariance(weights, sigma))),
  };
}

/** Correlation between the two sleeves, from the classes inside them. */
export function sleeveCorrelation(equity: SleeveMix, fixed: SleeveMix, assumptions: Record<ClassId, Assumption>): number {
  if (!(equity.volatility > 0) || !(fixed.volatility > 0)) return 0;
  let cov = 0;
  for (const a of equity.classes) {
    for (const b of fixed.classes) {
      cov += a.weight * b.weight * correlation(a.id, b.id) * assumptions[a.id].volatility * assumptions[b.id].volatility;
    }
  }
  return clamp(cov / (equity.volatility * fixed.volatility), -0.99, 0.99);
}

export interface TargetHolding {
  classId: ClassId;
  className: string;
  sleeve: Sleeve;
  /** Share of the whole portfolio, 0..1. */
  weight: number;
  amountUsd: number;
  tickers: string[];
}

export interface PortfolioPlan {
  input: PortfolioInput;
  assumptions: Record<ClassId, Assumption>;
  equity: SleeveMix;
  fixed: SleeveMix;
  /** Today's target, largest first. */
  holdings: TargetHolding[];
  /** Expected yearly return and swing of today's whole mix. */
  expectedReturn: number;
  volatility: number;
  sleeveCorrelation: number;
  projection: GlidePathResult;
}

export function planPortfolio(raw: Partial<PortfolioInput>): PortfolioPlan {
  const input = sanitizePortfolioInput(raw);
  const assumptions = resolvedAssumptions(input);
  const equity = sleeveMix("equity", input, assumptions);
  const fixed = sleeveMix("fixed", input, assumptions);
  const rho = sleeveCorrelation(equity, fixed, assumptions);

  const holdings: TargetHolding[] = [];
  for (const [mix, share] of [
    [equity, input.equityShare],
    [fixed, 1 - input.equityShare],
  ] as const) {
    for (const entry of mix.classes) {
      const weight = entry.weight * share;
      if (weight <= 0) continue;
      const assetClass = CLASS_BY_ID.get(entry.id)!;
      holdings.push({
        classId: entry.id,
        className: entry.name,
        sleeve: mix.sleeve,
        weight,
        amountUsd: weight * input.capital,
        tickers: assetClass.tickers,
      });
    }
  }
  holdings.sort((a, b) => b.weight - a.weight);

  const e = input.equityShare;
  const variance =
    e * e * equity.volatility ** 2 + (1 - e) ** 2 * fixed.volatility ** 2 + 2 * e * (1 - e) * rho * equity.volatility * fixed.volatility;

  const projection = runGlidePath({
    years: input.years,
    initial: input.capital,
    monthly: input.monthly,
    startStocks: input.equityShare,
    endStocks: input.endEquityShare,
    shape: input.shape,
    stockReturn: equity.expectedReturn,
    stockVolatility: equity.volatility,
    stableReturn: fixed.expectedReturn,
    stableVolatility: fixed.volatility,
    inflation: input.inflation,
    correlation: rho,
    simulations: 2000,
    seed: 20261017,
  });

  return {
    input,
    assumptions,
    equity,
    fixed,
    holdings,
    expectedReturn: e * equity.expectedReturn + (1 - e) * fixed.expectedReturn,
    volatility: Math.sqrt(Math.max(0, variance)),
    sleeveCorrelation: rho,
    projection,
  };
}
