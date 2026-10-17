import { envelope, fail, GENERAL_DISCLAIMER, ok } from "@/server/api";
import { errorMessage } from "@/server/http";
import { fillPortfolio, type FillRequest } from "@/server/portfolio";

export const dynamic = "force-dynamic";

const NOTES = [
  "An educational simulation, not advice. It holds no money and places no trades; every price is a quote that can change before you act.",
  "Allocations come from mean-variance optimisation on the assumptions in `assumptions`, which are illustrative and editable, not forecasts.",
  "`cost` is the all-in cost of a fill: against fair value where the fund price and share multiplier can be read, otherwise against the same venue's price for a $100 order (`costBasis`).",
  "Most tokenized stocks and funds are not offered to United States residents. Check each issuer's own terms.",
  GENERAL_DISCLAIMER,
];

/**
 * POST /api/v1/portfolio/plan
 * Body: any of { capital, monthly, equityShare, endEquityShare, years, shape,
 *                risk, classes, assumptions, inflation, maxCost, chains }.
 * Builds the target mix, projects the glide path, and finds where each
 * holding fills best for its exact size.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "bad_json", "The request body is not valid JSON.");
  }
  if (!body || typeof body !== "object") return fail(400, "bad_json", "Send a JSON object.");
  try {
    const plan = await fillPortfolio(body as FillRequest);
    return ok(envelope(plan, [], NOTES), 0);
  } catch (error) {
    return fail(503, "source_unavailable", `Quotes could not be read: ${errorMessage(error)}.`);
  }
}
