import type { NextRequest } from "next/server";
import { envelope, fail, GENERAL_DISCLAIMER, ok, type SourceNote } from "@/server/api";
import { chainById } from "@/server/chains";
import { errorMessage } from "@/server/http";
import { loadOnramps } from "@/server/onramps";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/onramps?asset=USDC&chain=base
 * Where each vetted stablecoin can be bought with dollars, and the networks it
 * can be withdrawn on. `asset` and `chain` narrow the offers.
 */
export async function GET(request: NextRequest) {
  const asset = request.nextUrl.searchParams.get("asset")?.trim().toUpperCase() || null;
  const chainParam = request.nextUrl.searchParams.get("chain")?.trim().toLowerCase() || null;
  if (chainParam && !chainById(chainParam)) {
    return fail(400, "unknown_chain", `"${chainParam}" is not a chain this API covers.`);
  }
  try {
    const read = await loadOnramps();
    const providers = read.value.map((provider) => ({
      ...provider,
      offers: provider.offers.filter(
        (offer) =>
          (!asset || offer.symbol.toUpperCase() === asset) &&
          // A provider that does not publish its networks cannot be ruled in or out by chain.
          (!chainParam || offer.networks === null || offer.networks.some((item) => item.chain === chainParam && item.enabled)),
      ),
    }));
    const sources: SourceNote[] = read.value.map((provider) => ({
      name: provider.name,
      url: provider.sourceUrl,
      fetchedAt: provider.status === "live" ? new Date(read.fetchedAt).toISOString() : null,
      status: provider.status === "live" ? (read.stale ? "stale" : "ok") : "failed",
      detail: provider.statusDetail ?? undefined,
    }));
    return ok(
      envelope({ providers }, sources, [
        "Listings, prices and networks are read from each provider's public API. `networks: null` means the provider does not publish them.",
        "`premium` is the market price over $1 before the provider's own trading fee.",
        GENERAL_DISCLAIMER,
      ]),
      60,
    );
  } catch (error) {
    return fail(503, "source_unavailable", `On-ramp data could not be read: ${errorMessage(error)}.`);
  }
}
