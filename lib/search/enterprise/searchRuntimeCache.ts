export type SearchRuntimeCacheStatus = "hit" | "miss" | "bypass" | "error";

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

type CacheOptions = {
  enabled?: boolean;
  ttlMs: number;
  maxEntries?: number;
  now?: () => number;
};

const DEFAULT_MAX_ENTRIES = 250;
const SEARCH_CACHE_NAMESPACE = "search-quality:v1";
const memoryCache = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

function normalizeText(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function coordinateBucket(value?: number) {
  if (!Number.isFinite(value)) return "";
  return (Math.round(Number(value) * 100) / 100).toFixed(2);
}

function evictExpired(now: number) {
  for (const [key, entry] of memoryCache) {
    if (entry.expiresAt <= now) memoryCache.delete(key);
  }
}

function enforceMaxEntries(maxEntries: number) {
  while (memoryCache.size > maxEntries) {
    const oldestKey = memoryCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    memoryCache.delete(oldestKey);
  }
}

export function buildSearchRuntimeCacheKey(input: {
  query: string;
  market?: string;
  latitude?: number;
  longitude?: number;
  dateTime?: string;
  domain?: string;
  walking?: boolean;
  userId?: string;
  version?: string;
}) {
  return [
    SEARCH_CACHE_NAMESPACE,
    input.version ?? "1",
    normalizeText(input.query),
    normalizeText(input.market),
    coordinateBucket(input.latitude),
    coordinateBucket(input.longitude),
    normalizeText(input.dateTime),
    normalizeText(input.domain) || "any",
    input.walking ? "walk" : "any",
    input.userId ? `user:${input.userId}` : "anonymous",
  ].join("|");
}

export function clearSearchRuntimeCache() {
  memoryCache.clear();
  inflight.clear();
}

export function getSearchRuntimeCacheStats() {
  return {
    entries: memoryCache.size,
    inflight: inflight.size,
  };
}

export async function cachedSearchStage<T>(
  key: string,
  loader: () => Promise<T>,
  options: CacheOptions,
): Promise<{ value: T; status: SearchRuntimeCacheStatus }> {
  if (options.enabled !== true) {
    return { value: await loader(), status: "bypass" };
  }

  const now = options.now?.() ?? Date.now();
  const ttlMs = Math.max(1, options.ttlMs);
  const maxEntries = Math.max(1, options.maxEntries ?? DEFAULT_MAX_ENTRIES);

  evictExpired(now);

  const cached = memoryCache.get(key) as CacheEntry<T> | undefined;
  if (cached) {
    memoryCache.delete(key);
    memoryCache.set(key, cached);
    return { value: cached.value, status: "hit" };
  }

  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) {
    return { value: await existing, status: "hit" };
  }

  const request = loader();
  inflight.set(key, request);

  try {
    const value = await request;
    memoryCache.set(key, { value, expiresAt: now + ttlMs });
    enforceMaxEntries(maxEntries);
    return { value, status: "miss" };
  } catch (error) {
    throw error;
  } finally {
    inflight.delete(key);
  }
}

export async function withSearchTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  fallback: T,
): Promise<{ value: T; timedOut: boolean }> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      operation().then((value) => ({ value, timedOut: false })),
      new Promise<{ value: T; timedOut: boolean }>((resolve) => {
        timer = setTimeout(
          () => resolve({ value: fallback, timedOut: true }),
          Math.max(1, timeoutMs),
        );
      }),
    ]);
  } catch {
    return { value: fallback, timedOut: false };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
