import { envelope, fail, ok, sourceNote } from "@/server/api";
import { errorMessage } from "@/server/http";
import { loadYieldHistory, loadYields } from "@/server/yields";

export const dynamic = "force-dynamic";

/** GET /api/v1/yields/{pool}/history — daily rate history for one listed pool. */
export async function GET(_request: Request, context: { params: Promise<{ pool: string }> }) {
  const { pool } = await context.params;
  try {
    // Only pools the site lists can be asked for; this is not an open proxy.
    const listed = await loadYields();
    const match = listed.value.opportunities.find((item) => item.id === pool);
    if (!match) return fail(404, "unknown_pool", "That pool is not one this API lists.");
    const read = await loadYieldHistory(pool);
    return ok(
      envelope({ pool: match, history: read.value }, [
        sourceNote("DefiLlama yield history", `https://yields.llama.fi/chart/${pool}`, read),
      ]),
      900,
    );
  } catch (error) {
    return fail(503, "source_unavailable", `Rate history could not be read: ${errorMessage(error)}.`);
  }
}
