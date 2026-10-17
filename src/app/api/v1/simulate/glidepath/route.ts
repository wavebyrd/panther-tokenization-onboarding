import { envelope, fail, ok } from "@/server/api";
import { runGlidePath, sanitizeGlideInput, type GlidePathInput } from "@/lib/sim/glidepath";

export const dynamic = "force-dynamic";

const NOTES = [
  "A projection across simulated futures, not a forecast. Real markets can fall outside this range.",
  "Rebalanced monthly to the path's mix. Trading costs, network fees and taxes are not included.",
  "With inflation above zero, results are in today's dollars and the monthly amount rises with inflation.",
];

/**
 * POST /api/v1/simulate/glidepath
 * Body: any of { years, initial, monthly, startStocks, endStocks, shape,
 *                stockReturn, stockVolatility, stableReturn, stableVolatility,
 *                inflation, simulations, seed }. Rates and shares are fractions.
 * Missing or out-of-range fields fall back to defaults; `input` in the response
 * shows what was actually run.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "bad_json", "The request body is not valid JSON.");
  }
  if (!body || typeof body !== "object") return fail(400, "bad_json", "Send a JSON object.");
  const input = sanitizeGlideInput(body as Partial<GlidePathInput>);
  return ok(envelope({ input, ...runGlidePath(input) }, [], NOTES), 0);
}
