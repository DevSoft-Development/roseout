/**
 * @deprecated
 *
 * PHASE 1 — EDGE SEARCH BOUNDARY
 *
 * This module was created while parts of public search were being evaluated
 * for execution in a Supabase Edge Function.
 *
 * The create-search Edge Function is NOT a second public search engine and
 * must not become an alternative source of final search responses.
 *
 * Canonical public search flow:
 *
 *   POST /api/generate
 *     -> lib/search/public-api/controller.ts
 *     -> lib/search/runSearch.ts
 *     -> lib/search/enterprise/*
 *
 * Future Edge integration must happen through a bounded internal stage such
 * as candidate retrieval, anchor resolution, or intent-cache access.
 *
 * The canonical application pipeline must continue to own final intent,
 * ranking, pairing, walking validation, guardrails, personalization, card
 * shaping, telemetry classification, and public response behavior.
 *
 * Do not add new callers to this module.
 *
 * This compatibility wrapper remains temporarily so stale branches fail
 * safely instead of silently restoring the Edge Function as a second search
 * engine.
 */

type DeprecatedCreateSearchOptions = {
  accessToken?: string | null;
  fallbackDisabled?: boolean;
  legacySearch: () => Promise<Record<string, unknown>>;
};

const DEPRECATION_MESSAGE =
  "lib/search/createSearch.ts is deprecated. Public search must use " +
  "/api/generate -> public search controller -> runOutingSearch(). " +
  "The create-search Edge Function must not return an independent final search response.";

let warningEmitted = false;

function emitDeprecationWarning(): void {
  if (warningEmitted) return;

  warningEmitted = true;

  console.warn("[deprecated-create-search]", {
    message: DEPRECATION_MESSAGE,
    canonicalRoute: "/api/generate",
    canonicalOrchestrator: "lib/search/runSearch.ts",
  });
}

/**
 * @deprecated
 *
 * The old NEXT_PUBLIC_USE_EDGE_CREATE_SEARCH switch is intentionally ignored.
 * Search execution must not be controlled by a client-visible environment
 * variable.
 *
 * This function always returns false so stale callers fail closed and use
 * the canonical application search path.
 */
export function isEdgeCreateSearchEnabled(): boolean {
  emitDeprecationWarning();
  return false;
}

/**
 * @deprecated
 *
 * Do not use this function for new code.
 *
 * It always executes legacySearch, which must point to the canonical
 * application-side enterprise search pipeline. It no longer invokes the
 * create-search Edge Function as an alternative final search engine.
 */
export async function runCreateSearchWithEdgeFallback(
  _body: Record<string, unknown>,
  options: DeprecatedCreateSearchOptions,
): Promise<Record<string, unknown>> {
  emitDeprecationWarning();

  if (typeof options.legacySearch !== "function") {
    throw new TypeError(
      "runCreateSearchWithEdgeFallback requires a canonical legacySearch function.",
    );
  }

  const result = await options.legacySearch();

  return {
    ...result,
    source:
      typeof result.source === "string"
        ? result.source
        : "canonical_enterprise_search",
    debug: {
      ...(isRecord(result.debug) ? result.debug : {}),
      deprecatedCreateSearchWrapperUsed: true,
      edgeCreateSearchInvoked: false,
      canonicalSearchPreserved: true,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
