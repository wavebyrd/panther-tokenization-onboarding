import type { NextRequest } from "next/server";
import { envelope, fail, GENERAL_DISCLAIMER, numberParam, ok, sourceNote } from "@/server/api";
import { chainById } from "@/server/chains";
import { errorMessage } from "@/server/http";
import { loadYields, steadyRate, YIELD_SOURCES, type YieldOpportunity } from "@/server/yields";

export const dynamic = "force-dynamic";

const SORTS: Record<string, (a: YieldOpportunity, b: YieldOpportunity) => number> = {
  steady: (a, b) => steadyRate(b) - steadyRate(a),
  today: (a, b) => b.apy - a.apy,
  base: (a, b) => (b.apyBase ?? 0) - (a.apyBase ?? 0),
  size: (a, b) => b.tvlUsd - a.tvlUsd,
};

/**
 * GET /api/v1/yields?asset=USDC&chain=base&maxRisk=2&sort=steady&limit=50
 * Vetted places to earn interest on a stablecoin. Rates are annual percentages.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const asset = params.get("asset")?.trim().toUpperCase() || null;
  const chain = params.get("chain")?.trim().toLowerCase() || null;
  const sort = params.get("sort")?.trim().toLowerCase() || "steady";
  if (chain && !chainById(chain)) return fail(400, "unknown_chain", `"${chain}" is not a chain this API covers.`);
  if (!SORTS[sort]) return fail(400, "unknown_sort", `sort must be one of: ${Object.keys(SORTS).join(", ")}.`);
  const maxRisk = numberParam(params.get("maxRisk"), 3, 1, 3);
  const limit = numberParam(params.get("limit"), 100, 1, 500);

  try {
    const read = await loadYields();
    const opportunities = read.value.opportunities
      .filter(
        (item) =>
          (!asset || item.asset.toUpperCase() === asset) && (!chain || item.chain === chain) && item.risk <= maxRisk,
      )
      .sort(SORTS[sort])
      .slice(0, limit);
    return ok(
      envelope(
        { ...read.value, opportunities },
        YIELD_SOURCES.map((source) => sourceNote(source.name, source.url, read)),
        [
          "Rates are variable and reported by DefiLlama, not checked against each protocol's contracts.",
          "`steady` sorts by the lower of today's rate and its 30-day average, so a one-day spike cannot rank first.",
          "`risk` is this site's own grouping, described in `riskLevels`.",
          GENERAL_DISCLAIMER,
        ],
      ),
      120,
    );
  } catch (error) {
    return fail(503, "source_unavailable", `Yield data could not be read: ${errorMessage(error)}.`);
  }
}
