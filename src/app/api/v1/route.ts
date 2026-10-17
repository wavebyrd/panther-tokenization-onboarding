import { NextResponse } from "next/server";
import { API_VERSION, ENDPOINTS } from "@/server/endpoints";

/** GET /api/v1 — what this API offers. */
export function GET() {
  return NextResponse.json({
    name: "Tokenized portfolio onboarding API",
    version: API_VERSION,
    about:
      "Read-only. Every response is { data, meta }: meta names the sources read, when, and the caveats to show beside the data.",
    documentation: "/developers",
    openapi: "/api/v1/openapi.json",
    endpoints: ENDPOINTS.map((endpoint) => ({
      method: endpoint.method,
      path: endpoint.path,
      summary: endpoint.summary,
      example: endpoint.example.path,
    })),
  });
}
