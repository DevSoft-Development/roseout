import type { SearchIntent } from "./types";
import {
  SEARCH_INTENT_CACHE_VERSION,
  SEARCH_INTENT_FAST_MODEL,
} from "./model-config";

export type SearchIntentCachePayload = {
  intent: SearchIntent;
  modelUsed?: string;
  parserVersion?: string;
  llmEnhancementUsed?: boolean;
  fallbackUsed?: boolean;
  createdAt?: string;
};

const memoryCache = new Map<string, SearchIntentCachePayload>();

export function normalizeQueryForIntentCache(rawQuery: string) {
  return String(rawQuery || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function buildSearchIntentCacheKey(args: {
  rawQuery: string;
  geo?: {
    raw?: string | null;
    neighborhood?: string | null;
    borough?: string | null;
    city?: string | null;
    state?: string | null;
  } | null;
  parserVersion?: string;
  model?: string;
}) {
  const geo = args.geo ?? null;

  const geoKey = [geo?.neighborhood, geo?.borough, geo?.city, geo?.state]
    .filter(Boolean)
    .join(",");

  return [
    normalizeQueryForIntentCache(args.rawQuery),
    geoKey,
    args.parserVersion ?? SEARCH_INTENT_CACHE_VERSION,
    args.model ?? SEARCH_INTENT_FAST_MODEL,
  ]
    .filter(Boolean)
    .join("|");
}

export async function getCachedSearchIntent(key: string) {
  return memoryCache.get(key) ?? null;
}

export async function setCachedSearchIntent(
  key: string,
  payload: Omit<SearchIntentCachePayload, "createdAt"> & { createdAt?: string },
) {
  memoryCache.set(key, {
    ...payload,
    createdAt: payload.createdAt ?? new Date().toISOString(),
  });
}

export function clearSearchIntentCacheForTests() {
  memoryCache.clear();
}
