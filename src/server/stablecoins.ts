// Vetted stablecoins: a reviewed profile (data/stablecoins.ts) joined with
// live size and peg from DefiLlama. Both must hold for a coin to be listed.

import { cached, MINUTE, type Cached } from "./cache";
import { chainFromLlama, type ChainId } from "./chains";
import { fetchJson } from "./http";
import {
  BACKING_LABEL,
  FUND_TOKENS,
  PROFILES_REVIEWED_ON,
  STABLECOIN_PROFILES,
  type Backing,
} from "@/data/stablecoins";

export const STABLECOIN_SOURCE = "https://stablecoins.llama.fi/stablecoins?includePrices=true";

/** The live checks a profiled coin must pass to be listed. */
export const STABLECOIN_RULES = {
  minSupplyUsd: 1_000_000_000,
  maxPegDeviation: 0.005,
  /** A chain is listed for a coin only when this much of it lives there. */
  minChainSupplyUsd: 25_000_000,
} as const;

interface LlamaAsset {
  id: string;
  name: string;
  symbol: string;
  pegType: string;
  pegMechanism: string | null;
  price: number | null;
  circulating?: { peggedUSD?: number };
  circulatingPrevWeek?: { peggedUSD?: number };
  circulatingPrevMonth?: { peggedUSD?: number };
  chainCirculating?: Record<string, { current?: { peggedUSD?: number } }>;
}

export interface ChainSupply {
  chain: ChainId | null;
  /** The chain's name; as the source gives it for chains outside the site's registry. */
  label: string;
  supplyUsd: number;
  share: number;
}

export interface Stablecoin {
  symbol: string;
  name: string;
  issuer: string;
  launched: number;
  backing: Backing;
  backingLabel: string;
  backingExplainer: string;
  backingSummary: string;
  redemption: string;
  watchFor: string[];
  site: string;
  reservesUrl: string | null;
  supplyUsd: number;
  supplyChange30d: number | null;
  /** Market price in dollars; null when the source has none. */
  price: number | null;
  /** Absolute distance from $1, as a fraction. */
  pegDeviation: number | null;
  chains: ChainSupply[];
}

export interface ExcludedCoin {
  symbol: string;
  name: string;
  supplyUsd: number;
  reason: string;
}

export interface StablecoinReport {
  coins: Stablecoin[];
  /** Large dollar tokens that are deliberately not listed, and why. */
  excluded: ExcludedCoin[];
  rules: typeof STABLECOIN_RULES;
  profilesReviewedOn: string;
}

function buildReport(assets: LlamaAsset[]): StablecoinReport {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const coins: Stablecoin[] = [];
  const excluded: ExcludedCoin[] = [];
  const profiled = new Set<string>();

  for (const profile of STABLECOIN_PROFILES) {
    profiled.add(profile.llamaId);
    const live = byId.get(profile.llamaId);
    const supplyUsd = live?.circulating?.peggedUSD ?? 0;
    const price = typeof live?.price === "number" && Number.isFinite(live.price) ? live.price : null;
    const pegDeviation = price === null ? null : Math.abs(price - 1);

    if (!live) {
      excluded.push({ symbol: profile.symbol, name: profile.name, supplyUsd: 0, reason: "No live supply data right now." });
      continue;
    }
    if (supplyUsd < STABLECOIN_RULES.minSupplyUsd) {
      excluded.push({
        symbol: profile.symbol,
        name: profile.name,
        supplyUsd,
        reason: `Supply is below the $${STABLECOIN_RULES.minSupplyUsd / 1e9}B minimum.`,
      });
      continue;
    }
    if (pegDeviation !== null && pegDeviation > STABLECOIN_RULES.maxPegDeviation) {
      excluded.push({
        symbol: profile.symbol,
        name: profile.name,
        supplyUsd,
        reason: `Trading ${(pegDeviation * 100).toFixed(2)}% away from $1, outside the ${STABLECOIN_RULES.maxPegDeviation * 100}% limit.`,
      });
      continue;
    }

    const chains: ChainSupply[] = Object.entries(live.chainCirculating ?? {})
      .map(([label, value]) => {
        const known = chainFromLlama(label);
        return {
          chain: known?.id ?? null,
          label: known?.name ?? label,
          supplyUsd: value.current?.peggedUSD ?? 0,
          share: supplyUsd > 0 ? (value.current?.peggedUSD ?? 0) / supplyUsd : 0,
        };
      })
      .filter((row) => row.supplyUsd >= STABLECOIN_RULES.minChainSupplyUsd)
      .sort((a, b) => b.supplyUsd - a.supplyUsd);

    const monthAgo = live.circulatingPrevMonth?.peggedUSD;
    coins.push({
      symbol: profile.symbol,
      name: profile.name,
      issuer: profile.issuer,
      launched: profile.launched,
      backing: profile.backing,
      backingLabel: BACKING_LABEL[profile.backing].label,
      backingExplainer: BACKING_LABEL[profile.backing].explainer,
      backingSummary: profile.backingSummary,
      redemption: profile.redemption,
      watchFor: profile.watchFor,
      site: profile.site,
      reservesUrl: profile.reservesUrl ?? null,
      supplyUsd,
      supplyChange30d: monthAgo && monthAgo > 0 ? supplyUsd / monthAgo - 1 : null,
      price,
      pegDeviation,
      chains,
    });
  }

  // Everything else large and dollar-pegged, named so the omission is visible.
  for (const asset of assets) {
    if (profiled.has(asset.id) || asset.pegType !== "peggedUSD") continue;
    const supplyUsd = asset.circulating?.peggedUSD ?? 0;
    if (supplyUsd < STABLECOIN_RULES.minSupplyUsd) continue;
    excluded.push({
      symbol: asset.symbol,
      name: asset.name,
      supplyUsd,
      reason:
        FUND_TOKENS[asset.id] ??
        (asset.pegMechanism === "algorithmic"
          ? "Algorithmic stablecoins are not listed."
          : "Not reviewed yet, so it is not listed."),
    });
  }

  coins.sort((a, b) => b.supplyUsd - a.supplyUsd);
  excluded.sort((a, b) => b.supplyUsd - a.supplyUsd);
  return { coins, excluded, rules: STABLECOIN_RULES, profilesReviewedOn: PROFILES_REVIEWED_ON };
}

export async function loadStablecoins(): Promise<Cached<StablecoinReport>> {
  return cached("stablecoins", { ttlMs: 10 * MINUTE }, async () => {
    const body = await fetchJson<{ peggedAssets?: LlamaAsset[] }>(STABLECOIN_SOURCE, { timeoutMs: 20_000 });
    if (!body.peggedAssets?.length) throw new Error("stablecoin list came back empty");
    return buildReport(body.peggedAssets);
  });
}
