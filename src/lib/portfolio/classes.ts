// The asset classes a portfolio is built from, the tokenized funds that stand
// for each one, and the long-run assumptions the optimizer starts from.
//
// The assumptions are illustrative round numbers in the range long-run studies
// tend to use, not forecasts. Every one can be changed by the user, and the
// page says so beside the results.
//
// Pure: no I/O.

export type Sleeve = "equity" | "fixed";

export type ClassId =
  | "us_large"
  | "us_growth"
  | "us_small"
  | "intl_developed"
  | "tbills"
  | "short_treasury"
  | "mid_treasury"
  | "long_treasury"
  | "aggregate_bonds"
  | "tips"
  | "high_yield"
  | "gold";

export interface AssetClass {
  id: ClassId;
  name: string;
  sleeve: Sleeve;
  /** In plain words, what owning this class means. */
  plain: string;
  /** Tickers of funds that track this class, in order of preference. Their tokenized forms are what gets bought. */
  tickers: string[];
  /** Included unless the user turns it off. */
  defaultOn: boolean;
  /** Most of a sleeve this one class may take, so the optimizer cannot put everything in one place. */
  maxShare: number;
  /** Least of a sleeve this class takes when it is on. Only the core holdings have one. */
  minShare: number;
}

export const ASSET_CLASSES: AssetClass[] = [
  {
    id: "us_large",
    name: "US large companies",
    sleeve: "equity",
    plain: "The 500 or so biggest US companies, the core of most stock portfolios.",
    tickers: ["SPY", "IVV", "VOO", "VTI"],
    defaultOn: true,
    maxShare: 1,
    minShare: 0.4,
  },
  {
    id: "us_growth",
    name: "US tech and growth",
    sleeve: "equity",
    plain: "The 100 largest Nasdaq companies, heavy in technology.",
    tickers: ["QQQ"],
    defaultOn: true,
    maxShare: 0.35,
    minShare: 0,
  },
  {
    id: "us_small",
    name: "US small companies",
    sleeve: "equity",
    plain: "About 2,000 smaller US companies.",
    tickers: ["IWM"],
    defaultOn: false,
    maxShare: 0.2,
    minShare: 0,
  },
  {
    id: "intl_developed",
    name: "International developed",
    sleeve: "equity",
    plain: "Large companies in Europe, Japan, Australia and other developed markets.",
    tickers: ["EFA"],
    defaultOn: true,
    maxShare: 0.35,
    minShare: 0,
  },
  {
    id: "tbills",
    name: "Treasury bills",
    sleeve: "fixed",
    plain: "US government debt due within months. Very steady, pays close to the Fed rate.",
    tickers: ["SGOV", "BIL", "USFR"],
    defaultOn: true,
    maxShare: 1,
    minShare: 0.15,
  },
  {
    id: "short_treasury",
    name: "Short-term Treasuries",
    sleeve: "fixed",
    plain: "US government bonds due in one to three years.",
    tickers: ["SHY"],
    defaultOn: true,
    maxShare: 0.5,
    minShare: 0,
  },
  {
    id: "mid_treasury",
    name: "Intermediate Treasuries",
    sleeve: "fixed",
    plain: "US government bonds due in seven to ten years.",
    tickers: ["IEF"],
    defaultOn: true,
    maxShare: 0.5,
    minShare: 0,
  },
  {
    id: "long_treasury",
    name: "Long-term Treasuries",
    sleeve: "fixed",
    plain: "US government bonds due in twenty years or more. Swings a lot when rates move.",
    tickers: ["TLT"],
    defaultOn: false,
    maxShare: 0.3,
    minShare: 0,
  },
  {
    id: "aggregate_bonds",
    name: "US bond market",
    sleeve: "fixed",
    plain: "The whole US investment-grade bond market: government, mortgage and company bonds.",
    tickers: ["AGG", "BND"],
    defaultOn: true,
    maxShare: 0.6,
    minShare: 0,
  },
  {
    id: "tips",
    name: "Inflation-protected Treasuries",
    sleeve: "fixed",
    plain: "US government bonds whose value rises with inflation.",
    tickers: ["TIP"],
    defaultOn: false,
    maxShare: 0.3,
    minShare: 0,
  },
  {
    id: "high_yield",
    name: "High-yield company bonds",
    sleeve: "fixed",
    plain: "Bonds from riskier companies. Pays more, and falls with stocks in a crisis.",
    tickers: ["HYG"],
    defaultOn: false,
    maxShare: 0.2,
    minShare: 0,
  },
  {
    id: "gold",
    name: "Gold",
    sleeve: "fixed",
    plain: "Physical gold held by a fund. No income; often holds up when other things fall.",
    tickers: ["GLD", "IAU"],
    defaultOn: false,
    maxShare: 0.15,
    minShare: 0,
  },
];

export const CLASS_BY_ID = new Map(ASSET_CLASSES.map((assetClass) => [assetClass.id, assetClass]));

/** Expected yearly return and yearly swing (standard deviation), as fractions. */
export interface Assumption {
  expectedReturn: number;
  volatility: number;
}

export const DEFAULT_ASSUMPTIONS: Record<ClassId, Assumption> = {
  us_large: { expectedReturn: 0.07, volatility: 0.16 },
  us_growth: { expectedReturn: 0.075, volatility: 0.21 },
  us_small: { expectedReturn: 0.075, volatility: 0.21 },
  intl_developed: { expectedReturn: 0.07, volatility: 0.17 },
  tbills: { expectedReturn: 0.035, volatility: 0.01 },
  short_treasury: { expectedReturn: 0.037, volatility: 0.02 },
  mid_treasury: { expectedReturn: 0.04, volatility: 0.065 },
  long_treasury: { expectedReturn: 0.042, volatility: 0.13 },
  aggregate_bonds: { expectedReturn: 0.042, volatility: 0.055 },
  tips: { expectedReturn: 0.04, volatility: 0.06 },
  high_yield: { expectedReturn: 0.055, volatility: 0.09 },
  gold: { expectedReturn: 0.04, volatility: 0.15 },
};

// How closely each pair moves together, from -1 to 1. Round figures of the kind
// long histories show; Treasuries are set near zero against stocks, which has
// held over most decades but not every year (2022 is the best-known exception).
const PAIRS: Array<[ClassId, ClassId, number]> = [
  ["us_large", "us_growth", 0.9],
  ["us_large", "us_small", 0.85],
  ["us_large", "intl_developed", 0.8],
  ["us_growth", "us_small", 0.75],
  ["us_growth", "intl_developed", 0.7],
  ["us_small", "intl_developed", 0.75],
  ["tbills", "short_treasury", 0.5],
  ["tbills", "mid_treasury", 0.2],
  ["short_treasury", "mid_treasury", 0.8],
  ["short_treasury", "long_treasury", 0.6],
  ["mid_treasury", "long_treasury", 0.9],
  ["mid_treasury", "aggregate_bonds", 0.9],
  ["long_treasury", "aggregate_bonds", 0.85],
  ["short_treasury", "aggregate_bonds", 0.7],
  ["tips", "mid_treasury", 0.7],
  ["tips", "aggregate_bonds", 0.75],
  ["tips", "long_treasury", 0.6],
  ["tips", "short_treasury", 0.5],
  ["high_yield", "us_large", 0.65],
  ["high_yield", "us_small", 0.65],
  ["high_yield", "intl_developed", 0.6],
  ["high_yield", "us_growth", 0.55],
  ["high_yield", "aggregate_bonds", 0.35],
  ["high_yield", "mid_treasury", 0.1],
  ["gold", "tips", 0.3],
  ["gold", "long_treasury", 0.2],
  ["gold", "mid_treasury", 0.2],
  ["gold", "aggregate_bonds", 0.2],
  ["gold", "us_large", 0.05],
  ["gold", "intl_developed", 0.15],
];

const EQUITY_VS_TREASURY = 0;

/** Correlation between two classes. */
export function correlation(a: ClassId, b: ClassId): number {
  if (a === b) return 1;
  for (const [x, y, value] of PAIRS) if ((x === a && y === b) || (x === b && y === a)) return value;
  const sleeveA = CLASS_BY_ID.get(a)!.sleeve;
  const sleeveB = CLASS_BY_ID.get(b)!.sleeve;
  if (sleeveA !== sleeveB) return EQUITY_VS_TREASURY;
  // Two fixed-income classes not listed above (T-bills against the rest, mostly).
  return 0.1;
}

/** The covariance matrix for `ids` under `assumptions`. */
export function covariance(ids: ClassId[], assumptions: Record<ClassId, Assumption>): number[][] {
  return ids.map((a) =>
    ids.map((b) => correlation(a, b) * assumptions[a].volatility * assumptions[b].volatility),
  );
}
