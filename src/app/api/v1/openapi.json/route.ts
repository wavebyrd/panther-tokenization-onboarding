import { NextResponse } from "next/server";
import { API_VERSION, ENDPOINTS, type Endpoint } from "@/server/endpoints";

const ENVELOPE = {
  type: "object",
  required: ["data", "meta"],
  properties: {
    data: { description: "The payload; its shape is described per endpoint." },
    meta: {
      type: "object",
      properties: {
        generatedAt: { type: "string", format: "date-time" },
        sources: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              url: { type: "string" },
              fetchedAt: { type: "string", format: "date-time", nullable: true },
              status: { type: "string", enum: ["ok", "stale", "failed"] },
              detail: { type: "string" },
            },
          },
        },
        notes: { type: "array", items: { type: "string" } },
      },
    },
  },
};

const ERROR = {
  type: "object",
  properties: {
    error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" } } },
  },
};

function operation(endpoint: Endpoint) {
  const body = endpoint.params.filter((param) => param.in === "body");
  return {
    operationId: endpoint.id,
    tags: [endpoint.group],
    summary: endpoint.summary,
    description: endpoint.description,
    parameters: endpoint.params
      .filter((param) => param.in !== "body")
      .map((param) => ({
        name: param.name,
        in: param.in,
        required: param.in === "path" || param.required === true,
        description: param.description,
        schema: { type: param.type },
        example: param.example,
      })),
    ...(body.length
      ? {
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: body.filter((param) => param.required).map((param) => param.name),
                  properties: Object.fromEntries(
                    body.map((param) => [param.name, { type: param.type, description: param.description }]),
                  ),
                },
                example: endpoint.example.body,
              },
            },
          },
        }
      : {}),
    responses: {
      "200": { description: "Success", content: { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } } },
      "4XX": { description: "The request could not be used", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      "503": { description: "An upstream source could not be read", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
    },
  };
}

/** GET /api/v1/openapi.json — the API described in OpenAPI 3. */
export function GET() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const endpoint of ENDPOINTS) {
    (paths[endpoint.path] ??= {})[endpoint.method.toLowerCase()] = operation(endpoint);
  }
  return NextResponse.json({
    openapi: "3.0.3",
    info: {
      title: "Tokenized portfolio onboarding API",
      version: API_VERSION,
      description:
        "Read-only market information for getting into a tokenized portfolio: stablecoin on-ramps, vetted yield, tokenized stock routing, and portfolio simulations. Information only, not financial advice.",
    },
    servers: [{ url: "/" }],
    paths,
    components: { schemas: { Envelope: ENVELOPE, Error: ERROR } },
  });
}
