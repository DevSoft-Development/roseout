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

const RECENT_COLUMNS = "id,created_at,source,raw_query,normalized_search_type,primary_domain,pair_count,restaurant_count,activity_count,no_results_reason,no_pairs_reason,timing_ms,speed_status,default_market_id,review_status";

function parseRange(value: string | null): RangeKey {
  return value === "24h" || value === "7d" || value === "30d" ? value : "7d";
}

function sinceIso(range: RangeKey) {
  return new Date(Date.now() - RANGE_MS[range]).toISOString();
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

function applyFilters(query: any, filters: Record<string, string | null>, fromIso: string, q?: string | null) {
  let next = query.gte("created_at", fromIso);
  for (const [key, value] of Object.entries(filters)) {
    if (value) next = next.eq(key, value);
  }
  if (q) next = next.ilike("raw_query", `%${escapeIlike(q)}%`);
  return next;
}

function topCounts(rows: any[], key: string) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = typeof row?.[key] === "string" && row[key].trim() ? row[key].trim() : null;
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts, ([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
    .slice(0, 12);
}

function commonQueries(rows: any[]) {
  const counts = new Map<string, { query: string; count: number; lastSeen: string | null }>();
  for (const row of rows) {
    const query = typeof row?.raw_query === "string" ? row.raw_query.trim() : "";
    if (!query) continue;
    const key = query.toLowerCase();
    const current = counts.get(key) ?? { query, count: 0, lastSeen: null };
    current.count += 1;
    if (!current.lastSeen || String(row.created_at) > current.lastSeen) current.lastSeen = row.created_at;
    counts.set(key, current);
  }
  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count || String(b.lastSeen).localeCompare(String(a.lastSeen)))
    .slice(0, 12);
}

export async function GET(req: Request) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.searchHealth);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(req.url);
    const range = parseRange(searchParams.get("range"));
    const fromIso = sinceIso(range);
    const filters = {
      source: cleanFilter(searchParams.get("source")),
      review_status: cleanFilter(searchParams.get("review_status")),
      speed_status: cleanFilter(searchParams.get("speed_status")),
      no_pairs_reason: cleanFilter(searchParams.get("no_pairs_reason")),
      no_results_reason: cleanFilter(searchParams.get("no_results_reason")),
    };
    const q = cleanFilter(searchParams.get("q"));

    let recentQuery = applyFilters(
      supabaseAdmin
        .from("search_health_events")
        .select(RECENT_COLUMNS)
        .order("created_at", { ascending: false })
        .limit(100),
      filters,
      fromIso,
      q,
    );

    const [{ data: recentEvents, error: recentError }, aggregateResult] = await Promise.all([
      recentQuery,
      applyFilters(
        supabaseAdmin
          .from("search_health_events")
          .select(`${RECENT_COLUMNS},debug`)
          .order("created_at", { ascending: false })
          .limit(5000),
        filters,
        fromIso,
        q,
      ),
    ]);

    if (recentError) throw recentError;
    if (aggregateResult.error) throw aggregateResult.error;

    const aggregateRows = aggregateResult.data ?? [];
    const now = Date.now();
    const last24hIso = new Date(now - RANGE_MS["24h"]).toISOString();
    const last7dIso = new Date(now - RANGE_MS["7d"]).toISOString();

    const [totalEvents, totalEventsLast24h, totalEventsLast7d, unresolvedEvents] = await Promise.all([
      countWhere((query) => query),
      countWhere((query) => query.gte("created_at", last24hIso)),
      countWhere((query) => query.gte("created_at", last7dIso)),
      countWhere((query) => query.in("review_status", ["new", "reviewing"])),
    ]);

    const summary = {
      totalEvents,
      totalEventsLast24h,
      totalEventsLast7d,
      noResultSearches: aggregateRows.filter((row: any) => row.no_results_reason).length,
      noPairSearches: aggregateRows.filter((row: any) => row.no_pairs_reason || row.pair_count === 0).length,
      slowSearches: aggregateRows.filter((row: any) => ["slow", "degraded", "critical", "timeout"].includes(String(row.speed_status ?? "")) || Number(row.timing_ms ?? 0) > 3000).length,
      unresolvedEvents,
    };

    const slowestSearches = [...aggregateRows]
      .filter((row: any) => row.timing_ms != null)
      .sort((a: any, b: any) => Number(b.timing_ms ?? 0) - Number(a.timing_ms ?? 0))
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
      range,
      summary,
      recentEvents: recentEvents ?? [],
      topNoPairReasons: topCounts(aggregateRows, "no_pairs_reason"),
      topNoResultReasons: topCounts(aggregateRows, "no_results_reason"),
      slowestSearches,
      commonFailingQueries: commonQueries(aggregateRows),
    });
  } catch (error) {
    console.error("ADMIN_SEARCH_HEALTH_ERROR", error);
    return NextResponse.json({ success: false, error: "Failed to load search health" }, { status: 500 });
  }
}
