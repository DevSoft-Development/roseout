import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
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
  type: string;
};

function locationId(item: Record<string, any>) {
  const value = item.location_id ?? item.locationId ?? item.id;
  return typeof value === "string" ? value : null;
}

function pairIds(item: Record<string, any>) {
  const restaurant = item.restaurant ?? item.restaurant_location ?? {};
  const activity = item.activity ?? item.activity_location ?? {};
  return {
    restaurantId:
      item.restaurant_location_id ?? item.restaurantLocationId ?? locationId(restaurant),
    activityId:
      item.activity_location_id ?? item.activityLocationId ?? locationId(activity),
  };
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

function collect(result: any): RankedItem[] {
  const cards = Array.isArray(result?.cards) ? result.cards : [];
  if (cards.length) {
    return cards.map((item: Record<string, any>) => ({
      item,
      type:
        item.result_type ??
        item.resultType ??
        item.type ??
        (item.restaurant && item.activity ? "pair" : "matched_location"),
    }));
  }
  return [
    ...(Array.isArray(result?.pairs)
      ? result.pairs.map((item: Record<string, any>) => ({ item, type: "pair" }))
      : []),
    ...(Array.isArray(result?.restaurants)
      ? result.restaurants.map((item: Record<string, any>) => ({ item, type: "restaurant" }))
      : []),
    ...(Array.isArray(result?.activities)
      ? result.activities.map((item: Record<string, any>) => ({ item, type: "activity" }))
      : []),
    ...(Array.isArray(result?.matched_locations)
      ? result.matched_locations.map((item: Record<string, any>) => ({
          item,
          type: "matched_location",
        }))
      : []),
  ];
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

    const control = collect(searchResult).slice(0, 12);
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
        metadata: { result_type: entry.type, query_key: query.query_key },
      };
      return [
        { ...ranked, variant: "control", rank: controlRank },
        {
          ...ranked,
          variant: "shadow",
          rank: shadowRank.get(key) ?? controlRank,
          reciprocal_rank:
            grade >= 2 ? 1 / (shadowRank.get(key) ?? controlRank) : 0,
          dcg_gain: gain(grade, shadowRank.get(key) ?? controlRank),
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
      summary: { mode: "offline_benchmark", live_reranking_applied: false },
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
