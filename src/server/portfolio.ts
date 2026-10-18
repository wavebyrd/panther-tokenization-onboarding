// A target portfolio meets the real markets. For each asset class it asks, for
// the exact dollar amount: which tokenized fund, from which issuer, on which
// chain, fills this order at the lowest all-in cost right now?
//
// Cost is measured two ways, and the page says which one each venue used:
//
//   fair value    the all-in price against the real fund price times the shares
//                 each token stands for (the stock lookup's premium)
//   small order   when fair value cannot be read, the all-in price of this order
//                 against the same venue's price for a $100 order: what size
//                 alone costs, which is what "can the pool fill me" asks
//
// When no single venue fills the whole amount within the user's limit, the
// order is split across the best venues. Tokenized Treasury and money market
// funds are listed beside the steadiest classes, filtered by who each fund's
// own documents say may buy it. Nothing is signed or sent: every number here
// is a quote.

import { planPortfolio, type PortfolioInput, type PortfolioPlan, type TargetHolding } from "@/lib/portfolio/allocate";
import type { ClassId } from "@/lib/portfolio/classes";
import { ISSUERS, type IssuerId } from "@/data/issuers";
import type { ChainId } from "./chains";
import {
  canAccess,
  ELIGIBILITY_LABEL,
  loadFundCatalog,
  type FundToken,
  type InvestorType,
  type Residence,
} from "./funds";
import { lookupStock, type Venue } from "./stocks/lookup";

export const FILL_RULES = {
  /** Holdings smaller than this are not quoted; network fees would swamp them. */
  minOrderUsd: 25,
  /** The size a venue's "small order" price is read at. */
  referenceOrderUsd: 100,
  /** The stock lookup reads at most this much per order. */
  maxLookupUsd: 1_000_000,
  /** Funds tried per class, in the class's order of preference. */
  tickersPerClass: 2,
  /** Splits tried when one venue cannot fill the order: two pieces, then four. */
  splits: [2, 4],
  defaultMaxCost: 0.01,
  /** Holdings quoted at the same time; the sources behind them are free and rate-limited. */
  concurrency: 2,
  /** Classes a tokenized Treasury or money market fund can stand in for. */
  fundClasses: ["tbills", "short_treasury"] as ClassId[],
  fundsShown: 8,
} as const;

export interface FillRequest extends Partial<PortfolioInput> {
  /** Highest acceptable all-in cost of a fill, as a fraction (0.01 = 1%). */
  maxCost?: number;
  /** Chains the user is willing to use. Empty or missing means any. */
  chains?: ChainId[];
  /** Where the reader lives, for the issuers' and funds' own eligibility rules. */
  residence?: Residence;
  investor?: InvestorType;
}

export interface FillPiece {
  ticker: string;
  venueId: string;
  issuerName: string;
  chain: ChainId;
  chainName: string;
  tokenSymbol: string;
  tokenUrl: string;
  amountUsd: number;
  /** All-in cost as a fraction; negative is a discount. */
  cost: number;
  costBasis: "fair-value" | "small-order";
  aggregator: string | null;
  /** The pools the aggregator routes through, largest share first. */
  route: Array<{ venue: string; share: number }>;
  /** Dollar liquidity in the token's trading pools on this chain, and their 24-hour volume. */
  liquidityUsd: number;
  volume24hUsd: number;
  networkFeeUsd: number | null;
  swapUrl: string | null;
  swapApp: string | null;
}

export type FillStatus = "filled" | "split" | "direct" | "thin" | "no-venue" | "too-small";

/** Buying from an issuer that lists this fund, instead of a trading pool. Not quoted. */
export interface DirectOption {
  issuerName: string;
  summary: string;
  eligibility: string;
  url: string;
  confirmed: boolean;
}

export interface FundOption extends FundToken {
  /** Whether this reader may buy it under the fund's own rule; null when the rule is not stated. */
  access: boolean | null;
  eligibilityLabel: string;
}

export interface HoldingFill extends TargetHolding {
  status: FillStatus;
  pieces: FillPiece[];
  /** The cheapest cost seen for the whole amount at one venue, even if over the limit. */
  bestSingleCost: number | null;
  /** Issuers that sell this fund directly, for when the pools are too thin. */
  direct: DirectOption[];
  /** Tokenized funds that hold this class directly, bought from their issuers. */
  funds: FundOption[];
  /** Venues left out because their issuer does not offer them where the reader lives. */
  restrictedSkipped: number;
  note: string;
}

export interface FilledPlan extends Omit<PortfolioPlan, "holdings"> {
  holdings: HoldingFill[];
  maxCost: number;
  chains: ChainId[];
  residence: Residence;
  investor: InvestorType;
  /** Dollar-weighted all-in cost across every filled piece. */
  averageCost: number | null;
  filledUsd: number;
  /** When the fund data was generated. */
  fundsAsOf: string | null;
  tookMs: number;
}

interface Priced {
  venue: Venue;
  ticker: string;
  cost: number;
  basis: FillPiece["costBasis"];
}

interface Context {
  maxCost: number;
  chains: Set<ChainId>;
  residence: Residence;
  investor: InvestorType;
  funds: FundToken[];
}

/** What size alone costs at a venue: this order's price over a small order's, plus the network fee. */
function smallOrderCost(venue: Venue, small: Venue | undefined, amountUsd: number): number | null {
  if (!venue.quote || !small?.quote) return null;
  const impact = venue.quote.pricePerToken / small.quote.pricePerToken - 1;
  const fee = venue.quote.networkFeeUsd ?? 0;
  return impact + fee / amountUsd;
}

/** Issuers whose own terms say they do not offer their tokens in the United States. */
const notForUs = (issuer: IssuerId) => ISSUERS[issuer].eligibility.status === "restricted";

async function pricedVenues(
  tickers: string[],
  amountUsd: number,
  ctx: Context,
  seen: { issuers: Set<IssuerId>; restricted: Set<string> },
): Promise<Priced[]> {
  const out: Priced[] = [];
  const reads = await Promise.all(
    tickers.map(async (ticker) => {
      const [order, small] = await Promise.all([
        lookupStock(ticker, amountUsd).catch(() => null),
        lookupStock(ticker, FILL_RULES.referenceOrderUsd).catch(() => null),
      ]);
      return { ticker, order: order?.value ?? null, small: small?.value ?? null };
    }),
  );
  for (const { ticker, order, small } of reads) {
    if (!order) continue;
    const smallById = new Map((small?.venues ?? []).map((venue) => [venue.id, venue]));
    for (const venue of order.venues) {
      if (!venue.quote) continue;
      if (ctx.chains.size && !ctx.chains.has(venue.chain)) continue;
      if (ctx.residence === "us" && notForUs(venue.issuer)) {
        seen.restricted.add(venue.id);
        continue;
      }
      seen.issuers.add(venue.issuer);
      if (venue.premium !== null) {
        out.push({ venue, ticker, cost: venue.premium, basis: "fair-value" });
        continue;
      }
      const cost = smallOrderCost(venue, smallById.get(venue.id), amountUsd);
      if (cost !== null) out.push({ venue, ticker, cost, basis: "small-order" });
    }
  }
  return out.sort((a, b) => a.cost - b.cost);
}

function piece(priced: Priced, amountUsd: number): FillPiece {
  const { venue } = priced;
  return {
    ticker: priced.ticker,
    venueId: venue.id,
    issuerName: venue.issuerName,
    chain: venue.chain,
    chainName: venue.chainName,
    tokenSymbol: venue.token.symbol,
    tokenUrl: venue.token.url,
    amountUsd,
    cost: priced.cost,
    costBasis: priced.basis,
    aggregator: venue.quote?.aggregator ?? null,
    route: (venue.quote?.fills ?? []).slice(0, 3).map((fill) => ({ venue: fill.venue, share: fill.share })),
    liquidityUsd: venue.liquidityUsd,
    volume24hUsd: venue.volume24hUsd,
    networkFeeUsd: venue.quote?.networkFeeUsd ?? null,
    swapUrl: venue.handoff.swap?.url ?? null,
    swapApp: venue.handoff.swap?.app ?? null,
  };
}

// Past half the price, the exact figure only says the pool is empty; it is written as such.
const pct = (value: number) => (value > 0.5 ? "over 50%" : `${(value * 100).toFixed(2)}%`);

function fundOptions(holding: TargetHolding, ctx: Context): FundOption[] {
  if (!FILL_RULES.fundClasses.includes(holding.classId)) return [];
  return ctx.funds
    .map((fund) => ({ ...fund, access: canAccess(fund, ctx.residence, ctx.investor), eligibilityLabel: ELIGIBILITY_LABEL[fund.eligibility] }))
    .filter((fund) => fund.minInvestmentUsd === null || fund.minInvestmentUsd <= holding.amountUsd || fund.access === false)
    // Funds this reader can buy first, then the rest for comparison; largest first within each.
    .sort((a, b) => Number(b.access === true) - Number(a.access === true) || (b.valueUsd ?? 0) - (a.valueUsd ?? 0))
    .slice(0, FILL_RULES.fundsShown);
}

async function fillHolding(holding: TargetHolding, ctx: Context): Promise<HoldingFill> {
  const seen = { issuers: new Set<IssuerId>(), restricted: new Set<string>() };
  const funds = fundOptions(holding, ctx);
  const base = {
    ...holding,
    pieces: [] as FillPiece[],
    bestSingleCost: null as number | null,
    direct: [] as DirectOption[],
    funds,
    restrictedSkipped: 0,
  };
  const finish = (fill: Omit<HoldingFill, "restrictedSkipped">): HoldingFill => {
    const skipped = seen.restricted.size;
    const suffix = skipped
      ? ` ${skipped} more venue${skipped === 1 ? " was" : "s were"} left out: the issuer does not offer it to United States residents.`
      : "";
    return { ...fill, restrictedSkipped: skipped, note: fill.note + suffix };
  };

  if (holding.amountUsd < FILL_RULES.minOrderUsd) {
    return finish({ ...base, status: "too-small", note: `Under $${FILL_RULES.minOrderUsd}, network fees would cost more than the holding is worth.` });
  }
  const tickers = holding.tickers.slice(0, FILL_RULES.tickersPerClass);
  const { maxCost } = ctx;

  // Orders larger than one lookup can read start out split.
  const minimumPieces = Math.ceil(holding.amountUsd / FILL_RULES.maxLookupUsd);
  if (minimumPieces === 1) {
    const whole = await pricedVenues(tickers, holding.amountUsd, ctx, seen);
    base.bestSingleCost = whole[0]?.cost ?? null;
    if (whole.length && whole[0].cost <= maxCost) {
      return finish({
        ...base,
        status: "filled",
        pieces: [piece(whole[0], holding.amountUsd)],
        note: `One venue fills the whole order at ${pct(whole[0].cost)} all-in.`,
      });
    }
    if (!whole.length && !seen.issuers.size) {
      return finish({
        ...base,
        status: "no-venue",
        note: `No tokenized ${tickers.join(" or ")} could be quoted${ctx.chains.size ? " on the chains you chose" : ""}.`,
      });
    }
  }

  for (const parts of [minimumPieces, ...FILL_RULES.splits].filter((n) => n >= Math.max(2, minimumPieces))) {
    const size = holding.amountUsd / parts;
    const priced = await pricedVenues(tickers, size, ctx, seen);
    // One piece per venue: splitting into the same pool twice fills no better.
    const used = new Set<string>();
    const distinct = priced.filter((entry) => entry.cost <= maxCost && !used.has(entry.venue.id) && used.add(entry.venue.id));
    if (distinct.length >= parts) {
      const pieces = distinct.slice(0, parts).map((entry) => piece(entry, size));
      return finish({
        ...base,
        status: "split",
        pieces,
        note: `No single venue fills it within ${pct(maxCost)}, so it is split ${parts} ways across ${pieces
          .map((entry) => `${entry.issuerName} on ${entry.chainName}`)
          .join(", ")}.`,
      });
    }
  }

  const direct: DirectOption[] = [...seen.issuers].flatMap((id) => {
    const profile = ISSUERS[id];
    return profile.direct
      ? [{ issuerName: profile.name, summary: profile.direct.summary, eligibility: profile.eligibility.summary, url: profile.direct.url, confirmed: profile.direct.confirmed }]
      : [];
  });
  const openFunds = funds.filter((fund) => fund.access === true);
  if (direct.length || openFunds.length) {
    const ways = [
      ...direct.map((option) => option.issuerName),
      ...(openFunds.length ? [`a tokenized fund such as ${openFunds.slice(0, 2).map((fund) => fund.symbol).join(" or ")}`] : []),
    ];
    return finish({
      ...base,
      direct,
      status: "direct",
      note:
        (base.bestSingleCost !== null
          ? `Trading pools would cost ${pct(base.bestSingleCost)} all-in for this size, above your ${pct(maxCost)} limit. `
          : "No trading pool fills this size. ") + `Bought directly from ${ways.join(" or ")}, it fills at the fund price, for accounts the issuer accepts.`,
    });
  }
  return finish({
    ...base,
    status: "thin",
    note:
      base.bestSingleCost !== null
        ? `The best venue would cost ${pct(base.bestSingleCost)} all-in for this size, above your ${pct(maxCost)} limit. A smaller amount, more chains, or a higher limit would fill it.`
        : `No venue fills this size within ${pct(maxCost)}.`,
  });
}

async function mapLimited<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await work(items[index]);
      }
    }),
  );
  return results;
}

const INVESTORS = new Set<InvestorType>(["everyone", "accredited", "qualified_purchaser", "institutional"]);

export async function fillPortfolio(request: FillRequest): Promise<FilledPlan> {
  const started = performance.now();
  const plan = planPortfolio(request);
  const maxCost =
    typeof request.maxCost === "number" && Number.isFinite(request.maxCost)
      ? Math.min(0.1, Math.max(0.0005, request.maxCost))
      : FILL_RULES.defaultMaxCost;
  const catalog = await loadFundCatalog().catch(() => null);
  const ctx: Context = {
    maxCost,
    chains: new Set((Array.isArray(request.chains) ? request.chains : []).filter((chain) => typeof chain === "string")),
    residence: request.residence === "us" ? "us" : "non_us",
    investor: request.investor && INVESTORS.has(request.investor) ? request.investor : "everyone",
    funds: catalog?.value.funds ?? [],
  };

  const holdings = await mapLimited(plan.holdings, FILL_RULES.concurrency, (holding) => fillHolding(holding, ctx));
  const pieces = holdings.flatMap((holding) => holding.pieces);
  const filledUsd = pieces.reduce((total, entry) => total + entry.amountUsd, 0);
  const averageCost = filledUsd > 0 ? pieces.reduce((total, entry) => total + entry.cost * entry.amountUsd, 0) / filledUsd : null;

  return {
    ...plan,
    holdings,
    maxCost,
    chains: [...ctx.chains],
    residence: ctx.residence,
    investor: ctx.investor,
    averageCost,
    filledUsd,
    fundsAsOf: catalog?.value.asOf ?? null,
    tookMs: Math.round(performance.now() - started),
  };
}
