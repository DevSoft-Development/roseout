import { NextResponse } from "next/server";
import { isCronRequestAuthorized } from "@/lib/cron-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationName } from "@/lib/locationName";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const AUTO_SECTIONS = ["trending", "popular-searches", "areas", "most-saved"] as const;
const MAX_ITEMS = 8;

function normalizeQuery(value: unknown) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

function countValues(rows: any[], selector: (row: any) => string | null) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = selector(row);
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return counts;
}

function rankedCounts(counts: Map<string, number>, limit = MAX_ITEMS) {
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);
}

function searchHref(query: string) {
  return `/create?q=${encodeURIComponent(query)}`;
}

export async function GET(request: Request) {
  if (!isCronRequestAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const recentFrom = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();
  const previousFrom = new Date(now - 6 * 24 * 60 * 60 * 1000).toISOString();
  const weekFrom = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [recentResult, previousResult, weekResult, locationsResult] = await Promise.all([
    supabaseAdmin
      .from("search_events")
      .select("raw_query,normalized_query,city,borough,neighborhood,success,result_count,created_at")
      .gte("created_at", recentFrom)
      .eq("success", true)
      .limit(10000),
    supabaseAdmin
      .from("search_events")
      .select("raw_query,normalized_query,created_at")
      .gte("created_at", previousFrom)
      .lt("created_at", recentFrom)
      .eq("success", true)
      .limit(10000),
    supabaseAdmin
      .from("search_events")
      .select("raw_query,normalized_query,city,borough,neighborhood,success,result_count,created_at")
      .gte("created_at", weekFrom)
      .eq("success", true)
      .limit(20000),
    supabaseAdmin
      .from("locations")
      .select("id,source_table,location_type,name,restaurant_name,activity_name,city,borough,neighborhood,main_image,image_url,saves_count,is_searchable,is_hidden,data_status,quality_status,deleted_at")
      .eq("is_searchable", true)
      .eq("quality_status", "publish_ready")
      .eq("data_status", "clean")
      .not("is_hidden", "is", true)
      .is("deleted_at", null)
      .gt("saves_count", 0)
      .order("saves_count", { ascending: false, nullsFirst: false })
      .limit(MAX_ITEMS),
  ]);

  const firstError = recentResult.error || previousResult.error || weekResult.error || locationsResult.error;
  if (firstError) {
    console.error("DISCOVER_REFRESH_LOAD_ERROR", firstError.message);
    return NextResponse.json({ error: firstError.message }, { status: 500 });
  }

  const recentRows = recentResult.data || [];
  const previousRows = previousResult.data || [];
  const weekRows = weekResult.data || [];

  const recentQueries = countValues(recentRows, (row) => normalizeQuery(row.normalized_query || row.raw_query).toLowerCase() || null);
  const previousQueries = countValues(previousRows, (row) => normalizeQuery(row.normalized_query || row.raw_query).toLowerCase() || null);
  const weeklyQueries = countValues(weekRows, (row) => normalizeQuery(row.normalized_query || row.raw_query).toLowerCase() || null);

  const trending = Array.from(recentQueries.entries())
    .map(([query, current]) => {
      const previous = previousQueries.get(query) || 0;
      const growth = current - previous;
      const ratio = previous > 0 ? current / previous : current;
      return { query, current, previous, score: current + Math.max(growth, 0) * 2 + Math.max(ratio - 1, 0) };
    })
    .filter((entry) => entry.current >= 2)
    .sort((a, b) => b.score - a.score || b.current - a.current)
    .slice(0, MAX_ITEMS);

  const areaCounts = countValues(weekRows, (row) => {
    const value = normalizeQuery(row.neighborhood || row.borough || row.city);
    return value || null;
  });

  const generatedAt = new Date().toISOString();
  const items: Record<string, unknown>[] = [];

  trending.forEach((entry, index) => items.push({
    section_id: "trending",
    title: titleCase(entry.query),
    subtitle: entry.previous > 0 ? `${entry.current} searches recently · trending up` : `${entry.current} recent searches`,
    query: entry.query,
    href: searchHref(entry.query),
    enabled: true,
    sort_order: (index + 1) * 10,
    metadata: { source: "daily_discover_refresh", generated_at: generatedAt, recent_count: entry.current, previous_count: entry.previous },
  }));

  rankedCounts(weeklyQueries).forEach(([query, count], index) => items.push({
    section_id: "popular-searches",
    title: titleCase(query),
    query,
    href: searchHref(query),
    enabled: true,
    sort_order: (index + 1) * 10,
    metadata: { source: "daily_discover_refresh", generated_at: generatedAt, seven_day_count: count },
  }));

  rankedCounts(areaCounts).forEach(([area, count], index) => items.push({
    section_id: "areas",
    title: area,
    subtitle: `${count} searches in the last 7 days`,
    query: area,
    href: searchHref(area),
    enabled: true,
    sort_order: (index + 1) * 10,
    metadata: { source: "daily_discover_refresh", generated_at: generatedAt, seven_day_count: count },
  }));

  for (const [index, location] of (locationsResult.data || []).entries()) {
    const title = getLocationName(location, "").trim();
    if (!title) continue;
    const sourceType = String(location.source_table || location.location_type || "locations").replace(/^public\./, "");
    items.push({
      section_id: "most-saved",
      title,
      subtitle: [location.neighborhood || location.borough || location.city, Number(location.saves_count || 0) > 0 ? `${Number(location.saves_count).toLocaleString()} saves` : null].filter(Boolean).join(" · "),
      image_url: location.main_image || location.image_url || null,
      href: `/locations/${sourceType}/${location.id}`,
      location_id: location.id,
      enabled: true,
      sort_order: (index + 1) * 10,
      metadata: { source: "daily_discover_refresh", generated_at: generatedAt, saves_count: Number(location.saves_count || 0) },
    });
  }

  const { error: deleteError } = await supabaseAdmin.from("discover_items").delete().in("section_id", [...AUTO_SECTIONS]);
  if (deleteError) {
    console.error("DISCOVER_REFRESH_DELETE_ERROR", deleteError.message);
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  if (items.length) {
    const { error: insertError } = await supabaseAdmin.from("discover_items").insert(items);
    if (insertError) {
      console.error("DISCOVER_REFRESH_INSERT_ERROR", insertError.message);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  await supabaseAdmin.from("discover_sections").update({ updated_at: generatedAt }).in("id", [...AUTO_SECTIONS]);

  return NextResponse.json({
    ok: true,
    generatedAt,
    counts: {
      trending: trending.length,
      popularSearches: Math.min(weeklyQueries.size, MAX_ITEMS),
      areas: Math.min(areaCounts.size, MAX_ITEMS),
      mostSaved: (locationsResult.data || []).length,
    },
  });
}
