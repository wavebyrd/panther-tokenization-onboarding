// The response envelope every API route returns, so clients can always find
// when data was read, where from, and what could not be read.

import { NextResponse } from "next/server";

export interface SourceNote {
  name: string;
  url: string;
  /** ISO time the data was read from this source; null if it could not be read. */
  fetchedAt: string | null;
  status: "ok" | "stale" | "failed";
  detail?: string;
}

export interface Meta {
  generatedAt: string;
  sources: SourceNote[];
  /** Plain-language caveats a client should show next to the data. */
  notes: string[];
}

export interface Envelope<T> {
  data: T;
  meta: Meta;
}

export function envelope<T>(data: T, sources: SourceNote[] = [], notes: string[] = []): Envelope<T> {
  return { data, meta: { generatedAt: new Date().toISOString(), sources, notes } };
}

export function ok<T>(body: Envelope<T>, cacheSeconds = 30): NextResponse {
  return NextResponse.json(body, {
    headers: { "Cache-Control": `public, max-age=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 4}` },
  });
}

export function fail(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}

export function sourceNote(
  name: string,
  url: string,
  read: { fetchedAt: number; stale: boolean; refreshError?: string } | null,
  failure?: string,
): SourceNote {
  if (!read) return { name, url, fetchedAt: null, status: "failed", detail: failure };
  return {
    name,
    url,
    fetchedAt: new Date(read.fetchedAt).toISOString(),
    status: read.stale ? "stale" : "ok",
    detail: read.refreshError,
  };
}

/** A number from a query string, or the fallback when absent or out of range. */
export function numberParam(value: string | null, fallback: number, min: number, max: number): number {
  if (value === null || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export const GENERAL_DISCLAIMER =
  "Information only, not financial advice. Rates and prices change constantly; confirm on the provider's own site before acting.";
