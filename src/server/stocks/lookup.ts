// One ticker in, every place to buy its tokenized form out, ranked by what the
// order would really cost. For each venue (an issuer's token on one chain):
//
//   fair value   the real share price x the shares one token stands for
//   quote        what a swap aggregator says the order fills at, right now
//   premium      how far the all-in price sits above fair value
//
// The venue with the lowest premium is the best place to buy that amount.
// Anything that cannot be read is left out of the ranking and says why.

import { cached, type Cached } from "../cache";
import { CHAINS, type ChainId } from "../chains";
import { ISSUERS, type IssuerId } from "@/data/issuers";
import { handoffBuilder, type Handoff } from "./handoff";
import {
  findOndoMint,
  loadContractMultiplier,
  loadDecimals,
  loadFeedPrice,
  loadMints,
  ONDO_MINT_AUTHORITY,
  TOKEN_2022,
} from "./multipliers";
import { loadPools, type Pool } from "./pools";
import { canQuote, loadQuote, type Quote } from "./quotes";
import { loadReference, type Reference } from "./reference";
import { findStock, type Listing } from "./universe";

export const LOOKUP_RULES = {
  /** Wrapped tokens on chains with less pool liquidity than this are not quoted at all. */
  minLiquidityToQuoteUsd: 1_000,
  /** An oracle price older than this is not used as fair value. */
  maxOracleAgeHours: 72,
  /** Premium bands, as fractions. */
  goodPremium: 0.005,
  fairPremium: 0.02,
  /** Past this the order is larger than the market can absorb; the venue is called too thin, not priced. */
  thinPremium: 0.1,
  /** Quotes move by a few hundredths of a percent from one second to the next; venues this close are tied. */
  tieMargin: 0.001,
  /** Venues further than this from the median are left out of a consensus price. */
  consensusBand: 0.02,
  poolsShown: 5,
  /** The longest any one source may hold a venue up before it is reported as not answering. */
  sourceDeadlineMs: 5_000,
  /** How long a finished lookup is served as is, and how long after that while a fresh one is fetched. */
  freshMs: 15_000,
  staleMs: 90_000,
} as const;

export type VenueStatus =
  | "best"
  | "good"
  | "fair"
  | "costly"
  | "thin"
  | "indicative"
  | "unranked"
  | "no-market";

export interface FairValue {
  pricePerToken: number;
  basis: "share-price" | "oracle";
  label: string;
  asOf: string | null;
}

export interface Venue {
  id: string;
  issuer: IssuerId;
  issuerName: string;
  chain: ChainId;
  chainName: string;
  chainFeeNote: string;
  token: {
    symbol: string;
    address: string;
    url: string;
    wrapped: boolean;
  };
  sharesPerToken: number | null;
  sharesPerTokenSource: string | null;
  fair: FairValue | null;
  quote: Quote | null;
  /** Why there is no quote, in plain words. */
  quoteIssue: string | null;
  /** Dollars per token including the network fee. */
  allInPerToken: number | null;
  /** Dollars per real share including the network fee. */
  allInPerShare: number | null;
  /** Shares' worth of stock received. */
  sharesOut: number | null;
  /** All-in price over fair value, as a fraction; negative means a discount. */
  premium: number | null;
  /** The premium in dollars on this order. */
  premiumUsd: number | null;
  /** The token's price in its deepest dollar pool, for venues that cannot be quoted. */
  indicativePerToken: number | null;
  pools: Pool[];
  poolCount: number;
  liquidityUsd: number;
  volume24hUsd: number;
  status: VenueStatus;
  notes: string[];
  /** Links and facts for actually buying here. */
  handoff: Handoff;
  /** How long this venue's sources took to answer. */
  tookMs: number;
}

export interface StockLookup {
  ticker: string;
  name: string;
  kind: "stock" | "fund";
  amountUsd: number;
  /** How long the whole lookup took, for spotting a slow source. */
  tookMs: number;
  reference: Reference | null;
  /** Ranked venues, best first, then those that could not be ranked. */
  venues: Venue[];
  /** Listings with no market at all, summarised. */
  dormant: Array<{ issuer: IssuerId; issuerName: string; chains: string[] }>;
  bestVenueId: string | null;
  issuers: Array<{
    id: IssuerId;
    name: string;
    company: string;
    whatYouOwn: string;
    dividends: string;
    eligibility: string;
    eligibilityConfirmed: boolean;
    url: string;
  }>;
  notes: string[];
}

const sum = (values: Array<number | null>) => values.reduce<number>((total, value) => total + (value ?? 0), 0);

/** Ondo's Solana token for this stock, as a listing, once its mint has proved it is Ondo's. */
async function ondoSolanaListing(listings: Listing[]): Promise<Listing | null> {
  const evm = listings.find((listing) => listing.issuer === "ondo");
  if (!evm) return null;
  const mint = await findOndoMint(evm.symbol).catch(() => null);
  if (!mint?.value) return null;
  return {
    issuer: "ondo",
    symbol: evm.symbol,
    chain: "solana",
    address: mint.value,
    decimals: null,
    form: "token",
    catalogMultiplier: null,
    priceFeed: null,
  };
}

/** Gives up on a slow source rather than holding every other venue for it. */
function within<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

const marketLiquidity = (pools: Pool[]) =>
  sum(pools.filter((pool) => pool.counterKind !== "other").map((pool) => pool.liquidityUsd));

async function buildVenue(
  listing: Listing,
  reference: Reference | null,
  amountUsd: number,
  multipliers: Map<IssuerId, { value: number; source: string }>,
  solanaDecimals: Map<string, number>,
  handoff: ReturnType<typeof handoffBuilder>,
): Promise<Venue> {
  const started = performance.now();
  const chain = CHAINS[listing.chain];
  const notes: string[] = [];

  // Pools, the share multiplier and the quote are separate sources, read side
  // by side. Only a wrapped token's quote waits on its pools, to learn whether
  // there is a market worth asking about at all.
  const poolsRead = within(
    loadPools(listing.address)
      .then((pools) => pools.filter((pool) => pool.chain === listing.chain))
      .catch(() => [] as Pool[]),
    LOOKUP_RULES.sourceDeadlineMs,
    [] as Pool[],
  );

  const multiplierRead = (async (): Promise<{ value: number; source: string } | null> => {
    if (listing.catalogMultiplier !== null) return { value: listing.catalogMultiplier, source: "the issuer's catalog" };
    const shared = multipliers.get(listing.issuer);
    if (shared) return shared;
    if (listing.issuer !== "coinbase") return null;
    const read = await within(loadContractMultiplier(listing.chain, listing.address), LOOKUP_RULES.sourceDeadlineMs, null);
    return read === null ? null : { value: read, source: "the token's contract" };
  })();

  const quoteRead = (async (): Promise<{ quote: Quote | null; issue: string | null }> => {
    if (!canQuote(listing.chain)) {
      return { quote: null, issue: "No swap aggregator covers this chain yet, so only pool prices are shown." };
    }
    if (listing.form === "wrapped" && marketLiquidity(await poolsRead) < LOOKUP_RULES.minLiquidityToQuoteUsd) {
      return { quote: null, issue: "No pool holds enough to trade against." };
    }
    // Read only now that a quote will really be asked for.
    const decimals =
      listing.decimals ??
      (chain.kind === "solana"
        ? solanaDecimals.get(listing.address) ?? null
        : await within(loadDecimals(listing.chain, listing.address), LOOKUP_RULES.sourceDeadlineMs, null));
    if (decimals === null) return { quote: null, issue: "The token's details could not be read from the chain." };
    const result = await within(
      loadQuote(listing.chain, listing.address, decimals, amountUsd),
      LOOKUP_RULES.sourceDeadlineMs,
      { ok: false as const, reason: "The swap aggregator did not answer in time." },
    );
    return result.ok ? { quote: result.quote, issue: null } : { quote: null, issue: result.reason };
  })();

  const [allPools, multiplier, { quote, issue: quoteIssue }, route] = await Promise.all([
    poolsRead,
    multiplierRead,
    quoteRead,
    handoff(listing.chain, listing.address),
  ]);

  const marketPools = allPools.filter((pool) => pool.counterKind !== "other");
  const liquidityUsd = marketLiquidity(allPools);
  const volume24hUsd = sum(marketPools.map((pool) => pool.volume24hUsd));
  const sidePools = allPools.length - marketPools.length;
  if (sidePools > 0 && marketPools.length > 0) {
    notes.push(`${sidePools} more pool${sidePools === 1 ? "" : "s"} pair it with small speculative tokens; they are left out.`);
  }

  // Fair value per token. Every venue is measured against the same share
  // price wherever its multiplier is known; an oracle is the fallback, and is
  // coarser because a feed only updates when the price has moved enough.
  let fair: FairValue | null = null;
  if (multiplier && reference) {
    fair = {
      pricePerToken: reference.price * multiplier.value,
      basis: "share-price",
      label: reference.label,
      asOf: reference.asOf,
    };
  } else if (listing.priceFeed) {
    const feed = await within(loadFeedPrice(listing.chain, listing.priceFeed), LOOKUP_RULES.sourceDeadlineMs, null);
    const ageHours = feed ? (Date.now() - Date.parse(feed.updatedAt)) / 3_600_000 : Infinity;
    if (feed && ageHours <= LOOKUP_RULES.maxOracleAgeHours) {
      fair = { pricePerToken: feed.price, basis: "oracle", label: "Chainlink price feed", asOf: feed.updatedAt };
      notes.push("Compared with its on-chain price feed, which updates less often than the stock exchange.");
    }
  }
  if (!multiplier) {
    notes.push("The shares each token stands for could not be read, so its price cannot be compared exactly.");
  }

  const fee = quote?.networkFeeUsd ?? 0;
  const allInPerToken = quote ? (amountUsd + fee) / quote.tokensOut : null;
  const premium = allInPerToken !== null && fair ? allInPerToken / fair.pricePerToken - 1 : null;
  const allInPerShare =
    allInPerToken !== null && multiplier
      ? allInPerToken / multiplier.value
      : premium !== null && reference
        ? reference.price * (1 + premium)
        : null;
  const sharesOut = allInPerShare !== null ? (amountUsd + fee) / allInPerShare : null;

  const deepest = marketPools.find((pool) => pool.counterKind === "dollar" && pool.priceUsd !== null) ?? marketPools[0];
  const indicativePerToken = quote ? null : deepest?.priceUsd ?? null;

  if (listing.form === "wrapped") {
    notes.push("Trades as a wrapped token. The issuer's own app converts it to and from the main token.");
  }
  if (chain.id === "robinhood" && quote) {
    notes.push("Some pools on this chain adjust their fee by time of day, so the fill can differ slightly from the quote.");
  }

  let status: VenueStatus;
  if (quote && premium !== null) {
    status =
      premium <= LOOKUP_RULES.goodPremium
        ? "good"
        : premium <= LOOKUP_RULES.fairPremium
          ? "fair"
          : premium <= LOOKUP_RULES.thinPremium
            ? "costly"
            : "thin";
    if (status === "thin") notes.push("This order is larger than the market here can fill at a sensible price.");
  } else if (quote) status = "unranked";
  else if (marketPools.length && liquidityUsd >= LOOKUP_RULES.minLiquidityToQuoteUsd) status = "indicative";
  else status = "no-market";

  return {
    id: `${listing.issuer}:${listing.chain}`,
    issuer: listing.issuer,
    issuerName: ISSUERS[listing.issuer].name,
    chain: listing.chain,
    chainName: chain.name,
    chainFeeNote: chain.feeNote,
    token: {
      symbol: listing.symbol,
      address: listing.address,
      url: chain.tokenUrl(listing.address),
      wrapped: listing.form === "wrapped",
    },
    sharesPerToken: multiplier?.value ?? null,
    sharesPerTokenSource: multiplier?.source ?? null,
    fair,
    quote,
    quoteIssue,
    allInPerToken,
    allInPerShare,
    sharesOut,
    premium,
    premiumUsd: premium !== null ? premium * amountUsd : null,
    indicativePerToken,
    pools: marketPools.slice(0, LOOKUP_RULES.poolsShown),
    poolCount: marketPools.length,
    liquidityUsd,
    volume24hUsd,
    status,
    notes,
    // A swap link is only offered where the swap was actually quoted.
    handoff: { ...route, swap: quote ? route.swap : null },
    tookMs: Math.round(performance.now() - started),
  };
}

/** What the quoted venues agree a share is worth, when no share price can be read. */
function consensusPrice(venues: Venue[]): Reference | null {
  const perShare = venues
    .filter((venue) => venue.quote && venue.sharesPerToken)
    .map((venue) => venue.quote!.pricePerToken / venue.sharesPerToken!)
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  if (perShare.length < 2) return null;
  const median = (values: number[]) => {
    const middle = Math.floor(values.length / 2);
    return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
  };
  const first = median(perShare);
  // A venue whose order moves the price a long way is not saying what a share is worth.
  const agreeing = perShare.filter((value) => Math.abs(value / first - 1) <= LOOKUP_RULES.consensusBand);
  if (agreeing.length < 2) return null;
  return {
    price: median(agreeing),
    basis: "consensus",
    label: `Median of ${agreeing.length} tokenized venues`,
    marketOpen: false,
    live: true,
    asOf: new Date().toISOString(),
    source: "Computed from the venues' own quotes",
  };
}

const STATUS_ORDER: VenueStatus[] = ["best", "good", "fair", "costly", "unranked", "indicative", "thin", "no-market"];

async function lookup(ticker: string, amountUsd: number): Promise<StockLookup | null> {
  const started = performance.now();
  const stock = await findStock(ticker);
  if (!stock) return null;

  // The share price, and the Solana mints (which carry both the decimals and,
  // for xStocks and Ondo, the share multiplier), are read side by side.
  const known = stock.listings.filter((listing) => listing.chain === "solana").map((listing) => listing.address);
  const [referenceRead, ondoSolana, knownFacts] = await Promise.all([
    within(loadReference(stock.ticker).catch(() => null), LOOKUP_RULES.sourceDeadlineMs, null),
    within(ondoSolanaListing(stock.listings).catch(() => null), LOOKUP_RULES.sourceDeadlineMs, null),
    loadMints(known),
  ]);
  const reference = referenceRead?.value ?? null;
  const listings = ondoSolana ? [...stock.listings, ondoSolana] : stock.listings;
  const facts = new Map([...knownFacts, ...(ondoSolana ? await loadMints([ondoSolana.address]) : [])]);
  const solanaDecimals = new Map<string, number>();
  const multipliers = new Map<IssuerId, { value: number; source: string }>();
  for (const listing of listings) {
    if (listing.chain !== "solana") continue;
    const mint = facts.get(listing.address);
    if (!mint) continue;
    // An Ondo mint found by search counts only if the account shows Ondo controls it.
    if (listing.issuer === "ondo" && (mint.program !== TOKEN_2022 || mint.mintAuthority !== ONDO_MINT_AUTHORITY)) continue;
    solanaDecimals.set(listing.address, mint.decimals);
    if (mint.multiplier !== null) {
      multipliers.set(listing.issuer, { value: mint.multiplier, source: "the token's Solana contract" });
    }
  }

  const handoff = handoffBuilder();
  let built = await Promise.all(
    listings.map((listing) => buildVenue(listing, reference, amountUsd, multipliers, solanaDecimals, handoff)),
  );
  // With no share price to read (a closed market, a source that refuses), the
  // venues themselves agree on one: the median price per share across every
  // quoted venue whose multiplier is known, once outliers are set aside.
  let compared = reference;
  if (!compared) {
    const consensus = consensusPrice(built);
    if (consensus) {
      compared = consensus;
      built = await Promise.all(
        listings.map((listing) => buildVenue(listing, consensus, amountUsd, multipliers, solanaDecimals, handoff)),
      );
    }
  }

  const ranked = built
    .filter((venue) => venue.premium !== null && venue.status !== "thin")
    .sort((a, b) => a.premium! - b.premium!);
  // Venues within the tie margin of the cheapest are the same price for
  // practical purposes; among them the plain token in the deepest market wins.
  const tied = ranked.filter((venue) => venue.premium! - ranked[0].premium! <= LOOKUP_RULES.tieMargin);
  const best =
    [...tied].sort(
      (a, b) => Number(a.token.wrapped) - Number(b.token.wrapped) || b.liquidityUsd - a.liquidityUsd,
    )[0] ?? null;
  // "Best" is only claimed when the winner is itself a reasonable price.
  if (best && best.status !== "costly") best.status = "best";

  const active = built
    .filter((venue) => venue.status !== "no-market")
    .sort(
      (a, b) =>
        STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
        (a.premium ?? Infinity) - (b.premium ?? Infinity) ||
        b.liquidityUsd - a.liquidityUsd,
    );

  const dormantByIssuer = new Map<IssuerId, string[]>();
  for (const venue of built) {
    if (venue.status !== "no-market") continue;
    dormantByIssuer.set(venue.issuer, [...(dormantByIssuer.get(venue.issuer) ?? []), venue.chainName]);
  }

  const notes: string[] = [];
  if (compared?.basis === "consensus") {
    notes.push(
      "No share price could be read right now, so venues are compared with the price they agree on: the median price per share across the quoted venues.",
    );
  } else if (!reference) {
    notes.push("The real share price could not be read, so venues are shown without a comparison to it.");
  } else if (!reference.marketOpen) {
    notes.push(
      reference.live
        ? "The stock market is closed. Prices are compared with Robinhood's round-the-clock quote instead of the exchange."
        : "The stock market is closed, so token prices are compared with the last closing price and will look further from it than usual.",
    );
  }
  if (best?.status === "costly" || (!best && built.some((venue) => venue.status === "thin"))) {
    notes.push("Every venue is charging well over the share price for this amount. A smaller order may fill closer to it.");
  }

  const issuerIds = [...new Set(active.map((venue) => venue.issuer))];
  return {
    ticker: stock.ticker,
    name: stock.name,
    kind: stock.kind,
    amountUsd,
    tookMs: Math.round(performance.now() - started),
    reference: compared,
    venues: active,
    dormant: [...dormantByIssuer].map(([issuer, chains]) => ({
      issuer,
      issuerName: ISSUERS[issuer].name,
      chains: [...new Set(chains)].sort(),
    })),
    bestVenueId: best && best.status === "best" ? best.id : null,
    issuers: (issuerIds.length ? issuerIds : stock.issuers).map((id) => ({
      id,
      name: ISSUERS[id].name,
      company: ISSUERS[id].company,
      whatYouOwn: ISSUERS[id].whatYouOwn,
      dividends: ISSUERS[id].dividends,
      eligibility: ISSUERS[id].eligibility.summary,
      eligibilityConfirmed: ISSUERS[id].eligibility.status !== "unconfirmed",
      url: ISSUERS[id].url,
    })),
    notes,
  };
}

/** Rounds an order size so nearby requests share one set of quotes. */
export function normalizeAmount(amountUsd: number): number {
  const clamped = Math.min(1_000_000, Math.max(10, amountUsd));
  return clamped >= 1000 ? Math.round(clamped / 50) * 50 : Math.round(clamped);
}

/**
 * A lookup less than a few seconds old is served as is. One a little older is
 * served at once, marked stale with its age, while a fresh one is fetched
 * behind it; the page shows the age and swaps in the fresh prices. One older
 * than that is never shown: the reader waits for real prices instead.
 */
export async function lookupStock(ticker: string, amountUsd: number): Promise<Cached<StockLookup | null>> {
  const amount = normalizeAmount(amountUsd);
  return cached(
    `lookup:${ticker.trim().toUpperCase()}:${amount}`,
    { ttlMs: LOOKUP_RULES.freshMs, staleMs: LOOKUP_RULES.staleMs, serveExpiredOnError: false },
    () => lookup(ticker, amount),
  );
}
