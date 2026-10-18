// What an order would actually fill at. A swap aggregator is asked for its
// best route for the exact amount, across every pool it knows on that chain,
// and answers with the tokens received and the pools used. Nothing is signed
// or sent: a quote is a read.
//
//   EVM chains  KyberSwap's aggregator
//   Solana      Jupiter

import { cached, SECOND } from "../cache";
import { CHAINS, type ChainId } from "../chains";
import { jupiterEndpoint, kyberClientId } from "../connections";
import { scaled, toRaw } from "../evm";
import { errorMessage, fetchJson, HttpError } from "../http";

/** One pool the order buys the token from, and how much of the order it fills. */
export interface RouteFill {
  /** The exchange, as the aggregator names it. */
  venue: string;
  /** The pool's address, or the aggregator's id for a market maker quoting off-chain. */
  pool: string;
  poolIsAddress: boolean;
  /** The pool's own page, where it has one. */
  url: string | null;
  /** Fraction of the tokens received that come from this pool. */
  share: number;
}

export interface Quote {
  aggregator: "KyberSwap" | "Jupiter";
  paidSymbol: string;
  paidAmount: number;
  tokensOut: number;
  /** Dollars per token, before network fees. */
  pricePerToken: number;
  /** Network fee in dollars; null when the aggregator gives none. */
  networkFeeUsd: number | null;
  networkFeeEstimated: boolean;
  /** The pools that supply the token, largest share first. */
  fills: RouteFill[];
  /** False when the order is first swapped into another asset on the way. */
  direct: boolean;
  quotedAt: string;
}

/** Merges repeat visits to one pool and orders pools by how much of the order each fills. */
function toFills(raw: Array<Omit<RouteFill, "share"> & { amount: number }>): RouteFill[] {
  const total = raw.reduce((sum, item) => sum + item.amount, 0);
  const byPool = new Map<string, RouteFill>();
  for (const item of raw) {
    const share = total > 0 ? item.amount / total : 0;
    const seen = byPool.get(item.pool);
    if (seen) seen.share += share;
    else byPool.set(item.pool, { venue: item.venue, pool: item.pool, poolIsAddress: item.poolIsAddress, url: item.url, share });
  }
  return [...byPool.values()].sort((a, b) => b.share - a.share);
}

export type QuoteResult = { ok: true; quote: Quote } | { ok: false; reason: string };

interface KyberHop {
  pool: string;
  exchange: string;
  tokenIn: string;
  tokenOut: string;
  amountOut: string;
}
interface KyberRoutes {
  code: number;
  message: string;
  data?: {
    routeSummary?: {
      amountIn: string;
      amountOut: string;
      gasUsd?: string;
      l1FeeUsd?: string;
      route: KyberHop[][];
    };
  };
}

const VENUE_NAMES: Array<[RegExp, string]> = [
  [/^uniswap-?v?4/i, "Uniswap v4"],
  [/^uniswap-?v?3/i, "Uniswap v3"],
  [/^uniswap/i, "Uniswap v2"],
  [/^aerodrome-cl|^slipstream/i, "Aerodrome Slipstream"],
  [/^aerodrome/i, "Aerodrome"],
  [/^pancake-?v?3/i, "PancakeSwap v3"],
  [/^pancake/i, "PancakeSwap"],
  [/^sushi/i, "SushiSwap"],
  [/^ramses/i, "Ramses"],
  [/^curve/i, "Curve"],
  [/^pmm|prop$|^elfomofi|^native|^hashflow|^bebop|^clipper/i, "Market maker"],
];

/** A pool's page on DexScreener, which lists pools on every chain the site covers. */
function poolUrl(chain: ChainId, pool: string): string | null {
  const slug = CHAINS[chain].dexscreener;
  if (!slug) return null;
  return `https://dexscreener.com/${slug}/${CHAINS[chain].kind === "evm" ? pool.toLowerCase() : pool}`;
}

function kyberVenue(exchange: string): string {
  for (const [pattern, name] of VENUE_NAMES) if (pattern.test(exchange)) return name;
  return exchange.replace(/[-_]+/g, " ").replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

async function kyber(chain: ChainId, token: string, decimals: number, amountUsd: number): Promise<Quote> {
  const info = CHAINS[chain];
  const stable = info.quoteStable!;
  const url =
    `https://aggregator-api.kyberswap.com/${info.kyber}/api/v1/routes` +
    `?tokenIn=${stable.address}&tokenOut=${token}&amountIn=${toRaw(amountUsd, stable.decimals)}`;
  const body = await fetchJson<KyberRoutes>(url, {
    timeoutMs: 4_500,
    retries: 1,
    headers: { "x-client-id": kyberClientId() },
  });
  const summary = body.data?.routeSummary;
  if (body.code !== 0 || !summary) throw new Error(body.message || "no route found");

  const tokensOut = scaled(BigInt(summary.amountOut), decimals);
  if (!(tokensOut > 0)) throw new Error("the route returns nothing");
  const fee = Number(summary.gasUsd ?? NaN) + Number(summary.l1FeeUsd ?? 0);
  // The route is a web of swaps, some through other assets. The pools that
  // matter to the buyer are the ones that hand over the token itself.
  const hops = summary.route.flat();
  const last = hops.filter((hop) => hop.tokenOut.toLowerCase() === token.toLowerCase());
  return {
    aggregator: "KyberSwap",
    paidSymbol: stable.symbol,
    paidAmount: amountUsd,
    tokensOut,
    pricePerToken: amountUsd / tokensOut,
    networkFeeUsd: Number.isFinite(fee) ? fee : null,
    networkFeeEstimated: false,
    fills: toFills(
      last.map((hop) => ({
        venue: kyberVenue(hop.exchange),
        pool: hop.pool,
        poolIsAddress: /^0x[0-9a-f]{40,64}$/i.test(hop.pool),
        url: /^0x[0-9a-f]{40,64}$/i.test(hop.pool) ? poolUrl(chain, hop.pool) : null,
        amount: Number(hop.amountOut),
      })),
    ),
    direct: last.every((hop) => hop.tokenIn.toLowerCase() === stable.address.toLowerCase()),
    quotedAt: new Date().toISOString(),
  };
}

interface JupiterQuote {
  outAmount?: string;
  routePlan?: Array<{
    swapInfo: { ammKey: string; label: string; inputMint: string; outputMint: string; outAmount: string };
    percent: number;
  }>;
  error?: string;
}

// A Solana swap costs a base fee plus a small priority fee: well under a cent.
const SOLANA_FEE_USD = 0.01;

async function jupiter(token: string, decimals: number, amountUsd: number): Promise<Quote> {
  const stable = CHAINS.solana.quoteStable!;
  const jup = jupiterEndpoint();
  const url =
    `${jup.base}/quote?inputMint=${stable.address}&outputMint=${token}` +
    `&amount=${toRaw(amountUsd, stable.decimals)}&slippageBps=50`;
  const body = await fetchJson<JupiterQuote>(url, { timeoutMs: 4_500, retries: 1, headers: jup.headers }).catch((error: unknown) => {
    // Jupiter answers 400 when nothing can fill the order.
    if (error instanceof HttpError && error.status === 400) throw new Error("no route found");
    throw error;
  });
  if (!body.outAmount) throw new Error(body.error || "no route found");
  const tokensOut = scaled(BigInt(body.outAmount), decimals);
  if (!(tokensOut > 0)) throw new Error("the route returns nothing");

  const last = (body.routePlan ?? []).filter((step) => step.swapInfo.outputMint === token);
  return {
    aggregator: "Jupiter",
    paidSymbol: stable.symbol,
    paidAmount: amountUsd,
    tokensOut,
    pricePerToken: amountUsd / tokensOut,
    networkFeeUsd: SOLANA_FEE_USD,
    networkFeeEstimated: true,
    fills: toFills(
      last.map((step) => ({
        venue: step.swapInfo.label,
        pool: step.swapInfo.ammKey,
        poolIsAddress: true,
        url: poolUrl("solana", step.swapInfo.ammKey),
        amount: Number(step.swapInfo.outAmount),
      })),
    ),
    direct: last.every((step) => step.swapInfo.inputMint === stable.address),
    quotedAt: new Date().toISOString(),
  };
}

export function canQuote(chain: ChainId): boolean {
  const info = CHAINS[chain];
  return Boolean(info.quoteStable && (info.kind === "solana" || info.kyber));
}

/** The best route to buy `amountUsd` of a token with the chain's dollar stablecoin. */
export async function loadQuote(chain: ChainId, token: string, decimals: number, amountUsd: number): Promise<QuoteResult> {
  if (!canQuote(chain)) return { ok: false, reason: "No swap aggregator covers this chain yet." };
  const key = `quote:${chain}:${token.toLowerCase()}:${amountUsd}`;
  try {
    const read = await cached(key, { ttlMs: 20 * SECOND, staleMs: 0, serveExpiredOnError: false }, () =>
      CHAINS[chain].kind === "solana" ? jupiter(token, decimals, amountUsd) : kyber(chain, token, decimals, amountUsd),
    );
    return { ok: true, quote: read.value };
  } catch (error) {
    const message = errorMessage(error);
    return { ok: false, reason: /route|not found|liquidity/i.test(message) ? "No route with enough liquidity." : message };
  }
}
