// Morpho's own record of its vaults: the vault's real name, who manages it,
// whether Morpho lists it in its app, and any warnings Morpho has raised.
// DefiLlama knows a vault only by its token symbol, so this is what turns
// "GTUSDCP" into "Gauntlet USDC Prime, managed by Gauntlet", and what keeps
// unlisted or flagged vaults off the site.

import { cached, MINUTE, type Cached } from "./cache";
import { chainFromEvmId, type ChainId } from "./chains";
import { fetchJson } from "./http";

export const MORPHO_API = "https://api.morpho.org/graphql";

export interface MorphoVault {
  chain: ChainId;
  address: string;
  symbol: string;
  name: string;
  managers: string[];
  listed: boolean;
  tvlUsd: number;
  /** Warnings Morpho itself attaches: "RED" blocks a listing here, "YELLOW" is shown. */
  warnings: Array<{ type: string; level: string }>;
}

interface Warning {
  type: string;
  level: string;
}
interface VaultV1 {
  address: string;
  symbol: string;
  name: string;
  listed: boolean;
  chain: { id: number };
  state?: { totalAssetsUsd?: number | null; curators?: Array<{ name: string }> | null } | null;
  warnings?: Warning[] | null;
}
interface VaultV2 {
  address: string;
  symbol: string;
  name: string;
  listed: boolean;
  chain: { id: number };
  totalAssetsUsd?: number | null;
  curators?: { items?: Array<{ name: string }> | null } | null;
  warnings?: Warning[] | null;
}

// Two queries: asked together they exceed the API's complexity limit.
const QUERY_V1 = `{ vaults(first: 300, where: { totalAssetsUsd_gte: 5000000 }) { items {
  address symbol name listed chain { id } state { totalAssetsUsd curators { name } } warnings { type level } } } }`;
const QUERY_V2 = `{ vaultV2s(first: 300, where: { totalAssetsUsd_gte: 5000000 }) { items {
  address symbol name listed chain { id } totalAssetsUsd curators { items { name } } warnings { type level } } } }`;

async function query<T>(text: string): Promise<T> {
  const body = await fetchJson<{ data?: T; errors?: Array<{ message: string }> }>(MORPHO_API, {
    method: "POST",
    body: { query: text },
    timeoutMs: 20_000,
  });
  if (!body.data) throw new Error(body.errors?.[0]?.message ?? "morpho returned no data");
  return body.data;
}

export async function loadMorphoVaults(): Promise<Cached<MorphoVault[]>> {
  return cached("morpho-vaults", { ttlMs: 30 * MINUTE }, async () => {
    const [v1, v2] = await Promise.all([
      query<{ vaults: { items: VaultV1[] } }>(QUERY_V1),
      query<{ vaultV2s: { items: VaultV2[] } }>(QUERY_V2),
    ]);
    const out: MorphoVault[] = [];
    const push = (
      vault: VaultV1 | VaultV2,
      tvlUsd: number | null | undefined,
      managers: Array<{ name: string }> | null | undefined,
    ) => {
      const chain = chainFromEvmId(vault.chain.id);
      if (!chain || typeof tvlUsd !== "number") return;
      out.push({
        chain: chain.id,
        address: vault.address,
        symbol: vault.symbol,
        name: vault.name.trim(),
        managers: [...new Set((managers ?? []).map((item) => item.name.trim()).filter(Boolean))],
        listed: vault.listed === true,
        tvlUsd,
        warnings: vault.warnings ?? [],
      });
    };
    for (const vault of v1.vaults.items) push(vault, vault.state?.totalAssetsUsd, vault.state?.curators);
    for (const vault of v2.vaultV2s.items) push(vault, vault.totalAssetsUsd, vault.curators?.items);
    if (!out.length) throw new Error("morpho returned no vaults");
    return out;
  });
}

/**
 * The vault behind a DefiLlama pool. Symbols repeat (a manager often runs an
 * old and a new vault under one symbol), so among same-symbol vaults the one
 * closest in size is taken, and only if it is close.
 */
export function matchVault(vaults: readonly MorphoVault[], chain: ChainId, symbol: string, tvlUsd: number): MorphoVault | null {
  const wanted = symbol.toUpperCase();
  let best: MorphoVault | null = null;
  let bestGap = Infinity;
  for (const vault of vaults) {
    if (vault.chain !== chain || vault.symbol.toUpperCase() !== wanted) continue;
    const gap = Math.abs(vault.tvlUsd - tvlUsd) / Math.max(vault.tvlUsd, tvlUsd, 1);
    if (gap < bestGap) {
      best = vault;
      bestGap = gap;
    }
  }
  return best && bestGap <= 0.25 ? best : null;
}

const WARNING_TEXT: Record<string, string> = {
  low_liquidity: "Morpho notes this vault has little available to withdraw right now.",
  short_timelock: "Morpho notes the manager can change this vault's settings at short notice.",
  timelock: "Morpho notes the manager can change this vault's settings at short notice.",
  not_whitelisted: "Morpho has not reviewed this vault.",
  deposit_disabled: "This vault is closed to new deposits.",
  oracle_unusable: "Morpho has flagged a problem with one of this vault's price feeds.",
};

export function warningText(type: string): string {
  return WARNING_TEXT[type] ?? `Morpho has raised a warning on this vault (${type.replace(/_/g, " ")}).`;
}
