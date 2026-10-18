// Outbound HTTP for every upstream source. Public data APIs only: no user data
// in any request. Requests say who is asking: an honest User-Agent naming this
// project, never a browser's. A host that refuses such requests is left
// unread and the page says so, rather than being worked around.

import { IS_BROWSER } from "./connections";

export const UA = "panther-onboarding/0.1 (+https://github.com/wavebyrd/panther-tokenization-onboarding)";

// Free endpoints that limit how fast one client may ask. Requests to these hosts
// are spaced out, so a burst of lookups queues politely instead of being refused.
const SPACING_MS: Record<string, number> = {
  "lite-api.jup.ag": 1_500,
  "api.jup.ag": 120,
  "api.dexscreener.com": 250,
  "aggregator-api.kyberswap.com": 200,
};
const nextSlot = new Map<string, number>();

async function waitForSlot(url: string): Promise<void> {
  const host = new URL(url).host;
  const spacing = SPACING_MS[host];
  if (!spacing) return;
  const now = Date.now();
  const slot = Math.max(now, nextSlot.get(host) ?? 0);
  nextSlot.set(host, slot + spacing);
  if (slot > now) await new Promise((resolve) => setTimeout(resolve, slot - now));
}

export class HttpError extends Error {
  constructor(
    public readonly url: string,
    public readonly status: number,
    message?: string,
  ) {
    super(message ?? `${new URL(url).host} answered ${status}`);
    this.name = "HttpError";
  }
}

export interface FetchOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
  method?: "GET" | "POST";
  body?: unknown;
  /** Extra attempts after a 429 or a network failure. */
  retries?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchJson<T = unknown>(url: string, options: FetchOptions = {}): Promise<T> {
  const { timeoutMs = 15_000, headers = {}, method = "GET", body, retries = 1 } = options;
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await waitForSlot(url);
      const response = await fetch(url, {
        method,
        headers: {
          // A browser sends its own User-Agent and does not let a page change it.
          ...(IS_BROWSER ? {} : { "User-Agent": UA }),
          Accept: "application/json",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.status === 429 && attempt < retries) {
        await sleep(1_500 * (attempt + 1));
        continue;
      }
      if (!response.ok) throw new HttpError(url, response.status);
      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      // A definite answer from the host is not worth repeating.
      if (error instanceof HttpError && error.status !== 429 && error.status < 500) break;
      if (attempt < retries) await sleep(400 * (attempt + 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`request to ${url} failed`);
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") return "timed out";
    return error.message;
  }
  return "unknown error";
}
