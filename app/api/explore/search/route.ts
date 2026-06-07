import { NextRequest, NextResponse } from "next/server";
import { runEnterpriseSearch } from "@/lib/search/enterprise";
import { logSearchEvent } from "@/lib/search/enterprise/searchEventLogger";
import { logSearchHealthEvent } from "@/lib/search/enterprise/searchHealthLogger";


function metadataString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function sanitizeSearchMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeSearchMetadata);
  if (!value || typeof value !== "object") {
    if (typeof value !== "string") return value;
    return value
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted_email]")
      .replace(/(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/g, "[redacted_phone]");
  }

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>(
    (acc, [key, item]) => {
      if (/email|phone|address/i.test(key)) return acc;
      acc[key] = sanitizeSearchMetadata(item);
      return acc;
    },
    {},
  );
}

function cleanParam(value: string | null) { return (value ?? "").trim(); }
function normalizeKind(value: string | null) { const v=cleanParam(value).toLowerCase(); if (["restaurants","restaurant","food","brunch"].includes(v)) return "restaurants"; if (["activities","activity","things","things-to-do"].includes(v)) return "activities"; if (["rooftops","rooftop"].includes(v)) return "rooftops"; if (["lounges","lounge"].includes(v)) return "lounges"; return "all"; }
function normalizeArea(value: string | null) { return cleanParam(value) || "all"; }
function buildExploreQuery(q: string, kind: string, area: string) { const parts=[q]; if (!q && kind==="restaurants") parts.push("restaurants"); if (!q && kind==="activities") parts.push("things to do"); if (kind==="rooftops") parts.push("rooftop lounge"); if (kind==="lounges") parts.push("lounge nightlife"); if (area!=="all") parts.push(`in ${area}`); return parts.filter(Boolean).join(" ").trim() || "things to do"; }

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const q = cleanParam(params.get("q"));
  const kind = normalizeKind(params.get("kind"));
  const area = normalizeArea(params.get("area"));
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
  const perPage = Math.min(96, Math.max(12, Number(params.get("limit") ?? 96) || 96));
  try {
    const query = buildExploreQuery(q, kind, area);
    const simple = Boolean(!q || /^[\w\s-]+$/.test(q));
    const betaAssignmentId = params.get("betaAssignmentId") || request.headers.get("x-beta-assignment-id");
    const betaTesterId = params.get("betaTesterId") || request.headers.get("x-beta-tester-id");
    const usedCustomPrompt = params.get("usedCustomPrompt") === "true" || request.headers.get("x-used-custom-prompt") === "true";
    const betaDebug = process.env.NODE_ENV !== "production" || params.get("betaDebug") === "true";
    const result = await runEnterpriseSearch(query, { useLLM: !simple && q.split(/\s+/).length > 3, displayLimit: 48, source: betaTesterId ? "beta_tester_search" : "public_explore_search", route: "/api/explore/search", logPerformance: true, sessionId: request.cookies.get("toh_session")?.value || request.headers.get("x-session-id"), betaAssignmentId, betaTesterId, usedCustomPrompt, betaDebug, searchHealthDebug: betaDebug });
    const mixedWithPairing = result.render_mode === "mixed_pairs" || result.render_mode === "partial_mixed";
    let exploreNote: string | undefined;
    let items = kind === "restaurants" || kind === "rooftops" ? result.restaurants : kind === "activities" || kind === "lounges" ? result.activities : mixedWithPairing && result.pairs.length ? [...result.pairs, ...result.restaurants, ...result.activities] : [...result.restaurants, ...result.activities];
    if (kind === "all" && mixedWithPairing && !result.pairs.length) exploreNote = "No walkable pairs found. Showing individual matches. Prefer using /create for full pair planning.";
    if (kind === "rooftops") items = items.filter((item:any)=>/[\s-]roof|rooftop|terrace|skyline|view|lounge/i.test([item.name,item.primary_category,item.description,item.search_document,item.tags].flat().join(" ")));
    if (kind === "lounges") items = items.filter((item:any)=>/lounge|hookah|bar|nightlife|cocktail/i.test([item.name,item.primary_category,item.activity_type,item.description,item.search_document,item.tags].flat().join(" ")));
    const total = items.length;
    const start = (page - 1) * perPage;
    items = items.slice(start, start + perPage);
    const debug = (result.debug as any) ?? {};
    const normalizedIntent =
      debug.normalizedIntent ?? debug.intent ?? (result as any).normalizedIntent ?? null;
    const perf = debug?.performance;
    const noResultsReason =
      (result as any).no_results_reason ??
      (result as any).noResultsReason ??
      debug.no_results_reason ??
      debug.noResultsReason ??
      null;
    const noPairsReason =
      (result as any).no_pairs_reason ??
      (result as any).noPairsReason ??
      debug.no_pairs_reason ??
      debug.noPairsReason ??
      (exploreNote ? "no_walkable_pairs_for_explore" : null);
    const resolvedIntentParserSource =
      debug.intentParserSource ??
      debug.intent_parser_source ??
      debug.intentParser?.source ??
      debug.normalizedIntent?.intentParserSource ??
      debug.normalizedIntent?.parserSource ??
      normalizedIntent?.intentParserSource ??
      normalizedIntent?.parserSource ??
      (result as any)?.intentParserSource ??
      (result as any)?.parserSource ??
      null;
    const resolvedSearchType =
      normalizedIntent?.searchType ??
      debug.normalizedIntent?.searchType ??
      debug.intent?.searchType ??
      (result as any)?.searchType ??
      kind ??
      null;
    const resolvedPrimaryDomain =
      normalizedIntent?.primaryDomain ??
      debug.normalizedIntent?.primaryDomain ??
      debug.intent?.primaryDomain ??
      (result as any)?.primaryDomain ??
      null;
    const resolvedGeo =
      normalizedIntent?.geo ??
      debug.normalizedIntent?.geo ??
      debug.geo ??
      debug.originalGeo ??
      (result as any)?.geo ??
      (area !== "all" ? { city: area } : null);
    const resolvedOutingDate =
      metadataString(normalizedIntent?.outingDate?.date) ??
      metadataString(normalizedIntent?.dateTime?.date) ??
      metadataString(normalizedIntent?.outing?.date) ??
      metadataString(debug.normalizedIntent?.outingDate?.date) ??
      metadataString(debug.normalizedIntent?.dateTime?.date) ??
      null;
    const resolvedOutingTime =
      metadataString(normalizedIntent?.outingDate?.time) ??
      metadataString(normalizedIntent?.dateTime?.time) ??
      metadataString(normalizedIntent?.outing?.time) ??
      metadataString(debug.normalizedIntent?.outingDate?.time) ??
      metadataString(debug.normalizedIntent?.dateTime?.time) ??
      null;
    const resolvedOutingDateTime =
      metadataString(normalizedIntent?.outingDate?.dateTime) ??
      metadataString(normalizedIntent?.dateTime?.dateTime) ??
      metadataString(debug.normalizedIntent?.outingDate?.dateTime) ??
      metadataString(debug.normalizedIntent?.dateTime?.dateTime) ??
      null;
    const resolvedOutingTimeLabel =
      metadataString(normalizedIntent?.outingDate?.label) ??
      metadataString(normalizedIntent?.dateTime?.label) ??
      metadataString(debug.normalizedIntent?.outingDate?.label) ??
      metadataString(debug.normalizedIntent?.dateTime?.label) ??
      null;

    void logSearchEvent({
      source: "public_explore_search",
      route: "/api/explore/search",
      rawQuery: query,
      normalizedQuery:
        normalizedIntent?.rawQuery ?? normalizedIntent?.query ?? query,
      searchType: resolvedSearchType,
      primaryDomain: resolvedPrimaryDomain,
      intentParserSource: resolvedIntentParserSource,
      sessionId:
        request.cookies.get("toh_session")?.value ||
        request.headers.get("x-session-id"),
      betaAssignmentId,
      betaTesterId,
      geo: resolvedGeo,
      outingDate: resolvedOutingDate,
      outingTime: resolvedOutingTime,
      outingDateTime: resolvedOutingDateTime,
      outingTimeLabel: resolvedOutingTimeLabel,
      counts: debug?.counts ?? {
        restaurants: result.restaurants?.length ?? 0,
        activities: result.activities?.length ?? 0,
        pairs: result.pairs?.length ?? 0,
        finalDisplayedResultCount: total,
      },
      performance: perf ?? { route: "/api/explore/search" },
      pairingPreference:
        normalizedIntent?.pairingPreference ?? debug?.pairingPreference ?? null,
      success: true,
      hadIssue: Boolean(
        noResultsReason ||
          noPairsReason ||
          debug?.event_type === "no_results" ||
          debug?.event_type === "no_valid_pairs",
      ),
      issueType: noResultsReason
        ? "no_results"
        : noPairsReason
          ? "no_valid_pairs"
          : null,
      issueLabel: noResultsReason ?? noPairsReason ?? null,
      noResultsReason,
      noPairsReason,
      metadata: sanitizeSearchMetadata({
        search_system: debug?.search_system,
        render_mode: debug?.render_mode ?? result.render_mode,
        wantsPairing: normalizedIntent?.wantsPairing,
        needsRestaurant: normalizedIntent?.needsRestaurant,
        needsActivity: normalizedIntent?.needsActivity,
        explore_kind: kind,
        normalizedIntent,
        geo: resolvedGeo,
        searchType: resolvedSearchType,
        primaryDomain: resolvedPrimaryDomain,
        intentParserSource: resolvedIntentParserSource,
      }) as Record<string, any>,
    });

    return NextResponse.json({ success: true, items, restaurants: result.restaurants, activities: result.activities, pairs: result.pairs, note: exploreNote, total, searchPerformance: betaDebug && perf ? { totalMs: perf.total_ms, speedStatus: perf.speed_status, resultCount: perf.result_count } : undefined, debug: betaDebug ? result.debug : undefined });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Explore search failed";
    console.error("EXPLORE_SEARCH_ERROR", error);
    void logSearchEvent({
      source: "public_explore_search",
      route: "/api/explore/search",
      rawQuery: buildExploreQuery(q, kind, area),
      searchType: kind,
      geo: area !== "all" ? { city: area } : null,
      performance: { route: "/api/explore/search", speed_status: "failed" },
      success: false,
      hadIssue: true,
      issueType: "search_error",
      issueLabel: "Explore search failed",
      metadata: { error: message, explore_kind: kind },
    });

    void logSearchHealthEvent({
      source: "public_explore_search",
      rawQuery: buildExploreQuery(q, kind, area),
      result: { success: false, restaurants: [], activities: [], pairs: [], render_mode: "empty" },
      errors: [message],
      speedStatus: "failed",
    });
    return NextResponse.json({ success: false, items: [], restaurants: [], activities: [], total: 0, error: message }, { status: 200 });
  }
}
