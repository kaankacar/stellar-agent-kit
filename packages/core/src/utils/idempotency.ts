import type { KVStore } from "../types/config";

interface CachedEntry<T> {
  result: T;
  expiresAt: number;
}

/**
 * Wrap a state-changing handler with idempotency-key caching.
 *
 * If `key` is provided, looks up `idempotency:{actionName}:{key}` in the store.
 * On cache hit (and not expired), returns the cached result without calling
 * `fn`. On miss, runs `fn`, caches the result with `expiresAt = now + ttlMs`,
 * and returns it.
 *
 * If `key` is undefined, this is a passthrough — the handler runs every time.
 */
export async function withIdempotency<T>(
  store: KVStore,
  actionName: string,
  key: string | undefined,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  if (!key) return fn();
  const cacheKey = `idempotency:${actionName}:${key}`;
  const cached = await store.get<CachedEntry<T>>(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.result;
  }
  const result = await fn();
  await store.set<CachedEntry<T>>(cacheKey, { result, expiresAt: now + ttlMs });
  return result;
}

export const DEFAULT_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
