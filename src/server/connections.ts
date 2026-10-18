// Where data comes from, and your own connections.
//
// The same engine runs two ways:
//
//   direct    on a server (npm run dev / start). Issuer catalogs are read from
//             each issuer, and you can plug in your own keys and endpoints.
//   panther   in a browser (the widget on pantherterminal.com), or on a server
//             with PTO_CATALOG=panther. Issuer catalogs and fund data come from
//             Panther Terminal's public API; quotes still come from the swap
//             aggregators directly. No server of ours is involved.
//
// Settings (server: plain env vars; browser build: the NEXT_PUBLIC_ / VITE_
// forms, or window.PANTHER_ONBOARDING passed by the page that embeds it):
//
//   PTO_CATALOG               direct (default on a server) or panther
//   PTO_PANTHER_API           Panther Terminal's API (default https://api.pantherterminal.com)
//   PTO_RPC_<CHAIN>           RPC URLs for a chain, comma-separated, tried before the public ones
//                             (for example PTO_RPC_ETHEREUM, PTO_RPC_BASE, PTO_RPC_ROBINHOOD)
//   PTO_JUPITER_API_KEY       a Jupiter API key; quotes then go to api.jup.ag instead of the free lite endpoint
//   PTO_KYBERSWAP_CLIENT_ID   the client id sent to KyberSwap's aggregator
//
// On a server, keys stay on the server. In a browser build, anything set is
// visible to every visitor, so only put keys there that are meant to be public.

import type { ChainId } from "./chains";

export const IS_BROWSER = typeof window !== "undefined";

/** Settings a page can pass when it embeds the widget. */
export interface EmbedConfig {
  pantherApi?: string;
  jupiterApiKey?: string;
  kyberClientId?: string;
  rpc?: Partial<Record<ChainId, string[]>>;
}

function embedConfig(): EmbedConfig {
  if (!IS_BROWSER) return {};
  return ((window as unknown as { PANTHER_ONBOARDING?: EmbedConfig }).PANTHER_ONBOARDING ?? {}) as EmbedConfig;
}

const env = (name: string): string | undefined => {
  if (typeof process === "undefined" || !process.env) return undefined;
  const value = (process.env[name] ?? process.env[`NEXT_PUBLIC_${name}`])?.trim();
  return value ? value : undefined;
};

export type CatalogMode = "direct" | "panther";

/** Browsers cannot read every issuer's catalog (some send no CORS headers), so they always use Panther's. */
export function catalogMode(): CatalogMode {
  if (IS_BROWSER) return "panther";
  return env("PTO_CATALOG") === "panther" ? "panther" : "direct";
}

/** RPC URLs the operator configured for `chain`, in order. */
export function ownRpc(chain: ChainId): string[] {
  const embedded = embedConfig().rpc?.[chain] ?? [];
  const raw = env(`PTO_RPC_${chain.toUpperCase()}`);
  const fromEnv = raw ? raw.split(",") : [];
  return [...embedded, ...fromEnv].map((url) => url.trim()).filter((url) => /^https?:\/\//.test(url));
}

export function jupiterEndpoint(): { base: string; headers: Record<string, string> } {
  const key = embedConfig().jupiterApiKey ?? env("PTO_JUPITER_API_KEY");
  return key
    ? { base: "https://api.jup.ag/swap/v1", headers: { "x-api-key": key } }
    : { base: "https://lite-api.jup.ag/swap/v1", headers: {} };
}

export function kyberClientId(): string {
  return embedConfig().kyberClientId ?? env("PTO_KYBERSWAP_CLIENT_ID") ?? "panther-tokenization-onboarding";
}

/** Panther Terminal's public API, which publishes the issuer catalogs and fund data this project reads. */
export function pantherApi(): string {
  return (embedConfig().pantherApi ?? env("PTO_PANTHER_API") ?? "https://api.pantherterminal.com").replace(/\/+$/, "");
}

/** Which of your own connections are set, without revealing them. */
export function connectionSummary(): { mode: CatalogMode; ownRpcChains: string[]; jupiterKey: boolean; kyberClientId: boolean } {
  const names = typeof process !== "undefined" && process.env ? Object.keys(process.env) : [];
  const chains = names
    .filter((name) => name.startsWith("PTO_RPC_") && env(name))
    .map((name) => name.slice("PTO_RPC_".length).toLowerCase());
  return {
    mode: catalogMode(),
    ownRpcChains: chains,
    jupiterKey: Boolean(embedConfig().jupiterApiKey ?? env("PTO_JUPITER_API_KEY")),
    kyberClientId: Boolean(embedConfig().kyberClientId ?? env("PTO_KYBERSWAP_CLIENT_ID")),
  };
}
