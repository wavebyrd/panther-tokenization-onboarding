// How many shares one token stands for. Issuers fold dividends and splits
// into this number instead of paying them out, so a token can be worth more
// (or, after a split, several times more) than one share. Comparing token
// prices across issuers without it is comparing different things.
//
// Read from where each issuer publishes it:
//   Robinhood  its catalog (already on the listing)
//   xStocks    the token's Solana mint
//   Ondo       the token's Solana mint
// A multiplier that cannot be read stays null; it is never assumed to be 1.

import { cached, HOUR, SECOND, type Cached } from "../cache";
import { rpc, readCalls, scaled, toBigInt, type Call } from "../evm";
import { fetchJson } from "../http";
import type { ChainId } from "../chains";

export const ONDO_MINT_AUTHORITY = "9foMHsSDq7nMg4WPusSz9eY7tyxyukqborA8GyU5cUxD";
export const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

export interface MintFacts {
  decimals: number;
  program: string;
  mintAuthority: string | null;
  /** Shares per token in effect now; null when the mint carries none. */
  multiplier: number | null;
}

interface ParsedMint {
  owner?: string;
  data?: {
    parsed?: {
      info?: {
        decimals?: number;
        mintAuthority?: string | null;
        extensions?: Array<{
          extension: string;
          state?: { multiplier?: string; newMultiplier?: string; newMultiplierEffectiveTimestamp?: number };
        }>;
      };
    };
  };
}

function mintFacts(account: ParsedMint | null): MintFacts | null {
  const info = account?.data?.parsed?.info;
  if (!account?.owner || typeof info?.decimals !== "number") return null;
  const scaledUi = info.extensions?.find((item) => item.extension === "scaledUiAmountConfig")?.state;
  let multiplier: number | null = null;
  if (scaledUi) {
    // A scheduled change takes over once its start time has passed.
    const due = (scaledUi.newMultiplierEffectiveTimestamp ?? Infinity) <= Date.now() / 1000;
    const value = Number(due ? scaledUi.newMultiplier : scaledUi.multiplier);
    if (Number.isFinite(value) && value > 0) multiplier = value;
  }
  return { decimals: info.decimals, program: account.owner, mintAuthority: info.mintAuthority ?? null, multiplier };
}

/** Facts read from each Solana mint account; null for a mint that could not be read. */
export async function loadMints(mints: readonly string[]): Promise<Map<string, MintFacts | null>> {
  const out = new Map<string, MintFacts | null>();
  await Promise.all(
    mints.map(async (mint) => {
      try {
        const read = await cached(`solana-mint:${mint}`, { ttlMs: HOUR, staleMs: 24 * HOUR }, async () => {
          const result = (await rpc("solana", "getAccountInfo", [mint, { encoding: "jsonParsed" }])) as {
            value?: ParsedMint | null;
          };
          const facts = mintFacts(result.value ?? null);
          if (!facts) throw new Error("mint account could not be parsed");
          return facts;
        });
        out.set(mint, read.value);
      } catch {
        out.set(mint, null);
      }
    }),
  );
  return out;
}

interface JupiterToken {
  id: string;
  symbol: string;
  decimals: number;
  tokenProgram?: string;
  mintAuthority?: string | null;
}

/**
 * Ondo's Solana mint for one of its tokens. Ondo's published list covers only
 * Ethereum and BNB Chain, so the mint is found by symbol and then accepted
 * only if the account itself shows Ondo controls it.
 */
export async function findOndoMint(symbol: string): Promise<Cached<string | null>> {
  return cached(`ondo-mint:${symbol}`, { ttlMs: 24 * HOUR, staleMs: 7 * 24 * HOUR }, async () => {
    const found = await fetchJson<JupiterToken[]>(
      `https://lite-api.jup.ag/tokens/v2/search?query=${encodeURIComponent(symbol)}`,
      { timeoutMs: 4_000, retries: 1 },
    );
    const match = found.find(
      (token) =>
        token.symbol === symbol && token.tokenProgram === TOKEN_2022 && token.mintAuthority === ONDO_MINT_AUTHORITY,
    );
    return match?.id ?? null;
  });
}

const DECIMALS = "313ce567";
const LATEST_ROUND = "feaf968c";
// multiplier(): Coinbase's tokens on Base answer this with an 18-decimal
// number, read as exactly 1 for every token on 2026-09-28.
const MULTIPLIER = "1b3ed722";

/** Shares per token from a contract that publishes `multiplier()`; null when it does not answer sanely. */
export async function loadContractMultiplier(chain: ChainId, address: string): Promise<number | null> {
  try {
    const read = await cached(`multiplier:${chain}:${address.toLowerCase()}`, { ttlMs: HOUR, staleMs: 6 * HOUR }, async () => {
      const result = (await rpc(chain, "eth_call", [{ to: address, data: `0x${MULTIPLIER}` }, "latest"])) as string;
      const value = scaled(BigInt(result), 18);
      // A split can move this a long way, but not outside these bounds.
      if (!Number.isFinite(value) || value < 0.001 || value > 1000) throw new Error("multiplier read was not a sane number");
      return value;
    });
    return read.value;
  } catch {
    return null;
  }
}

/** A token's decimals read from its contract; null when the read fails. */
export async function loadDecimals(chain: ChainId, address: string): Promise<number | null> {
  try {
    const read = await cached(`decimals:${chain}:${address.toLowerCase()}`, { ttlMs: 24 * HOUR, staleMs: 30 * 24 * HOUR }, async () => {
      const result = (await rpc(chain, "eth_call", [{ to: address, data: `0x${DECIMALS}` }, "latest"])) as string;
      const value = Number(BigInt(result));
      if (!Number.isInteger(value) || value < 0 || value > 36) throw new Error("decimals read was not a sane number");
      return value;
    });
    return read.value;
  } catch {
    return null;
  }
}

export interface FeedPrice {
  price: number;
  updatedAt: string;
}

/** The latest answer from a Chainlink price feed; null when it cannot be read or is malformed. */
export async function loadFeedPrice(chain: ChainId, feed: string): Promise<FeedPrice | null> {
  try {
    const read = await cached(`feed:${chain}:${feed.toLowerCase()}`, { ttlMs: 30 * SECOND, staleMs: 10 * 60 * SECOND }, async () => {
      const calls: Call[] = [
        { target: feed, data: LATEST_ROUND },
        { target: feed, data: DECIMALS },
      ];
      const [round, decimals] = await readCalls(chain, calls);
      if (!round || round.length < 5 || !decimals) throw new Error("feed did not answer");
      // latestRoundData: roundId, answer, startedAt, updatedAt, answeredInRound.
      const answer = toBigInt(round[1]);
      const complete = toBigInt(round[4]) >= toBigInt(round[0]);
      const updatedAt = Number(toBigInt(round[3]));
      if (!complete || answer <= 0n || answer >= 2n ** 255n || !(updatedAt > 0)) throw new Error("feed answer was not valid");
      return {
        price: scaled(answer, Number(toBigInt(decimals[0]))),
        updatedAt: new Date(updatedAt * 1000).toISOString(),
      };
    });
    return read.value;
  } catch {
    return null;
  }
}
