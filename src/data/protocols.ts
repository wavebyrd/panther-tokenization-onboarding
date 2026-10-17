// The lending and savings protocols the site is willing to show. A protocol
// listed here still has to pass the live checks in server/yields.ts (size and
// age) before any of its pools appear.
//
// `risk` is this site's own grouping, described on the Earn page, not a rating
// from anyone else:
//   1  Large, long-running lending markets and savings rates.
//   2  Newer designs, or vaults where a manager chooses where deposits go.
//   3  Lending to companies rather than against on-chain collateral.

export type RiskLevel = 1 | 2 | 3;

export type ProtocolKind = "lending" | "savings" | "vault" | "credit";

export interface ProtocolProfile {
  /** DefiLlama's project slug. */
  slug: string;
  name: string;
  kind: ProtocolKind;
  risk: RiskLevel;
  /** How deposits earn, in one sentence a newcomer can follow. */
  how: string;
  /** What could go wrong that is specific to this protocol's design. */
  watchFor: string;
  url: string;
}

export const PROTOCOLS_REVIEWED_ON = "2026-09-28";

export const KIND_LABEL: Record<ProtocolKind, string> = {
  lending: "Lending market",
  savings: "Savings rate",
  vault: "Managed vault",
  credit: "Company lending",
};

export const RISK_LABEL: Record<RiskLevel, { label: string; explainer: string }> = {
  1: {
    label: "Established",
    explainer: "Large lending markets and savings rates that have run for years through several market crashes.",
  },
  2: {
    label: "Newer or managed",
    explainer: "Sound designs with a shorter history, or vaults where a manager decides where your deposit is lent.",
  },
  3: {
    label: "Company lending",
    explainer: "Your deposit is lent to trading firms and other companies. Rates are higher because a borrower can default.",
  },
};

export const PROTOCOLS: ProtocolProfile[] = [
  {
    slug: "aave-v3",
    name: "Aave",
    kind: "lending",
    risk: 1,
    how: "Borrowers post more collateral than they borrow and pay interest, which goes to depositors.",
    watchFor: "Withdrawals can be delayed when nearly all of a pool is lent out.",
    url: "https://app.aave.com",
  },
  {
    slug: "compound-v3",
    name: "Compound",
    kind: "lending",
    risk: 1,
    how: "Borrowers post more collateral than they borrow and pay interest, which goes to depositors.",
    watchFor: "Withdrawals can be delayed when nearly all of a pool is lent out.",
    url: "https://app.compound.finance",
  },
  {
    slug: "sparklend",
    name: "SparkLend",
    kind: "lending",
    risk: 1,
    how: "A lending market run by Sky, the issuer of USDS and DAI, built on Aave's code.",
    watchFor: "Closely tied to Sky, so a problem at Sky would reach it.",
    url: "https://app.spark.fi",
  },
  {
    slug: "sky-lending",
    name: "Sky Savings",
    kind: "savings",
    risk: 1,
    how: "Sky pays a savings rate on USDS from the interest and Treasury income it earns.",
    watchFor: "The rate is set by Sky's governance and can be changed by vote.",
    url: "https://app.sky.money",
  },
  {
    slug: "spark-savings",
    name: "Spark Savings",
    kind: "savings",
    risk: 1,
    how: "Deposits are converted into Sky's savings rate, so USDC and USDT holders can earn it too.",
    watchFor: "Your deposit is held as USDS behind the scenes.",
    url: "https://app.spark.fi/savings",
  },
  {
    slug: "morpho-blue",
    name: "Morpho",
    kind: "vault",
    risk: 2,
    how: "A vault manager spreads deposits across lending markets it has chosen.",
    watchFor: "Results depend on the manager's choices; each vault has its own manager and its own mix.",
    url: "https://app.morpho.org",
  },
  {
    slug: "fluid-lending",
    name: "Fluid",
    kind: "lending",
    risk: 2,
    how: "Borrowers post more collateral than they borrow and pay interest, which goes to depositors.",
    watchFor: "Allows higher borrowing against collateral than older markets, which leaves less margin in a crash.",
    url: "https://fluid.io",
  },
  {
    slug: "euler-v2",
    name: "Euler",
    kind: "vault",
    risk: 2,
    how: "Each vault is a separate lending market with its own rules, set by whoever runs it.",
    watchFor: "Vaults differ widely in quality; an earlier version of Euler was hacked in 2023 and funds were returned.",
    url: "https://app.euler.finance",
  },
  {
    slug: "kamino-lend",
    name: "Kamino",
    kind: "lending",
    risk: 2,
    how: "The largest lending market on Solana; borrowers post collateral and pay interest to depositors.",
    watchFor: "Runs on Solana only, which has had network outages.",
    url: "https://app.kamino.finance",
  },
  {
    slug: "jupiter-lend",
    name: "Jupiter Lend",
    kind: "lending",
    risk: 2,
    how: "A Solana lending market from the Jupiter exchange, built on Fluid's design.",
    watchFor: "One of the newest markets on this list.",
    url: "https://jup.ag/lend",
  },
  {
    slug: "venus-core-pool",
    name: "Venus",
    kind: "lending",
    risk: 2,
    how: "The largest lending market on BNB Chain; borrowers post collateral and pay interest to depositors.",
    watchFor: "Has absorbed losses from bad loans in past market crashes.",
    url: "https://app.venus.io",
  },
  {
    slug: "moonwell-lending",
    name: "Moonwell",
    kind: "lending",
    risk: 2,
    how: "A lending market on Base and Optimism; borrowers post collateral and pay interest to depositors.",
    watchFor: "Smaller than the other markets here.",
    url: "https://moonwell.fi",
  },
  {
    slug: "aave-v4",
    name: "Aave V4",
    kind: "lending",
    risk: 2,
    how: "The newest version of Aave, which also accepts tokenized stocks as collateral.",
    watchFor: "New code with a short history.",
    url: "https://app.aave.com",
  },
  {
    slug: "maple",
    name: "Maple",
    kind: "credit",
    risk: 3,
    how: "Deposits are lent to trading firms and other companies, which post collateral held by Maple.",
    watchFor: "A borrower can default, and withdrawals wait in a queue rather than being instant.",
    url: "https://app.maple.finance",
  },
];
