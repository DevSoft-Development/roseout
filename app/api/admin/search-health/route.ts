import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

type RangeKey = "24h" | "7d" | "30d";

const RANGE_MS: Record<RangeKey, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

const SEARCH_HEALTH_SLOW_WARNING_MS = 5000;
const SEARCH_HEALTH_SLOW_STATUSES = new Set([
  "degraded",
  "critical",
  "timeout",
  "failed",
]);

function isTrueSlowSearch(row: any) {
  const speedStatus = String(row.speed_status ?? "").toLowerCase();
  return (
    row.event_type === "slow_search" ||
    SEARCH_HEALTH_SLOW_STATUSES.has(speedStatus) ||
    Number(row.timing_ms ?? getPerformance(row).total_ms ?? 0) >
      SEARCH_HEALTH_SLOW_WARNING_MS
  );
}

const RECENT_COLUMNS =
  "id,created_at,source,raw_query,normalized_search_type,primary_domain,event_type,severity,event_label,pair_count,restaurant_count,activity_count,no_results_reason,no_pairs_reason,timing_ms,speed_status,default_market_id,review_status,distance_mode,max_pair_walking_minutes,debug";

const SEARCH_EVENT_COLUMNS =
  "id,created_at,source,route,raw_query,normalized_query,search_type,primary_domain,intent_parser_source,user_id,anonymous_id,session_id,default_market_id,city,state,borough,neighborhood,outing_date,outing_time,outing_datetime,outing_time_label,restaurant_count,activity_count,pair_count,result_count,pair_candidates_evaluated,valid_pair_count_before_render,wants_pairing,needs_restaurant,needs_activity,distance_mode,max_pair_distance_miles,max_pair_walking_minutes,timing_ms,llm_ms,rpc_ms,pairing_ms,ranking_ms,speed_status,success,had_issue,issue_type,issue_label,no_results_reason,no_pairs_reason,metadata";

function parseRange(value: string | null): RangeKey {
  return value === "24h" || value === "7d" || value === "30d" ? value : "24h";
}

function sinceIso(range: RangeKey) {
  return new Date(Date.now() - RANGE_MS[range]).toISOString();
}

function dateBoundsIso(date: string | null) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const start = new Date(`${date}T00:00:00`);
  const end = new Date(start);
  end.setDate(start.getDate() + 1);

  return {
    fromIso: start.toISOString(),
    toIso: end.toISOString(),
  };
}

function cleanFilter(value: string | null) {
  const trimmed = (value ?? "").trim();
  return trimmed || null;
}

function escapeIlike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&").slice(0, 120);
}

async function countWhere(apply: (query: any) => any) {
  const { count, error } = await apply(
    supabaseAdmin.from("search_health_events").select("id", {
      count: "exact",
      head: true,
    }),
  );
  if (error) throw error;
  return count ?? 0;
}

function applyTimeRange(query: any, fromIso: string, toIso?: string | null) {
  let next = query.gte("created_at", fromIso);
  if (toIso) next = next.lt("created_at", toIso);
  return next;
}

function applyHealthFilters(
  query: any,
  filters: Record<string, string | null>,
  fromIso: string,
  toIso?: string | null,
  q?: string | null,
  exactQuery?: boolean,
  trueSlowOnly = false,
) {
  let next = applyTimeRange(query, fromIso, toIso);

  for (const [key, value] of Object.entries(filters)) {
    if (value) next = next.eq(key, value);
  }

  if (trueSlowOnly) {
    next = next.or(
      `event_type.eq.slow_search,speed_status.in.(${Array.from(
        SEARCH_HEALTH_SLOW_STATUSES,
      ).join(",")}),timing_ms.gt.${SEARCH_HEALTH_SLOW_WARNING_MS}`,
    );
  }

  if (q) {
    const cleaned = q.replace(/^"|"$/g, "");
    const escaped = escapeIlike(cleaned);

    if (exactQuery) {
      next = next.ilike("raw_query", escaped);
    } else {
      next = next.or(
        [
          `raw_query.ilike.%${escaped}%`,
          `event_label.ilike.%${escaped}%`,
          `event_type.ilike.%${escaped}%`,
          `severity.ilike.%${escaped}%`,
          `source.ilike.%${escaped}%`,
          `speed_status.ilike.%${escaped}%`,
          `no_pairs_reason.ilike.%${escaped}%`,
          `no_results_reason.ilike.%${escaped}%`,
          `default_market_id.ilike.%${escaped}%`,
          `normalized_search_type.ilike.%${escaped}%`,
          `primary_domain.ilike.%${escaped}%`,
          `review_status.ilike.%${escaped}%`,
        ].join(","),
      );
    }
  }

  return next;
}

function applySearchEventFilters(
  query: any,
  filters: Record<string, string | null>,
  fromIso: string,
  toIso?: string | null,
  q?: string | null,
  exactQuery?: boolean,
) {
  let next = applyTimeRange(query, fromIso, toIso);

  for (const [key, value] of Object.entries(filters)) {
    if (value) next = next.eq(key, value);
  }

  if (q) {
    const cleaned = q.replace(/^"|"$/g, "");
    const escaped = escapeIlike(cleaned);

    if (exactQuery) {
      next = next.ilike("raw_query", escaped);
    } else {
      next = next.or(
        [
          `raw_query.ilike.%${escaped}%`,
          `normalized_query.ilike.%${escaped}%`,
          `source.ilike.%${escaped}%`,
          `route.ilike.%${escaped}%`,
          `search_type.ilike.%${escaped}%`,
          `primary_domain.ilike.%${escaped}%`,
          `intent_parser_source.ilike.%${escaped}%`,
          `city.ilike.%${escaped}%`,
          `state.ilike.%${escaped}%`,
          `borough.ilike.%${escaped}%`,
          `neighborhood.ilike.%${escaped}%`,
          `issue_type.ilike.%${escaped}%`,
          `issue_label.ilike.%${escaped}%`,
          `no_results_reason.ilike.%${escaped}%`,
          `no_pairs_reason.ilike.%${escaped}%`,
        ].join(","),
      );
    }
  }

  return next;
}

function topCounts(
  rows: any[],
  key: string,
  outputKey: "type" | "reason" = "reason",
) {
  const counts = new Map<
    string,
    { count: number; exampleQuery?: string | null }
  >();
  for (const row of rows) {
    const value =
      typeof row?.[key] === "string" && row[key].trim()
        ? row[key].trim()
        : null;
    if (!value) continue;
    const current = counts.get(value) ?? { count: 0, exampleQuery: null };
    current.count += 1;
    if (!current.exampleQuery && row.raw_query)
      current.exampleQuery = row.raw_query;
    counts.set(value, current);
  }
  return Array.from(counts, ([value, meta]) => ({
    [outputKey]: value,
    reason: value,
    count: meta.count,
    exampleQuery: meta.exampleQuery,
  }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        String((a as any)[outputKey]).localeCompare(
          String((b as any)[outputKey]),
        ),
    )
    .slice(0, 12);
}

function sourceCounts(rows: any[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const source =
      typeof row?.source === "string" && row.source.trim()
        ? row.source.trim()
        : "unknown";
    counts.set(source, (counts.get(source) ?? 0) + 1);
  }
  return Array.from(counts, ([source, count]) => ({ source, count })).sort(
    (a, b) => b.count - a.count || a.source.localeCompare(b.source),
  );
}

function getDebug(row: any) {
  return row?.debug && typeof row.debug === "object" ? row.debug : {};
}

function getCounts(row: any) {
  return getDebug(row).counts ?? {};
}

function getPerformance(row: any) {
  return getDebug(row).performance ?? {};
}

function rejectionReasons(row: any): Record<string, number> {
  return getDebug(row).rejectionReasons ?? {};
}

function rejectedCount(row: any) {
  const reasons = rejectionReasons(row);
  const groupedTotal = Object.values(reasons).reduce(
    (sum, value) => sum + (Number(value) || 0),
    0,
  );
  const counts = getCounts(row);
  return (
    groupedTotal ||
    Number(counts.pairsRejectedForDistance ?? 0) +
      Number(counts.pairsRejectedForMissingCoordinates ?? 0) +
      Number(counts.extremeWalkingRoutesRejected ?? 0) +
      Number(counts.invalidWalkingRoutesHiddenFromDisplay ?? 0)
  );
}

function topRejectionReason(row: any) {
  const entries = Object.entries(rejectionReasons(row)).filter(
    ([, value]) => Number(value) > 0,
  );
  if (!entries.length) return null;
  entries.sort(
    (a, b) => Number(b[1]) - Number(a[1]) || a[0].localeCompare(b[0]),
  );
  return entries[0][0];
}

function walkingRequested(row: any) {
  const pref = getDebug(row).pairingPreference ?? {};
  const mode = String(
    row.distance_mode ?? pref.distanceMode ?? "",
  ).toLowerCase();
  return Boolean(
    pref.requireWalkablePair === true ||
    ["walking", "short_walk", "walk"].includes(mode) ||
    Number(row.max_pair_walking_minutes ?? pref.maxPairWalkingMinutes ?? 0) > 0,
  );
}

function problemFlags(row: any) {
  const counts = getCounts(row);
  const reasons = rejectionReasons(row);
  const flags: string[] = [];
  const resultCount =
    Number(counts.finalDisplayedResultCount ?? row.restaurant_count ?? 0) +
    Number(row.activity_count ?? 0) +
    Number(row.pair_count ?? 0);
  if (
    resultCount === 0 ||
    row.event_type === "no_restaurant_results" ||
    row.event_type === "no_activity_results" ||
    row.no_results_reason
  )
    flags.push("no_results");
  if (
    Number(row.pair_count ?? 0) === 0 &&
    (row.no_pairs_reason || row.event_type === "no_valid_pairs")
  )
    flags.push("no_valid_pairs");
  if (walkingRequested(row) && Number(row.pair_count ?? 0) === 0)
    flags.push("walking_requested_no_walkable_pair");
  if (Number(reasons.walking_route_exceeds_requested_minutes ?? 0) > 0)
    flags.push("rejected_walking_route_over_limit");
  if (
    walkingRequested(row) &&
    Number(
      reasons.missing_coordinates ??
        counts.pairsRejectedForMissingCoordinates ??
        0,
    ) > 0
  )
    flags.push("distance_unavailable_for_walking_request");
  if (
    Number(row.timing_ms ?? getPerformance(row).total_ms ?? 0) >
    SEARCH_HEALTH_SLOW_WARNING_MS
  )
    flags.push("slow_search_over_5000ms");
  return flags;
}

function enrichEvent(row: any) {
  const debug = getDebug(row);
  const perf = getPerformance(row);
  const counts = getCounts(row);
  return {
    ...row,
    route: perf.route ?? debug.route ?? row.route ?? null,
    intentParserSource:
      debug.intentParserSource ?? perf.intentParserSource ?? null,
    debugSearchSystem: debug.search_system ?? null,
    debugRenderMode: debug.render_mode ?? null,
    searchType: debug.searchType ?? row.normalized_search_type ?? null,
    resultCount:
      counts.finalDisplayedResultCount ??
      perf.result_count ??
      row.restaurant_count ??
      0,
    walkingLimit:
      row.max_pair_walking_minutes ??
      debug.pairingPreference?.maxPairWalkingMinutes ??
      null,
    rejectedCount: rejectedCount(row),
    topRejectionReason: topRejectionReason(row),
    problemFlags: problemFlags(row),
  };
}

function commonQueries(rows: any[]) {
  const issueTypes = new Set([
    "no_valid_pairs",
    "no_results",
    "no_activity_results",
    "no_restaurant_results",
    "search_error",
  ]);
  const counts = new Map<
    string,
    {
      query: string;
      count: number;
      lastSeen: string | null;
      eventType?: string | null;
    }
  >();
  for (const row of rows) {
    if (
      row.event_type &&
      !issueTypes.has(row.event_type) &&
      !row.no_pairs_reason &&
      !row.no_results_reason
    )
      continue;
    const query =
      typeof row?.raw_query === "string" ? row.raw_query.trim() : "";
    if (!query) continue;
    const key = query.toLowerCase();
    const current = counts.get(key) ?? {
      query,
      count: 0,
      lastSeen: null,
      eventType: row.event_type,
    };
    current.count += 1;
    if (!current.lastSeen || String(row.created_at) > current.lastSeen)
      current.lastSeen = row.created_at;
    counts.set(key, current);
  }
  return Array.from(counts.values())
    .sort(
      (a, b) =>
        b.count - a.count ||
        String(b.lastSeen).localeCompare(String(a.lastSeen)),
    )
    .slice(0, 12);
}

export async function GET(req: Request) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.searchHealth);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(req.url);
    const view = cleanFilter(searchParams.get("view")) ?? "issues";
    const date = cleanFilter(searchParams.get("date"));
    const q = cleanFilter(searchParams.get("q"));
    const exactQuery = searchParams.get("exactQuery") === "true";

    const range = parseRange(searchParams.get("range"));
    const customBounds = dateBoundsIso(date);
    const fromIso = customBounds?.fromIso ?? sinceIso(range);
    const toIso = customBounds?.toIso ?? null;

    const healthFilters = {
      source: cleanFilter(searchParams.get("source")),
      review_status: cleanFilter(searchParams.get("review_status")),
      speed_status: cleanFilter(searchParams.get("speed_status")),
      no_pairs_reason: cleanFilter(searchParams.get("no_pairs_reason")),
      no_results_reason: cleanFilter(searchParams.get("no_results_reason")),
      severity: cleanFilter(searchParams.get("severity")),
      event_type: cleanFilter(searchParams.get("event_type")),
    };

    const slowViewUsesTrueSlowFilter =
      view === "slow" &&
      !healthFilters.speed_status &&
      !healthFilters.event_type;
    if (view === "no_results" && !healthFilters.event_type) {
      healthFilters.event_type = "no_results";
    }
    if (view === "no_pairs" && !healthFilters.event_type) {
      healthFilters.event_type = "no_valid_pairs";
    }
    if (view === "debug" && !healthFilters.event_type) {
      healthFilters.event_type = "successful_debug_run";
    }

    const searchEventFilters = {
      source: cleanFilter(searchParams.get("source")),
      speed_status: cleanFilter(searchParams.get("speed_status")),
      search_type: cleanFilter(searchParams.get("search_type")),
      primary_domain: cleanFilter(searchParams.get("primary_domain")),
      issue_type: cleanFilter(searchParams.get("issue_type")),
    };

    let allSearches: any[] = [];

    if (view === "all") {
      const { data, error } = await applySearchEventFilters(
        supabaseAdmin
          .from("search_events")
          .select(SEARCH_EVENT_COLUMNS)
          .order("created_at", { ascending: false })
          .limit(200),
        searchEventFilters,
        fromIso,
        toIso,
        q,
        exactQuery,
      );

      if (error) throw error;
      allSearches = data ?? [];
    }

    const [
      { data: recentEvents, error: recentError },
      aggregateResult,
      digestResult,
    ] = await Promise.all([
      applyHealthFilters(
        supabaseAdmin
          .from("search_health_events")
          .select(RECENT_COLUMNS)
          .order("created_at", { ascending: false })
          .limit(100),
        healthFilters,
        fromIso,
        toIso,
        q,
        exactQuery,
        slowViewUsesTrueSlowFilter,
      ),
      applyHealthFilters(
        supabaseAdmin
          .from("search_health_events")
          .select(RECENT_COLUMNS)
          .order("created_at", { ascending: false })
          .limit(5000),
        healthFilters,
        fromIso,
        toIso,
        q,
        exactQuery,
        slowViewUsesTrueSlowFilter,
      ),
      supabaseAdmin
        .from("search_health_digest_runs")
        .select(
          "id,created_at,source,sent,recipient_count,total_events,error_count,warning_count,no_pair_count,no_result_count,slow_count,response",
        )
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (recentError) throw recentError;
    if (aggregateResult.error) throw aggregateResult.error;

    const aggregateRows = aggregateResult.data ?? [];
    const now = Date.now();
    const last24hIso = new Date(now - RANGE_MS["24h"]).toISOString();
    const last7dIso = new Date(now - RANGE_MS["7d"]).toISOString();

    const [
      totalEvents,
      totalEventsLast24h,
      totalEventsLast7d,
      unresolvedEvents,
    ] = await Promise.all([
      countWhere((query) => query),
      countWhere((query) => query.gte("created_at", last24hIso)),
      countWhere((query) => query.gte("created_at", last7dIso)),
      countWhere((query) => query.in("review_status", ["new", "reviewing"])),
    ]);

    const summary = {
      totalEvents,
      totalEventsLast24h,
      totalEventsLast7d,
      errors: aggregateRows.filter((row: any) =>
        ["error", "critical"].includes(String(row.severity)),
      ).length,
      warnings: aggregateRows.filter((row: any) => row.severity === "warning")
        .length,
      infoEvents: aggregateRows.filter((row: any) => row.severity === "info")
        .length,
      noResultSearches: aggregateRows.filter(
        (row: any) =>
          row.no_results_reason ||
          [
            "no_restaurant_results",
            "no_activity_results",
            "no_results",
          ].includes(row.event_type),
      ).length,
      noPairSearches: aggregateRows.filter(
        (row: any) =>
          row.no_pairs_reason || row.event_type === "no_valid_pairs",
      ).length,
      lowPairCountSearches: aggregateRows.filter(
        (row: any) => row.event_type === "low_pair_count",
      ).length,
      slowSearches: aggregateRows.filter(isTrueSlowSearch).length,
      unresolvedEvents,
      latestEventCreatedAt: aggregateRows[0]?.created_at ?? null,
    };

    const slowestSearches = [...aggregateRows]
      .filter((row: any) => row.timing_ms != null)
      .sort(
        (a: any, b: any) => Number(b.timing_ms ?? 0) - Number(a.timing_ms ?? 0),
      )
      .slice(0, 12)
      .map((row: any) => ({
        id: row.id,
        created_at: row.created_at,
        raw_query: row.raw_query,
        timing_ms: row.timing_ms,
        source: row.source,
        speed_status: row.speed_status,
        last_seen: row.created_at,
      }));

    return NextResponse.json({
      success: true,
      view,
      range,
      filters: {
        view,
        range,
        date,
        from: fromIso,
        to: toIso,
        q,
        exactQuery,
        source: searchParams.get("source"),
        severity: searchParams.get("severity"),
        eventType: searchParams.get("event_type"),
        reviewStatus: searchParams.get("review_status"),
        speedStatus: searchParams.get("speed_status"),
      },
      matchCount: view === "all" ? allSearches.length : (recentEvents ?? []).length,
      allSearches,
      recentEvents: (recentEvents ?? []).map(enrichEvent),
      summary,
      topEventTypes: topCounts(aggregateRows, "event_type", "type"),
      topNoPairReasons: topCounts(aggregateRows, "no_pairs_reason"),
      topNoResultReasons: topCounts(aggregateRows, "no_results_reason"),
      slowestSearches,
      commonFailingQueries: commonQueries(aggregateRows),
      eventsBySource: sourceCounts(aggregateRows),
      lastDigestRun: digestResult.error ? null : (digestResult.data ?? null),
    });
  } catch (error) {
    console.error("ADMIN_SEARCH_HEALTH_ERROR", error);
    return NextResponse.json(
      { success: false, error: "Failed to load search health" },
      { status: 500 },
    );
  }
}
