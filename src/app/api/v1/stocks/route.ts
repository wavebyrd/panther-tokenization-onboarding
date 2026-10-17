import type { NextRequest } from "next/server";
import { envelope, fail, GENERAL_DISCLAIMER, numberParam, ok, sourceNote } from "@/server/api";
import { errorMessage } from "@/server/http";
import { searchStocks } from "@/server/stocks/search";
import { BACKED_LIST, loadUniverse, ONDO_LIST, ROBINHOOD_ASSETS } from "@/server/stocks/universe";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/stocks?q=apple&limit=20
 * Every stock and fund that has a tokenized form, with who issues it and on
 * which chains. `q` matches the ticker or the name.
 */
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const limit = numberParam(request.nextUrl.searchParams.get("limit"), 50, 1, 2000);
  try {
    const read = await loadUniverse();
    const matches = searchStocks(read.value.stocks, query, limit).map(({ listings, ...stock }) => ({
      ...stock,
      tokens: listings.length,
    }));
    const failed = new Map(read.value.missing.map((item) => [item.issuer, item.detail]));
    const issuerNote = (issuer: "robinhood" | "ondo" | "xstocks", name: string, url: string) =>
      failed.has(issuer)
        ? { name, url, fetchedAt: null, status: "failed" as const, detail: failed.get(issuer) }
        : sourceNote(name, url, read);
    return ok(
      envelope({ total: read.value.stocks.length, stocks: matches }, [
        issuerNote("robinhood", "Robinhood catalog", ROBINHOOD_ASSETS),
        issuerNote("ondo", "Ondo token list", ONDO_LIST),
        issuerNote("xstocks", "xStocks token list", BACKED_LIST),
      ], [GENERAL_DISCLAIMER]),
      600,
    );
  } catch (error) {
    return fail(503, "source_unavailable", `The stock list could not be read: ${errorMessage(error)}.`);
  }
}
