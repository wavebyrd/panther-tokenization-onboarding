// Getting from "this venue has the best price" to actually holding the token.
// Everything here is a link or a fact the buyer needs on the way: where to get
// the stablecoin on that chain, how to set a wallet up for it, and a swap that
// opens with the right pair already chosen.
//
// These are hand-offs to other apps. The site itself never connects to a
// wallet or sends a transaction; the buyer confirms every step themselves.

import { CHAINS, FEE_COIN, type ChainId } from "../chains";
import { IS_BROWSER } from "../connections";
import { loadOnramps } from "../onramps";

export interface SwapLink {
  /** The app that opens, which is the one that found the quoted route. */
  app: string;
  url: string;
}

export interface FundingSource {
  id: string;
  name: string;
  kindLabel: string;
  url: string;
}

export interface Handoff {
  swap: SwapLink | null;
  wallet: {
    /** What kind of wallet the chain needs, in plain words. */
    needs: string;
    /** A page that adds the network to a wallet; null where none is needed. */
    setupUrl: string | null;
    chainId: number | null;
    /** The coin fees are paid in. */
    feeCoin: string;
  };
  funding: {
    symbol: string;
    /** On-ramps that deliver the coin on this chain; null when the list could not be read. */
    direct: FundingSource[] | null;
    /** Moves stablecoins held on another chain over to this one. */
    bridgeUrl: string | null;
  };
}

// LI.FI's id for Solana, which has no EVM chain id of its own.
const LIFI_SOLANA = 1151111081099710;

function swapLink(chain: ChainId, token: string): SwapLink | null {
  const info = CHAINS[chain];
  const stable = info.quoteStable;
  if (!stable) return null;
  if (info.kind === "solana") {
    return { app: "Jupiter", url: `https://jup.ag/swap?sell=${stable.address}&buy=${token}` };
  }
  if (info.kyber) {
    return { app: "KyberSwap", url: `https://kyberswap.com/swap/${info.kyber}/${stable.address}-to-${token}` };
  }
  return null;
}

function bridgeLink(chain: ChainId): string | null {
  const info = CHAINS[chain];
  const stable = info.quoteStable;
  const id = info.kind === "solana" ? LIFI_SOLANA : info.evmChainId;
  if (!stable || id === undefined) return null;
  return `https://jumper.xyz/?toChain=${id}&toToken=${stable.address}`;
}

/** Gives up on a slow read rather than holding the page for it. */
function within<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([promise, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

/** On-ramps that can deliver `symbol` on `chain`, exchanges first. */
async function directSources(chain: ChainId, symbol: string): Promise<FundingSource[] | null> {
  // Exchange listing APIs do not answer browsers; the swap and bridge links still work there.
  if (IS_BROWSER) return null;
  const read = await within(
    loadOnramps().catch(() => null),
    2_500,
  );
  if (!read) return null;
  return read.value
    .filter((provider) => provider.status === "live")
    .filter((provider) =>
      provider.offers.some(
        (offer) =>
          offer.symbol.toUpperCase() === symbol.toUpperCase() &&
          offer.networks?.some((network) => network.chain === chain && network.enabled),
      ),
    )
    .sort((a, b) => Number(a.kind === "direct") - Number(b.kind === "direct"))
    .map((provider) => ({ id: provider.id, name: provider.name, kindLabel: provider.kindLabel, url: provider.url }));
}

/** Loaded once per lookup and shared by its venues, since several sit on the same chain. */
export function handoffBuilder() {
  const funding = new Map<string, Promise<FundingSource[] | null>>();
  return async function build(chain: ChainId, token: string): Promise<Handoff> {
    const info = CHAINS[chain];
    const symbol = info.quoteStable?.symbol ?? "USDC";
    const key = `${chain}:${symbol}`;
    if (!funding.has(key)) funding.set(key, directSources(chain, symbol));
    return {
      swap: swapLink(chain, token),
      wallet:
        info.kind === "solana"
          ? { needs: "A Solana wallet", setupUrl: null, chainId: null, feeCoin: FEE_COIN[chain] }
          : {
              needs: "An Ethereum-style wallet",
              setupUrl: info.evmChainId !== undefined ? `https://chainlist.org/chain/${info.evmChainId}` : null,
              chainId: info.evmChainId ?? null,
              feeCoin: FEE_COIN[chain],
            },
      funding: { symbol, direct: await funding.get(key)!, bridgeUrl: bridgeLink(chain) },
    };
  };
}
