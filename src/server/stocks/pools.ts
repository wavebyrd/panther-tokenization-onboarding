// The liquidity pools a token trades in, from DexScreener. These are
// indicative: a pool's displayed price and size say where trading happens, not
// what a given order will actually fill at. The executable number comes from
// the swap quote (quotes.ts).

import { cached, SECOND } from "../cache";
import { chainFromDexscreener, type ChainId } from "../chains";
import { fetchJson } from "../http";
import { STABLECOIN_CONTRACTS } from "@/data/stablecoin-contracts";

export type CounterKind = "dollar" | "major" | "other";

export interface Pool {
  address: string;
  chain: ChainId;
  /** The exchange, e.g. "Uniswap v4". */
  venue: string;
  /** The asset on the other side of the pool. */
  counterSymbol: string;
  counterKind: CounterKind;
  /** The token's price in this pool, in dollars. */
  priceUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  trades24h: number | null;
  url: string;
}

interface DexPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  labels?: string[];
  baseToken: { address: string; symbol: string };
  quoteToken: { address: string; symbol: string };
  priceNative?: string;
  priceUsd?: string;
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  txns?: { h24?: { buys?: number; sells?: number } };
}

const stableKey = (chain: string, address: string) =>
  `${chain}|${address.startsWith("0x") ? address.toLowerCase() : address}`;
const DOLLARS = new Set(STABLECOIN_CONTRACTS.map((row) => stableKey(row.chain, row.address)));
// Labelling only: a pool against one of these is a normal market, not a meme pair.
const MAJORS = new Set(["WETH", "ETH", "SOL", "WSOL", "WBNB", "BNB", "CBBTC", "WBTC"]);

const VENUE_NAMES: Record<string, string> = {
  uniswap: "Uniswap",
  aerodrome: "Aerodrome",
  pancakeswap: "PancakeSwap",
  raydium: "Raydium",
  orca: "Orca",
  meteora: "Meteora",
  sushiswap: "SushiSwap",
  up: "up.",
  ramses: "Ramses",
  velodrome: "Velodrome",
  camelot: "Camelot",
  curve: "Curve",
};

function venueName(pair: DexPair): string {
  // Unlisted exchanges come through as a bare contract address.
  const known = VENUE_NAMES[pair.dexId] ?? (/^0x[0-9a-f]{40}$/i.test(pair.dexId) ? "Unlisted exchange" : titleCase(pair.dexId));
  const label = pair.labels?.find((item) => /^v\d|^cl|^wp|^dlmm|^clmm/i.test(item));
  return label ? `${known} ${label.toLowerCase().startsWith("v") ? label.toLowerCase() : label}` : known;
}

const titleCase = (value: string) => value.replace(/[-_]+/g, " ").replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
const finite = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

function toPool(pair: DexPair, chain: ChainId, token: string, evm: boolean): Pool | null {
  const same = (a: string, b: string) => (evm ? a.toLowerCase() === b.toLowerCase() : a === b);
  const isBase = same(pair.baseToken.address, token);
  const isQuote = same(pair.quoteToken.address, token);
  if (!isBase && !isQuote) return null;
  const counter = isBase ? pair.quoteToken : pair.baseToken;

  // DexScreener prices the pair's base token; when ours is the quote, derive it.
  const baseUsd = Number(pair.priceUsd);
  const baseInQuote = Number(pair.priceNative);
  let priceUsd: number | null = null;
  if (isBase && Number.isFinite(baseUsd) && baseUsd > 0) priceUsd = baseUsd;
  else if (isQuote && Number.isFinite(baseUsd) && Number.isFinite(baseInQuote) && baseInQuote > 0) {
    priceUsd = baseUsd / baseInQuote;
  }

  const trades = pair.txns?.h24;
  return {
    address: pair.pairAddress,
    chain,
    venue: venueName(pair),
    counterSymbol: counter.symbol,
    counterKind: DOLLARS.has(stableKey(chain, counter.address))
      ? "dollar"
      : MAJORS.has(counter.symbol.toUpperCase())
        ? "major"
        : "other",
    priceUsd,
    liquidityUsd: finite(pair.liquidity?.usd),
    volume24hUsd: finite(pair.volume?.h24),
    trades24h: trades ? (trades.buys ?? 0) + (trades.sells ?? 0) : null,
    url: pair.url,
  };
}

/**
 * Pools for one token address, across every chain that address exists on
 * (an issuer often reuses one address on many chains). Largest first.
 */
export async function loadPools(address: string): Promise<Pool[]> {
  const evm = address.startsWith("0x");
  const read = await cached(`pools:${evm ? address.toLowerCase() : address}`, { ttlMs: 60 * SECOND, staleMs: 10 * 60 * SECOND }, async () => {
    const body = await fetchJson<{ pairs?: DexPair[] | null }>(
      `https://api.dexscreener.com/latest/dex/tokens/${address}`,
      { timeoutMs: 4_500, retries: 0 },
    );
    const pools: Pool[] = [];
    for (const pair of body.pairs ?? []) {
      const chain = chainFromDexscreener(pair.chainId);
      if (!chain) continue;
      const pool = toPool(pair, chain.id, address, evm);
      if (pool) pools.push(pool);
    }
    return pools.sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0));
  });
  return read.value;
}
