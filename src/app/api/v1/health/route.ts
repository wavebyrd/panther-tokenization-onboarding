import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** GET /api/v1/health — whether the server is up. Says nothing about upstream sources. */
export function GET() {
  return NextResponse.json({ status: "ok", time: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
