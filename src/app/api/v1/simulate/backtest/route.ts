import { envelope, fail, ok } from "@/server/api";
import { errorMessage } from "@/server/http";
import { backtest, parseBacktestRequest } from "@/server/simulate";
import { BacktestError } from "@/lib/sim/backtest";

export const dynamic = "force-dynamic";

const NOTES = [
  "A backtest shows what happened, not what will happen.",
  "Trading costs, network fees and taxes are not included.",
];

/**
 * POST /api/v1/simulate/backtest
 * Body: { holdings: [{ ticker, weight }], start, end, initial, monthly,
 *         rebalance, cashMode, cashRate, benchmark }
 * Use the ticker "CASH" for the stablecoin-yield side. Weights are fractions that add to 1.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "bad_json", "The request body is not valid JSON.");
  }
  try {
    const result = await backtest(parseBacktestRequest(body));
    return ok(
      envelope(
        result,
        result.sources.map((source) => ({
          name: `${source.ticker} price history`,
          url: source.url,
          fetchedAt: new Date().toISOString(),
          status: "ok" as const,
        })),
        NOTES,
      ),
      0,
    );
  } catch (error) {
    if (error instanceof BacktestError) return fail(422, "cannot_run", error.message);
    return fail(503, "source_unavailable", `Price history could not be read: ${errorMessage(error)}.`);
  }
}
