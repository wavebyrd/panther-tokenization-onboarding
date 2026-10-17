// In-memory cache shared by every request, so upstream load never scales with
// visitors. A fresh entry is served as is; a stale one is served at once while
// a single background refresh runs; a failed refresh keeps the last good value
// and says so. Kept on globalThis so dev-server reloads do not drop it.

interface Entry {
  value: unknown;
  at: number;
  error?: string;
}

interface Store {
  entries: Map<string, Entry>;
  inflight: Map<string, Promise<unknown>>;
}

const store: Store = ((globalThis as { __onboardingCache?: Store }).__onboardingCache ??= {
  entries: new Map(),
  inflight: new Map(),
});

export interface Cached<T> {
  value: T;
  /** When the value was read from its source, epoch ms. */
  fetchedAt: number;
  /** Served past its freshness window (a refresh is running or has failed). */
  stale: boolean;
  /** Why the latest refresh failed, if it did. */
  refreshError?: string;
}

export interface CacheOptions {
  /** How long a value counts as fresh. */
  ttlMs: number;
  /** How long past `ttlMs` a value may still be served while refreshing. Default: 6x ttl. */
  staleMs?: number;
  /**
   * Whether a value older than both windows may be served, labelled stale,
   * when its refresh fails. Right for slow-moving data; wrong for a price.
   */
  serveExpiredOnError?: boolean;
}

const MAX_ENTRIES = 3000;

/** Drops the oldest entries once the cache outgrows its bound. */
function prune(): void {
  if (store.entries.size <= MAX_ENTRIES) return;
  const oldest = [...store.entries].sort((a, b) => a[1].at - b[1].at).slice(0, MAX_ENTRIES / 4);
  for (const [key] of oldest) store.entries.delete(key);
}

function refresh<T>(key: string, load: () => Promise<T>): Promise<T> {
  const running = store.inflight.get(key);
  if (running) return running as Promise<T>;
  const started = load()
    .then((value) => {
      store.entries.set(key, { value, at: Date.now() });
      prune();
      return value;
    })
    .catch((error: unknown) => {
      const entry = store.entries.get(key);
      if (entry) entry.error = error instanceof Error ? error.message : "refresh failed";
      throw error;
    })
    .finally(() => {
      store.inflight.delete(key);
    });
  store.inflight.set(key, started);
  return started;
}

export async function cached<T>(key: string, options: CacheOptions, load: () => Promise<T>): Promise<Cached<T>> {
  const { ttlMs, staleMs = ttlMs * 6, serveExpiredOnError = true } = options;
  const entry = store.entries.get(key);
  const age = entry ? Date.now() - entry.at : Infinity;

  if (entry && age <= ttlMs) {
    return { value: entry.value as T, fetchedAt: entry.at, stale: false };
  }
  if (entry && age <= ttlMs + staleMs) {
    // Serve what we have; refresh behind it.
    void refresh(key, load).catch(() => undefined);
    return { value: entry.value as T, fetchedAt: entry.at, stale: true, refreshError: entry.error };
  }
  try {
    const value = await refresh(key, load);
    return { value, fetchedAt: store.entries.get(key)?.at ?? Date.now(), stale: false };
  } catch (error) {
    // Too old to serve knowingly, but better labelled-stale than nothing.
    if (entry && serveExpiredOnError) {
      return {
        value: entry.value as T,
        fetchedAt: entry.at,
        stale: true,
        refreshError: error instanceof Error ? error.message : "refresh failed",
      };
    }
    throw error;
  }
}

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
