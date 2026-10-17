// The API's endpoints, described once. The index route, the OpenAPI document
// and the Developers page are all built from this list, so they cannot drift.

export interface Param {
  name: string;
  in: "query" | "path" | "body";
  type: "string" | "number" | "array";
  required?: boolean;
  description: string;
  example?: string | number;
}

export interface Endpoint {
  id: string;
  method: "GET" | "POST";
  path: string;
  group: "Stablecoins" | "Earn" | "Stocks" | "Plan" | "Service";
  summary: string;
  description: string;
  params: Param[];
  /** A request a reader can run as is. */
  example: { path: string; body?: Record<string, unknown> };
}

export const API_VERSION = "0.1.0";

export const ENDPOINTS: Endpoint[] = [
  {
    id: "stablecoins",
    method: "GET",
    path: "/api/v1/stablecoins",
    group: "Stablecoins",
    summary: "Vetted stablecoins",
    description:
      "Each listed stablecoin with its issuer, backing, live supply, distance from $1, and the chains it lives on. Also names the large dollar tokens left out, and why.",
    params: [],
    example: { path: "/api/v1/stablecoins" },
  },
  {
    id: "onramps",
    method: "GET",
    path: "/api/v1/onramps",
    group: "Stablecoins",
    summary: "Where to buy a stablecoin with dollars",
    description:
      "Exchanges and direct on-ramps that sell each vetted stablecoin, the live price they sell at, and the networks they send it out on.",
    params: [
      { name: "asset", in: "query", type: "string", description: "Only offers for this stablecoin.", example: "USDC" },
      { name: "chain", in: "query", type: "string", description: "Only offers that can deliver on this chain.", example: "base" },
    ],
    example: { path: "/api/v1/onramps?asset=USDC&chain=base" },
  },
  {
    id: "yields",
    method: "GET",
    path: "/api/v1/yields",
    group: "Earn",
    summary: "Vetted places to earn on a stablecoin",
    description:
      "Lending and savings pools that pass the protocol and pool checks, with today's rate, its 30-day average, size, and plain-language flags.",
    params: [
      { name: "asset", in: "query", type: "string", description: "Only pools for this stablecoin.", example: "USDC" },
      { name: "chain", in: "query", type: "string", description: "Only pools on this chain.", example: "base" },
      { name: "maxRisk", in: "query", type: "number", description: "Highest risk group to include: 1, 2 or 3.", example: 2 },
      { name: "sort", in: "query", type: "string", description: "steady (default), today, base or size.", example: "steady" },
      { name: "limit", in: "query", type: "number", description: "How many to return, up to 500.", example: 20 },
    ],
    example: { path: "/api/v1/yields?asset=USDC&maxRisk=2&limit=5" },
  },
  {
    id: "yield-history",
    method: "GET",
    path: "/api/v1/yields/{pool}/history",
    group: "Earn",
    summary: "Rate history for one pool",
    description: "Daily rate and size for a listed pool, oldest first. `pool` is the `id` from /api/v1/yields.",
    params: [{ name: "pool", in: "path", type: "string", required: true, description: "The pool's id." }],
    example: { path: "/api/v1/yields/aa70268e-4b52-42bf-a116-608b370f9501/history" },
  },
  {
    id: "stocks",
    method: "GET",
    path: "/api/v1/stocks",
    group: "Stocks",
    summary: "Stocks and funds with a tokenized form",
    description: "Search the catalog by ticker or name. Each result names the issuers and chains it is available on.",
    params: [
      { name: "q", in: "query", type: "string", description: "A ticker or part of a name.", example: "apple" },
      { name: "limit", in: "query", type: "number", description: "How many to return.", example: 10 },
    ],
    example: { path: "/api/v1/stocks?q=apple&limit=5" },
  },
  {
    id: "stock",
    method: "GET",
    path: "/api/v1/stocks/{ticker}",
    group: "Stocks",
    summary: "Best place to buy one tokenized stock",
    description:
      "Every venue selling the token, ranked by the all-in cost of the order: the live swap quote, the route and pools it uses, the network fee, and the premium over the real share price. Each venue carries a `handoff`: a swap link with the pair already chosen, on-ramps that deliver the stablecoin on that chain, and wallet set-up.",
    params: [
      { name: "ticker", in: "path", type: "string", required: true, description: "The stock's ticker.", example: "AAPL" },
      { name: "amount", in: "query", type: "number", description: "Order size in dollars, 10 to 1,000,000. Default 1000.", example: 1000 },
    ],
    example: { path: "/api/v1/stocks/AAPL?amount=1000" },
  },
  {
    id: "glidepath",
    method: "POST",
    path: "/api/v1/simulate/glidepath",
    group: "Plan",
    summary: "Project a glide path",
    description:
      "Simulates a plan that shifts from tokenized stocks toward stablecoin yield as the goal nears, and compares it with not shifting and with holding only stablecoin yield.",
    params: [
      { name: "years", in: "body", type: "number", description: "Years until the goal, 1 to 50.", example: 25 },
      { name: "initial", in: "body", type: "number", description: "Starting amount in dollars.", example: 5000 },
      { name: "monthly", in: "body", type: "number", description: "Added each month, in dollars.", example: 300 },
      { name: "startStocks", in: "body", type: "number", description: "Share in stocks at the start, 0 to 1.", example: 0.9 },
      { name: "endStocks", in: "body", type: "number", description: "Share in stocks at the goal, 0 to 1.", example: 0.3 },
      { name: "shape", in: "body", type: "string", description: "steady, late or early.", example: "steady" },
      { name: "stockReturn", in: "body", type: "number", description: "Expected yearly stock return, as a fraction.", example: 0.08 },
      { name: "stableReturn", in: "body", type: "number", description: "Expected yearly stablecoin yield, as a fraction.", example: 0.04 },
    ],
    example: {
      path: "/api/v1/simulate/glidepath",
      body: { years: 25, initial: 5000, monthly: 300, startStocks: 0.9, endStocks: 0.3, shape: "steady" },
    },
  },
  {
    id: "portfolio-plan",
    method: "POST",
    path: "/api/v1/portfolio/plan",
    group: "Plan",
    summary: "Build a portfolio and find where each piece fills",
    description:
      "Turns a stock/bond target and a few toggles into a mix of asset classes by mean-variance optimisation, projects it along a glide path, and for each holding finds the tokenized fund, issuer and chain that fill that exact dollar amount at the lowest all-in cost, splitting orders a single market cannot absorb.",
    params: [
      { name: "capital", in: "body", type: "number", description: "Dollars to invest now.", example: 25000 },
      { name: "monthly", in: "body", type: "number", description: "Added each month, in dollars.", example: 500 },
      { name: "equityShare", in: "body", type: "number", description: "Share in stocks today, 0 to 1.", example: 0.7 },
      { name: "endEquityShare", in: "body", type: "number", description: "Share in stocks at the goal, 0 to 1.", example: 0.35 },
      { name: "years", in: "body", type: "number", description: "Years until the goal, 1 to 45.", example: 20 },
      { name: "risk", in: "body", type: "string", description: "steady, balanced or growth: how much return the optimizer trades for a calmer ride.", example: "balanced" },
      { name: "classes", in: "body", type: "array", description: "Asset class ids to include, e.g. us_large, intl_developed, tbills, aggregate_bonds, tips, gold." },
      { name: "maxCost", in: "body", type: "number", description: "Highest acceptable all-in cost of a fill, as a fraction.", example: 0.01 },
      { name: "chains", in: "body", type: "array", description: "Only fill on these chains, e.g. ethereum, solana, robinhood. Empty means any." },
    ],
    example: {
      path: "/api/v1/portfolio/plan",
      body: { capital: 25000, equityShare: 0.7, endEquityShare: 0.35, years: 20, risk: "balanced", maxCost: 0.01 },
    },
  },
  {
    id: "portfolio-allocate",
    method: "POST",
    path: "/api/v1/portfolio/allocate",
    group: "Plan",
    summary: "Target mix and projection only",
    description:
      "The same optimisation and glide-path projection as the plan endpoint, without reading any market. Fast, and needs no outside source.",
    params: [
      { name: "capital", in: "body", type: "number", description: "Dollars to invest now.", example: 25000 },
      { name: "equityShare", in: "body", type: "number", description: "Share in stocks today, 0 to 1.", example: 0.7 },
      { name: "risk", in: "body", type: "string", description: "steady, balanced or growth.", example: "balanced" },
    ],
    example: { path: "/api/v1/portfolio/allocate", body: { capital: 25000, equityShare: 0.7, risk: "balanced" } },
  },
  {
    id: "backtest",
    method: "POST",
    path: "/api/v1/simulate/backtest",
    group: "Plan",
    summary: "Backtest a portfolio",
    description:
      "Runs a mix of stocks, funds and stablecoin yield through real price history, with monthly contributions and rebalancing, against a benchmark.",
    params: [
      { name: "holdings", in: "body", type: "array", required: true, description: 'List of { ticker, weight }. Weights add to 1. Use "CASH" for stablecoin yield.' },
      { name: "start", in: "body", type: "string", description: "First month, YYYY-MM.", example: "2016-01" },
      { name: "end", in: "body", type: "string", description: "Last month, YYYY-MM. Defaults to this month." },
      { name: "initial", in: "body", type: "number", description: "Starting amount in dollars.", example: 10000 },
      { name: "monthly", in: "body", type: "number", description: "Added each month, in dollars.", example: 500 },
      { name: "rebalance", in: "body", type: "string", description: "never, monthly, quarterly or yearly.", example: "yearly" },
      { name: "cashMode", in: "body", type: "string", description: "fixed, or treasury to use historical Treasury bill rates.", example: "fixed" },
      { name: "cashRate", in: "body", type: "number", description: "Yearly stablecoin yield as a fraction, for fixed mode.", example: 0.04 },
      { name: "benchmark", in: "body", type: "string", description: "Ticker to compare against. Default SPY.", example: "SPY" },
    ],
    example: {
      path: "/api/v1/simulate/backtest",
      body: {
        holdings: [
          { ticker: "SPY", weight: 0.6 },
          { ticker: "QQQ", weight: 0.2 },
          { ticker: "CASH", weight: 0.2 },
        ],
        start: "2016-01",
        initial: 10000,
        monthly: 500,
        rebalance: "yearly",
      },
    },
  },
  {
    id: "defaults",
    method: "GET",
    path: "/api/v1/simulate/defaults",
    group: "Plan",
    summary: "Planner starting values",
    description: "Default inputs for the glide path, with today's typical established stablecoin rate filled in.",
    params: [],
    example: { path: "/api/v1/simulate/defaults" },
  },
  {
    id: "health",
    method: "GET",
    path: "/api/v1/health",
    group: "Service",
    summary: "Service health",
    description: "Whether the server is up.",
    params: [],
    example: { path: "/api/v1/health" },
  },
];
