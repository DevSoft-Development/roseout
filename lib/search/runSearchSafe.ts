import type { EnterpriseSearchResult } from "@/lib/search/enterprise/types";
import { runOutingSearch as runBaseOutingSearch, type RunOutingSearchInput } from "./runSearch";
import { applyAudienceSafetyToSearchResult } from "@/lib/search/quality/suppression";

export type { RunOutingSearchInput };

function isAnchoredResult(result: EnterpriseSearchResult) {
  const debug = (result as any)?.debug ?? {};
  return (
    (result as any)?.search_type === "anchored_nearby" ||
    (result as any)?.searchType === "anchored_nearby" ||
    debug?.searchType === "anchored_nearby" ||
    debug?.intentParserSource === "named_location_anchor" ||
    debug?.intent_parser_source === "named_location_anchor"
  );
}

function asFiniteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function applyAnchoredTimingFallback(
  result: EnterpriseSearchResult,
  totalMs: number,
  guardrailMs: number,
): EnterpriseSearchResult {
  if (!isAnchoredResult(result)) return result;

  const mutable = result as any;
  const debug = mutable.debug ?? {};
  const performance = debug.performance ?? {};

  const intentParseMs =
    asFiniteNumber(mutable.intent_parse_ms) ??
    asFiniteNumber(debug.intent_parse_ms) ??
    asFiniteNumber(debug.intentParseMs) ??
    0;
  const rankingMs =
    asFiniteNumber(mutable.ranking_ms) ??
    asFiniteNumber(debug.ranking_ms) ??
    asFiniteNumber(debug.rankingMs) ??
    0;
  const anchorBackfillMs =
    asFiniteNumber(debug.anchor_backfill_ms) ??
    asFiniteNumber(debug.anchorBackfillMs) ??
    0;
  const anchorQualifierFilterMs =
    asFiniteNumber(debug.anchor_qualifier_filter_ms) ??
    asFiniteNumber(debug.anchorQualifierFilterMs) ??
    0;
  const measuredRpcMs =
    asFiniteNumber(mutable.rpc_ms) ??
    asFiniteNumber(debug.rpc_ms) ??
    asFiniteNumber(debug.rpcMs) ??
    asFiniteNumber(debug.anchor_search_ms) ??
    asFiniteNumber(debug.anchorSearchMs);
  const rpcMs =
    measuredRpcMs ??
    Math.max(
      0,
      totalMs - intentParseMs - rankingMs - anchorQualifierFilterMs - guardrailMs,
    );

  mutable.intent_parse_ms = intentParseMs;
  mutable.rpc_ms = rpcMs;
  mutable.ranking_ms = rankingMs;

  mutable.debug = {
    ...debug,
    intentParseMs,
    intent_parse_ms: intentParseMs,
    rpcMs,
    rpc_ms: rpcMs,
    rankingMs,
    ranking_ms: rankingMs,
    anchorResolutionMs:
      asFiniteNumber(debug.anchor_resolution_ms) ??
      asFiniteNumber(debug.anchorResolutionMs) ??
      0,
    anchor_resolution_ms:
      asFiniteNumber(debug.anchor_resolution_ms) ??
      asFiniteNumber(debug.anchorResolutionMs) ??
      0,
    anchorNearbyRetrievalMs:
      asFiniteNumber(debug.anchor_nearby_retrieval_ms) ??
      asFiniteNumber(debug.anchorNearbyRetrievalMs) ??
      rpcMs,
    anchor_nearby_retrieval_ms:
      asFiniteNumber(debug.anchor_nearby_retrieval_ms) ??
      asFiniteNumber(debug.anchorNearbyRetrievalMs) ??
      rpcMs,
    anchorQualifierFilterMs,
    anchor_qualifier_filter_ms: anchorQualifierFilterMs,
    anchorBackfillMs,
    anchor_backfill_ms: anchorBackfillMs,
    anchorGuardrailMs: guardrailMs,
    anchor_guardrail_ms: guardrailMs,
    performance: {
      ...performance,
      total_ms: asFiniteNumber(performance.total_ms) ?? totalMs,
      intent_parse_ms: intentParseMs,
      rpc_ms: rpcMs,
      ranking_ms: rankingMs,
      anchor_resolution_ms:
        asFiniteNumber(debug.anchor_resolution_ms) ??
        asFiniteNumber(debug.anchorResolutionMs) ??
        0,
      anchor_nearby_retrieval_ms:
        asFiniteNumber(debug.anchor_nearby_retrieval_ms) ??
        asFiniteNumber(debug.anchorNearbyRetrievalMs) ??
        rpcMs,
      anchor_qualifier_filter_ms: anchorQualifierFilterMs,
      anchor_backfill_ms: anchorBackfillMs,
      anchor_guardrail_ms: guardrailMs,
    },
  };

  return mutable;
}

export async function runOutingSearch(input: RunOutingSearchInput): Promise<EnterpriseSearchResult> {
  const startedAt = Date.now();
  const result = await runBaseOutingSearch(input);
  const guardrailStartedAt = Date.now();
  const safeResult = applyAudienceSafetyToSearchResult(String(input.query ?? ""), result);
  const guardrailMs = Date.now() - guardrailStartedAt;
  return applyAnchoredTimingFallback(safeResult, Date.now() - startedAt, guardrailMs);
}
