import { envelope, fail, ok } from "@/server/api";
import { planPortfolio, type PortfolioInput } from "@/lib/portfolio/allocate";

export const dynamic = "force-dynamic";

const NOTES = [
  "An educational simulation, not advice. Assumptions are illustrative and editable, not forecasts.",
  "No markets are read: this is the target mix and projection only. POST /api/v1/portfolio/plan adds live fills.",
];

/**
 * POST /api/v1/portfolio/allocate
 * Body: any of { capital, monthly, equityShare, endEquityShare, years, shape,
 *                risk, classes, assumptions, inflation }.
 * The target mix and glide-path projection, without reading any market.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "bad_json", "The request body is not valid JSON.");
  }
  if (!body || typeof body !== "object") return fail(400, "bad_json", "Send a JSON object.");
  return ok(envelope(planPortfolio(body as Partial<PortfolioInput>), [], NOTES), 0);
}
