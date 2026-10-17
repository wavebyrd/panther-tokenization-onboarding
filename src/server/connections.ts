// Your own connections. Every source works without a key, but free public
// endpoints are rate-limited, so anyone running this can plug in their own:
//
//   PTO_RPC_<CHAIN>           RPC URLs for a chain, comma-separated, tried before the public ones
//                             (for example PTO_RPC_ETHEREUM, PTO_RPC_BASE, PTO_RPC_ROBINHOOD)
//   PTO_JUPITER_API_KEY       a Jupiter API key; quotes then go to api.jup.ag instead of the free lite endpoint
//   PTO_KYBERSWAP_CLIENT_ID   the client id sent to KyberSwap's aggregator
//
// Keys are read on the server only and never sent to the browser.

import type { ChainId } from "./chains";

const env = (name: string): string | undefined => {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
};

/** RPC URLs the operator configured for `chain`, in order. */
export function ownRpc(chain: ChainId): string[] {
  const raw = env(`PTO_RPC_${chain.toUpperCase()}`);
  if (!raw) return [];
  return raw
    .split(",")
    .map((url) => url.trim())
    .filter((url) => /^https?:\/\//.test(url));
}

export function jupiterEndpoint(): { base: string; headers: Record<string, string> } {
  const key = env("PTO_JUPITER_API_KEY");
  return key
    ? { base: "https://api.jup.ag/swap/v1", headers: { "x-api-key": key } }
    : { base: "https://lite-api.jup.ag/swap/v1", headers: {} };
}

export function kyberClientId(): string {
  return env("PTO_KYBERSWAP_CLIENT_ID") ?? "panther-tokenization-onboarding";
}

/** Which of your own connections are set, without revealing them. For the status line on the page. */
export function connectionSummary(): { ownRpcChains: string[]; jupiterKey: boolean; kyberClientId: boolean } {
  const chains = Object.keys(process.env)
    .filter((name) => name.startsWith("PTO_RPC_") && env(name))
    .map((name) => name.slice("PTO_RPC_".length).toLowerCase());
  return { ownRpcChains: chains, jupiterKey: Boolean(env("PTO_JUPITER_API_KEY")), kyberClientId: Boolean(env("PTO_KYBERSWAP_CLIENT_ID")) };
}
