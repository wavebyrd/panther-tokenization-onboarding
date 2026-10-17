// Outbound HTTP for every upstream source. Public data APIs only: no keys, no
// user data in any request. Some hosts (Nasdaq, Robinhood's explorer) refuse
// requests without a browser-like User-Agent.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

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
      const response = await fetch(url, {
        method,
        headers: {
          "User-Agent": UA,
          Accept: "application/json",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.status === 429 && attempt < retries) {
        await sleep(800 * (attempt + 1));
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
