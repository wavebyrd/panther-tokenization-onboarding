import type { NextRequest } from "next/server";
import { envelope, fail, GENERAL_DISCLAIMER, numberParam, ok, type SourceNote } from "@/server/api";
import { errorMessage } from "@/server/http";
import { lookupStock } from "@/server/stocks/lookup";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/stocks/{ticker}?amount=1000
 * Every venue selling the tokenized form of one stock, ranked by the all-in
 * cost of buying `amount` dollars of it right now, with the route each quote
 * takes and the pools behind it.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await context.params;
  if (!/^[A-Za-z][A-Za-z0-9.]{0,9}$/.test(ticker)) return fail(400, "bad_ticker", "That does not look like a ticker.");
  const amount = numberParam(request.nextUrl.searchParams.get("amount"), 1000, 10, 1_000_000);
  try {
    const read = await lookupStock(ticker, amount);
    if (!read.value) {
      return fail(404, "not_tokenized", `No issuer this API covers lists a tokenized form of ${ticker.toUpperCase()}.`);
    }
    const at = new Date(read.fetchedAt).toISOString();
    const sources: SourceNote[] = [
      { name: "Swap quotes (KyberSwap, Jupiter)", url: "https://aggregator-api.kyberswap.com", fetchedAt: at, status: "ok" },
      { name: "Pools (DexScreener)", url: "https://api.dexscreener.com", fetchedAt: at, status: "ok" },
    ];
    if (read.value.reference) {
      sources.push({ name: read.value.reference.label, url: read.value.reference.source, fetchedAt: at, status: "ok" });
    }
    return ok(
      envelope(read.value, sources, [
        "A quote is what a swap aggregator says the order would fill at now. It is not an order and can change before you trade.",
        "`premium` compares the all-in price with the real share price times the shares each token stands for.",
        "Most tokenized stocks are not offered to United States residents. Check `issuers[].eligibility` and the issuer's own terms.",
        GENERAL_DISCLAIMER,
      ]),
      10,
    );
  } catch (error) {
    return fail(503, "source_unavailable", `Prices could not be read: ${errorMessage(error)}.`);
  }
}
