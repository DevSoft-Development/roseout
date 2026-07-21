import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { runOutingSearch } from "@/lib/search/runSearch";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type BenchmarkQuery = {
  id: string;
  query_key: string;
  query_text: string;
  expected_result_type: "restaurant" | "activity" | "pair" | "any";
  expected_market: string | null;
};

type RankedItem = {
  item: Record<string, any>;
  type: "restaurant" | "activity" | "pair" | "matched_location";
};

function locationId(item: Record<string, any>) {
  const value = item.location_id ?? item.locationId ?? item.id;
  return typeof value === "string" ? value : null;
}

function pairIds(item: Record<string, any>) {
  const restaurant =
    item.restaurant ?? item.restaurant_location ?? item.restaurantLocation ?? {};
  const activity =
    item.activity ?? item.activity_location ?? item.activityLocation ?? {};

  return {
    restaurantId:
      item.restaurant_location_id ??
      item.restaurantLocationId ??
      item.restaurant_id ??
      item.restaurantId ??
      locationId(restaurant),
    activityId:
      item.activity_location_id ??
      item.activityLocationId ??
      item.activity_id ??
      item.activityId ??
      locationId(activity),
  };
}

function isPairItem(item: Record<string, any>) {
  const ids = pairIds(item);
  return Boolean(
    (ids.restaurantId && ids.activityId) ||
      (item.restaurant && item.activity) ||
      item.pair_id ||
      item.pairId,
  );
}

function inferType(item: Record<string, any>): RankedItem["type"] {
  if (isPairItem(item)) return "pair";

  const rawType = String(
    item.result_type ?? item.resultType ?? item.location_type ?? item.type ?? "",
  ).toLowerCase();

  if (rawType.includes("restaurant")) return "restaurant";
  if (rawType.includes("activity")) return "activity";
  return "matched_location";
}

function resultKey(entry: RankedItem) {
  if (entry.type === "pair") {
    const ids = pairIds(entry.item);
    return ids.restaurantId && ids.activityId
      ? `pair:${ids.restaurantId}:${ids.activityId}`
      : null;
  }

  const id = locationId(entry.item);
  return id ? `location:${id}` : null;
}

function collect(result: any, expectedType: BenchmarkQuery["expected_result_type"]): RankedItem[] {
  const pairs = Array.isArray(result?.pairs)
    ? result.pairs.map((item: Record<string, any>) => ({
        item,
        type: "pair" as const,
      }))
    : [];

  const cards = Array.isArray(result?.cards)
    ? result.cards.map((item: Record<string, any>) => ({
        item,
        type: inferType(item),
      }))
    : [];

  const restaurants = Array.isArray(result?.restaurants)
    ? result.restaurants.map((item: Record<string, any>) => ({
        item,
        type: "restaurant" as const,
      }))
    : [];

  const activities = Array.isArray(result?.activities)
    ? result.activities.map((item: Record<string, any>) => ({
        item,
        type: "activity" as const,
      }))
    : [];

  const matched = Array.isArray(result?.matched_locations)
    ? result.matched_locations.map((item: Record<string, any>) => ({
        item,
        type: inferType(item),
      }))
    : [];

  const ordered =
    expectedType === "pair"
      ? [...pairs, ...cards, ...restaurants, ...activities, ...matched]
      : [...cards, ...pairs, ...restaurants, ...activities, ...matched];

  const seen = new Set<string>();
  return ordered.filter((entry) => {
    const key = resultKey(entry);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function displayName(item: Record<string, any>) {
  return (
    item.name ??
    item.restaurant_name ??
    item.activity_name ??
    item.title ??
    null
  );
}

function pairMetadata(item: Record<string, any>) {
  const restaurant =
    item.restaurant ?? item.restaurant_location ?? item.restaurantLocation ?? {};
  const activity =
    item.activity ?? item.activity_location ?? item.activityLocation ?? {};
  const ids = pairIds(item);

  return {
    restaurant_location_id: ids.restaurantId,
    activity_location_id: ids.activityId,
    restaurant_name:
      item.restaurant_name ?? item.restaurantName ?? displayName(restaurant),
    activity_name:
      item.activity_name ?? item.activityName ?? displayName(activity),
    pair_distance_miles:
      item.distance_miles ?? item.distanceMiles ?? item.pair_distance_miles ?? null,
    walking_minutes:
      item.walking_minutes ?? item.walkingMinutes ?? item.walk_minutes ?? null,
  };
}

function gain(grade: number, rank: number) {
  return (Math.pow(2, grade) - 1) / Math.log2(rank + 1);
}

export async function POST(_request: NextRequest) {
  const { error: authError } = await requireAdminApiRole(
    ADMIN_PAGE_ACCESS.searchHealth,
  );
  if (authError) return authError;

  const { data: queries, error: queryError } = await supabaseAdmin
    .from("search_benchmark_queries")
    .select("id,query_key,query_text,expected_result_type,expected_market")
    .eq("active", true)
    .order("query_key");
  if (queryError) throw queryError;

  const benchmarkQueries = (queries ?? []) as BenchmarkQuery[];
  const runKey = `phase4c-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const { data: run, error: runError } = await supabaseAdmin
    .from("search_benchmark_runs")
    .insert({ run_key: runKey, query_count: benchmarkQueries.length })
    .select("id")
    .single();
  if (runError) throw runError;

  for (const query of benchmarkQueries) {
    const searchId = randomUUID();
    const searchResult = await runOutingSearch({
      query: query.query_text,
      market: query.expected_market,
      source: "phase4c_benchmark",
      route: "/api/admin/search-benchmark/run",
      displayLimit: 12,
      useLLM: true,
      logPerformance: true,
      body: {
        is_test_event: true,
        traffic_type: "internal_test",
        benchmark_query_key: query.query_key,
      },
    });

    const control = collect(searchResult, query.expected_result_type).slice(0, 12);
    const keys = control.map(resultKey).filter((key): key is string => Boolean(key));

    const { data: labels } = await supabaseAdmin
      .from("search_benchmark_labels")
      .select("result_key,relevance_grade,violation_codes")
      .eq("query_id", query.id)
      .in("result_key", keys.length ? keys : ["__none__"]);

    const labelMap = new Map(
      (labels ?? []).map((row: any) => [row.result_key, row]),
    );

    const { data: shadowRows } = await supabaseAdmin
      .from("search_shadow_rankings")
      .select("location_id,shadow_rank")
      .eq("search_id", searchId)
      .order("shadow_rank");

    const shadowRank = new Map(
      (shadowRows ?? []).map((row: any) => [
        `location:${row.location_id}`,
        Number(row.shadow_rank),
      ]),
    );

    const rows = control.flatMap((entry, index) => {
      const key = resultKey(entry);
      if (!key) return [];

      const label = labelMap.get(key) as any;
      const grade = Number(label?.relevance_grade ?? 0);
      const violations = Array.isArray(label?.violation_codes)
        ? label.violation_codes
        : [];
      const controlRank = index + 1;
      const shadowPosition = shadowRank.get(key) ?? controlRank;
      const metadata = {
        result_type: entry.type,
        query_key: query.query_key,
        name: entry.type === "pair" ? null : displayName(entry.item),
        ...(entry.type === "pair" ? pairMetadata(entry.item) : {}),
      };

      const ranked = {
        run_id: run.id,
        query_id: query.id,
        search_id: searchId,
        result_key: key,
        relevance_grade: grade,
        violation_codes: violations,
        precision_eligible: grade >= 2 && violations.length === 0,
        reciprocal_rank: grade >= 2 ? 1 / controlRank : 0,
        dcg_gain: gain(grade, controlRank),
        metadata,
      };

      return [
        { ...ranked, variant: "control", rank: controlRank },
        {
          ...ranked,
          variant: "shadow",
          rank: shadowPosition,
          reciprocal_rank: grade >= 2 ? 1 / shadowPosition : 0,
          dcg_gain: gain(grade, shadowPosition),
        },
      ];
    });

    if (rows.length) {
      const { error } = await supabaseAdmin
        .from("search_benchmark_run_results")
        .insert(rows);
      if (error) throw error;
    }
  }

  const { data: scorecardRows } = await supabaseAdmin
    .from("search_benchmark_scorecard_v1")
    .select("*")
    .eq("id", run.id)
    .limit(1);

  const scorecard = scorecardRows?.[0] ?? {};
  const controlScore = Number(scorecard.control_ndcg_at_5 ?? 0);
  const shadowScore = Number(scorecard.shadow_ndcg_at_5 ?? 0);
  const labeledQueryCount = benchmarkQueries.length;
  const releaseGatePassed =
    labeledQueryCount >= 10 &&
    shadowScore >= controlScore &&
    Number(scorecard.shadow_wrong_domain_rate ?? 0) <=
      Number(scorecard.control_wrong_domain_rate ?? 0) &&
    Number(scorecard.shadow_wrong_market_rate ?? 0) <=
      Number(scorecard.control_wrong_market_rate ?? 0);

  const { error: completeError } = await supabaseAdmin
    .from("search_benchmark_runs")
    .update({
      status: releaseGatePassed ? "passed" : "warning",
      completed_at: new Date().toISOString(),
      labeled_query_count: labeledQueryCount,
      control_score: controlScore,
      shadow_score: shadowScore,
      score_delta: shadowScore - controlScore,
      release_gate_passed: releaseGatePassed,
      summary: {
        mode: "offline_benchmark",
        live_reranking_applied: false,
        pair_candidates_preserved: true,
      },
    })
    .eq("id", run.id);
  if (completeError) throw completeError;

  return NextResponse.json({
    success: true,
    run_id: run.id,
    run_key: runKey,
    release_gate_passed: releaseGatePassed,
    live_reranking_applied: false,
  });
}
