import { envelope, fail, GENERAL_DISCLAIMER, ok, sourceNote } from "@/server/api";
import { errorMessage } from "@/server/http";
import { loadStablecoins, STABLECOIN_SOURCE } from "@/server/stablecoins";

export const dynamic = "force-dynamic";

/** GET /api/v1/stablecoins — the vetted stablecoins, with live supply, peg and chains. */
export async function GET() {
  try {
    const read = await loadStablecoins();
    return ok(
      envelope(read.value, [sourceNote("DefiLlama stablecoins", STABLECOIN_SOURCE, read)], [
        "A coin is listed only if it has a reviewed profile and passes the live size and peg checks in `rules`.",
        GENERAL_DISCLAIMER,
      ]),
      120,
    );
  } catch (error) {
    return fail(503, "source_unavailable", `Stablecoin data could not be read: ${errorMessage(error)}.`);
  }
}
