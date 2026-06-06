export const SEARCH_INTENT_FAST_MODEL =
  process.env.SEARCH_INTENT_FAST_MODEL || "gpt-4o-mini";

export const SEARCH_INTENT_FALLBACK_MODEL =
  process.env.SEARCH_INTENT_FALLBACK_MODEL || "gpt-4o";

export const SEARCH_INTENT_LLM_TIMEOUT_MS = Number(
  process.env.SEARCH_INTENT_LLM_TIMEOUT_MS || 1400,
);

export const SEARCH_INTENT_FALLBACK_TIMEOUT_MS = Number(
  process.env.SEARCH_INTENT_FALLBACK_TIMEOUT_MS || 2200,
);

export const SEARCH_INTENT_CACHE_VERSION =
  process.env.SEARCH_INTENT_CACHE_VERSION || "intent-v4-fast-model";
