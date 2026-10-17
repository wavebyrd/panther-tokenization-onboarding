// Where a vetted stablecoin can earn interest. Rates come from DefiLlama's
// yields feed; what is allowed through is decided here:
//
//   1. the protocol has a reviewed profile (data/protocols.ts),
//   2. the protocol passes live size and age checks,
//   3. the pool holds one vetted stablecoin, matched by contract address,
//   4. the pool is big enough and its rate is believable.
//
// Rates are annual percentages as the source reports them (3.5 means 3.5%).

import { cached, HOUR, MINUTE, type Cached } from "./cache";
import { chainFromLlama, type ChainId } from "./chains";
import { fetchJson } from "./http";
import { loadMorphoVaults, matchVault, warningText, MORPHO_API, type MorphoVault } from "./morpho";
import { loadStablecoins } from "./stablecoins";
import { KIND_LABEL, PROTOCOLS, PROTOCOLS_REVIEWED_ON, RISK_LABEL, type ProtocolKind, type RiskLevel } from "@/data/protocols";
import { STABLECOIN_CONTRACTS } from "@/data/stablecoin-contracts";

export const YIELDS_SOURCE = "https://yields.llama.fi/pools";
export const PROTOCOLS_SOURCE = "https://api.llama.fi/protocols";

export const YIELD_RULES = {
  minProtocolTvlUsd: 100_000_000,
  minProtocolAgeDays: 365,
  minPoolTvlUsd: 10_000_000,
  /** Above this a stablecoin rate is more likely an error or a short-lived incentive. */
  maxApy: 25,
  /** A rate this far above its own 30-day average is flagged as a spike. */
  spikeRatio: 1.5,
  /** Rewards making up more than this share of the rate are called out. */
  rewardShare: 0.5,
} as const;

interface LlamaPool {
  pool: string;
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  apy: number | null;
  apyBase: number | null;
  apyReward: number | null;
  apyMean30d: number | null;
  rewardTokens: string[] | null;
  underlyingTokens: string[] | null;
  poolMeta: string | null;
  stablecoin: boolean;
  exposure: string;
  ilRisk: string;
  outlier: boolean;
}

interface LlamaProtocol {
  slug: string;
  name: string;
  tvl: number | null;
  listedAt?: number;
}

export type FlagTone = "info" | "caution";

export interface YieldFlag {
  id: "rewards" | "spike" | "managed" | "variant" | "symbol-match" | "credit" | "synthetic" | "protocol-warning";
  tone: FlagTone;
  label: string;
  detail: string;
}

export interface YieldOpportunity {
  id: string;
  asset: string;
  /** Set when the pool holds a bridged or wrapped form of the asset. */
  assetVariant: string | null;
  chain: ChainId;
  chainName: string;
  protocol: string;
  protocolName: string;
  protocolKind: ProtocolKind;
  protocolKindLabel: string;
  protocolUrl: string;
  how: string;
  watchFor: string;
  risk: RiskLevel;
  riskLabel: string;
  /** The pool's own name where the protocol has several for one asset (a vault, a market). */
  poolName: string | null;
  /** Who decides where a managed vault's deposits go. */
  managers: string[];
  /** True when more than half the rate is paid in reward tokens rather than interest. */
  mostlyRewards: boolean;
  apy: number;
  apyBase: number | null;
  apyReward: number | null;
  apy30d: number | null;
  tvlUsd: number;
  protocolTvlUsd: number;
  /** Years since the protocol was first tracked; null when it predates tracking. */
  protocolAgeYears: number | null;
  flags: YieldFlag[];
  sourceUrl: string;
}

export interface SkippedProtocol {
  name: string;
  reason: string;
}

export interface YieldReport {
  opportunities: YieldOpportunity[];
  assets: string[];
  chains: Array<{ id: ChainId; name: string }>;
  skippedProtocols: SkippedProtocol[];
  rules: typeof YIELD_RULES;
  riskLevels: Array<{ level: RiskLevel; label: string; explainer: string }>;
  protocolsReviewedOn: string;
}

const contractKey = (chain: string, address: string) =>
  `${chain}|${address.startsWith("0x") ? address.toLowerCase() : address}`;

const CONTRACTS = new Map(STABLECOIN_CONTRACTS.map((row) => [contractKey(row.chain, row.address), row]));

const usd = (value: number) =>
  value >= 1e9 ? `$${(value / 1e9).toFixed(1)}B` : `$${Math.round(value / 1e6)}M`;

const MORPHO = "morpho-blue";

function buildReport(
  pools: LlamaPool[],
  protocols: LlamaProtocol[],
  vetted: Map<string, { symbol: string; synthetic: boolean }>,
  /** Morpho's vault list; null when it could not be read. */
  vaults: MorphoVault[] | null,
): YieldReport {
  const live = new Map(protocols.map((protocol) => [protocol.slug, protocol]));
  const now = Date.now() / 1000;
  const skippedProtocols: SkippedProtocol[] = [];
  const passing = new Map<string, { tvl: number; ageYears: number | null }>();
  let vaultsHeldBack = 0;

  for (const profile of PROTOCOLS) {
    const protocol = live.get(profile.slug);
    const tvl = protocol?.tvl ?? 0;
    if (!protocol) {
      skippedProtocols.push({ name: profile.name, reason: "No live data for it right now." });
      continue;
    }
    if (tvl < YIELD_RULES.minProtocolTvlUsd) {
      skippedProtocols.push({
        name: profile.name,
        reason: `Holds ${usd(tvl)}, under the ${usd(YIELD_RULES.minProtocolTvlUsd)} minimum.`,
      });
      continue;
    }
    // Protocols without a listing date were tracked before dates were kept, so they are the oldest.
    const ageDays = protocol.listedAt ? (now - protocol.listedAt) / 86_400 : null;
    if (ageDays !== null && ageDays < YIELD_RULES.minProtocolAgeDays) {
      skippedProtocols.push({
        name: profile.name,
        reason: `Launched ${Math.round(ageDays / 30)} months ago; protocols need a year of history.`,
      });
      continue;
    }
    // Morpho's vaults are vetted one by one against its own list; without the list, none can be.
    if (profile.slug === MORPHO && !vaults) {
      skippedProtocols.push({ name: profile.name, reason: "Its vault list could not be read, so its vaults could not be checked." });
      continue;
    }
    passing.set(profile.slug, { tvl, ageYears: ageDays === null ? null : ageDays / 365 });
  }

  const opportunities: YieldOpportunity[] = [];
  for (const pool of pools) {
    const profile = PROTOCOLS.find((item) => item.slug === pool.project);
    const standing = profile && passing.get(profile.slug);
    if (!profile || !standing) continue;
    const chain = chainFromLlama(pool.chain);
    if (!chain) continue;
    if (!pool.stablecoin || pool.exposure !== "single" || pool.ilRisk !== "no" || pool.outlier) continue;
    if (!(pool.tvlUsd >= YIELD_RULES.minPoolTvlUsd)) continue;
    const apy = pool.apy;
    if (apy === null || !Number.isFinite(apy) || apy <= 0 || apy > YIELD_RULES.maxApy) continue;

    // Which stablecoin the pool holds: by contract first, by exact symbol only as a fallback.
    const tokens = pool.underlyingTokens ?? [];
    const matches = tokens.map((token) => CONTRACTS.get(contractKey(chain.id, token)));
    let asset: string | null = null;
    let assetVariant: string | null = null;
    let matchedBySymbol = false;
    if (tokens.length === 1 && matches[0]) {
      asset = matches[0].symbol;
      assetVariant = matches[0].variant;
    } else if (tokens.length === 0 || matches.every((match) => !match)) {
      const known = vetted.get(pool.symbol.toUpperCase());
      // Only trusted where the chain has no address book at all to contradict it.
      const chainHasBook = STABLECOIN_CONTRACTS.some((row) => row.chain === chain.id);
      if (known && (tokens.length === 0 || !chainHasBook)) {
        asset = known.symbol;
        matchedBySymbol = true;
      }
    }
    if (!asset) continue;
    const coin = vetted.get(asset.toUpperCase());
    if (!coin) continue;

    const flags: YieldFlag[] = [];

    // A Morpho vault must be one Morpho lists, with nothing it has marked serious.
    let vault: MorphoVault | null = null;
    if (profile.slug === MORPHO) {
      vault = matchVault(vaults!, chain.id, pool.symbol, pool.tvlUsd);
      if (!vault || !vault.listed || vault.warnings.some((warning) => warning.level === "RED")) {
        vaultsHeldBack += 1;
        continue;
      }
      for (const warning of vault.warnings) {
        flags.push({ id: "protocol-warning", tone: "caution", label: "Morpho warning", detail: warningText(warning.type) });
      }
    }

    const reward = pool.apyReward ?? 0;
    if (reward > 0 && reward / apy > YIELD_RULES.rewardShare) {
      flags.push({
        id: "rewards",
        tone: "caution",
        label: "Mostly rewards",
        detail: `${reward.toFixed(2)}% of this rate is paid in reward tokens, which can shrink or stop at any time.`,
      });
    } else if (reward > 0) {
      flags.push({
        id: "rewards",
        tone: "info",
        label: "Includes rewards",
        detail: `${reward.toFixed(2)}% of this rate is paid in reward tokens rather than interest.`,
      });
    }
    if (pool.apyMean30d && pool.apyMean30d > 0 && apy / pool.apyMean30d > YIELD_RULES.spikeRatio) {
      flags.push({
        id: "spike",
        tone: "caution",
        label: "Above its average",
        detail: `Today's rate is well above the ${pool.apyMean30d.toFixed(2)}% it averaged over the last 30 days.`,
      });
    }
    if (profile.kind === "vault") {
      const by = vault?.managers.length ? `Managed by ${vault.managers.join(" and ")}. ` : "";
      flags.push({ id: "managed", tone: "info", label: "Managed", detail: `${by}${profile.watchFor}` });
    }
    if (profile.kind === "credit") {
      flags.push({ id: "credit", tone: "caution", label: "Company lending", detail: profile.watchFor });
    }
    // A protocol's own "expert" tier is riskier than its standard product, whatever the protocol's grouping.
    const expert = /expert/i.test(pool.poolMeta ?? "");
    if (expert) {
      flags.push({
        id: "protocol-warning",
        tone: "caution",
        label: "Expert tier",
        detail: `${profile.name} marks this as its expert option: it takes more risk than its standard rate to pay more.`,
      });
    }
    if (coin.synthetic) {
      flags.push({
        id: "synthetic",
        tone: "caution",
        label: "Synthetic dollar",
        detail: `${asset} holds its value through trading positions, not dollars in a bank.`,
      });
    }
    if (assetVariant) {
      flags.push({
        id: "variant",
        tone: "info",
        label: assetVariant === "bridged" ? "Bridged" : assetVariant,
        detail:
          assetVariant === "bridged"
            ? `This is ${asset} carried over from another chain by a bridge, which adds the bridge's own risk.`
            : `This pool holds the ${assetVariant} form of ${asset}.`,
      });
    }
    if (matchedBySymbol) {
      flags.push({
        id: "symbol-match",
        tone: "info",
        label: "Matched by name",
        detail: "The source did not give this pool's token address, so it was matched by its symbol.",
      });
    }

    opportunities.push({
      id: pool.pool,
      asset,
      assetVariant,
      chain: chain.id,
      chainName: chain.name,
      protocol: profile.slug,
      protocolName: profile.name,
      protocolKind: profile.kind,
      protocolKindLabel: KIND_LABEL[profile.kind],
      protocolUrl: profile.url,
      how: profile.how,
      watchFor: profile.watchFor,
      risk: expert && profile.risk === 1 ? 2 : profile.risk,
      riskLabel: RISK_LABEL[expert && profile.risk === 1 ? 2 : profile.risk].label,
      poolName: vault?.name ?? poolName(pool, asset),
      managers: vault?.managers ?? [],
      mostlyRewards: reward > 0 && reward / apy > YIELD_RULES.rewardShare,
      apy,
      apyBase: pool.apyBase,
      apyReward: pool.apyReward,
      apy30d: pool.apyMean30d,
      tvlUsd: pool.tvlUsd,
      protocolTvlUsd: standing.tvl,
      protocolAgeYears: standing.ageYears,
      flags,
      sourceUrl: `https://defillama.com/yields/pool/${pool.pool}`,
    });
  }

  if (vaultsHeldBack > 0) {
    skippedProtocols.push({
      name: `${vaultsHeldBack} Morpho vault${vaultsHeldBack === 1 ? "" : "s"}`,
      reason: "Not listed by Morpho, closed to deposits, or carrying a serious warning from Morpho.",
    });
  }

  opportunities.sort((a, b) => steadyRate(b) - steadyRate(a));
  const chainIds = [...new Set(opportunities.map((item) => item.chain))];
  return {
    opportunities,
    assets: [...new Set(opportunities.map((item) => item.asset))],
    chains: chainIds.map((id) => ({ id, name: opportunities.find((item) => item.chain === id)!.chainName })),
    skippedProtocols,
    rules: YIELD_RULES,
    riskLevels: ([1, 2, 3] as RiskLevel[]).map((level) => ({ level, ...RISK_LABEL[level] })),
    protocolsReviewedOn: PROTOCOLS_REVIEWED_ON,
  };
}

/** A vault or market name worth showing: the source's symbol when it is not just the asset. */
function poolName(pool: LlamaPool, asset: string): string | null {
  const parts: string[] = [];
  if (pool.symbol.toUpperCase() !== asset.toUpperCase()) parts.push(pool.symbol);
  if (pool.poolMeta) parts.push(pool.poolMeta);
  return parts.length ? parts.join(" · ") : null;
}

/** The rate to rank by: the lower of today's and the 30-day average, so a one-day spike cannot win. */
export function steadyRate(item: Pick<YieldOpportunity, "apy" | "apy30d">): number {
  return item.apy30d && item.apy30d > 0 ? Math.min(item.apy, item.apy30d) : item.apy;
}

async function loadProtocols(): Promise<Cached<LlamaProtocol[]>> {
  return cached("llama-protocols", { ttlMs: 6 * HOUR }, async () => {
    const body = await fetchJson<LlamaProtocol[]>(PROTOCOLS_SOURCE, { timeoutMs: 30_000 });
    if (!Array.isArray(body) || !body.length) throw new Error("protocol list came back empty");
    const wanted = new Set(PROTOCOLS.map((profile) => profile.slug));
    // Keep only what is needed; the full list is several megabytes.
    return body
      .filter((protocol) => wanted.has(protocol.slug))
      .map(({ slug, name, tvl, listedAt }) => ({ slug, name, tvl, listedAt }));
  });
}

export async function loadYields(): Promise<Cached<YieldReport>> {
  return cached("yields", { ttlMs: 10 * MINUTE }, async () => {
    const [pools, protocols, stablecoins, vaults] = await Promise.all([
      fetchJson<{ data?: LlamaPool[] }>(YIELDS_SOURCE, { timeoutMs: 30_000 }),
      loadProtocols(),
      loadStablecoins(),
      loadMorphoVaults().catch(() => null),
    ]);
    if (!pools.data?.length) throw new Error("yield list came back empty");
    const vetted = new Map(
      stablecoins.value.coins.map((coin) => [
        coin.symbol.toUpperCase(),
        { symbol: coin.symbol, synthetic: coin.backing === "synthetic" },
      ]),
    );
    return buildReport(pools.data, protocols.value, vetted, vaults?.value ?? null);
  });
}

export const YIELD_SOURCES = [
  { name: "DefiLlama yields", url: YIELDS_SOURCE },
  { name: "DefiLlama protocols", url: PROTOCOLS_SOURCE },
  { name: "Morpho vault list", url: MORPHO_API },
] as const;

export interface RatePoint {
  date: string;
  apy: number;
  tvlUsd: number;
}

/** Daily rate history for one pool, newest last. */
export async function loadYieldHistory(poolId: string): Promise<Cached<RatePoint[]>> {
  if (!/^[0-9a-f-]{36}$/i.test(poolId)) throw new Error("not a pool id");
  return cached(`yield-history:${poolId}`, { ttlMs: HOUR }, async () => {
    const body = await fetchJson<{ data?: Array<{ timestamp: string; apy: number | null; tvlUsd: number }> }>(
      `https://yields.llama.fi/chart/${poolId}`,
      { timeoutMs: 20_000 },
    );
    const byDay = new Map<string, RatePoint>();
    for (const point of body.data ?? []) {
      if (point.apy === null || !Number.isFinite(point.apy)) continue;
      const date = point.timestamp.slice(0, 10);
      byDay.set(date, { date, apy: point.apy, tvlUsd: point.tvlUsd });
    }
    return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  });
}
