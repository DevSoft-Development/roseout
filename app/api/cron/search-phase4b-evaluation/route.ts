import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { runOutingSearch } from "@/lib/search/runSearch";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Scenario = {
  id: string;
  scenario_key: string;
  prompt: string;
  expected_result_type: string | null;
  expected_market: string | null;
  expected_min_results: number;
  metadata: Record<string, unknown> | null;
};

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const authorization = request.headers.get("authorization");
  return authorization === `Bearer ${secret}`;
}

function getLocationId(value: any): string | null {
  const candidate =
    value?.location_id ??
    value?.locationId ??
    value?.id ??
    value?.restaurant_location_id ??
    value?.activity_location_id ??
    null;
  return typeof candidate === "string" && candidate ? candidate : null;
}

function getPairIds(value: any) {
  const restaurant = value?.restaurant ?? value?.restaurant_location ?? null;
  const activity = value?.activity ?? value?.activity_location ?? null;
  return {
    restaurantLocationId:
      value?.restaurant_location_id ?? getLocationId(restaurant),
    activityLocationId:
      value?.activity_location_id ?? getLocationId(activity),
  };
}

function numericScore(value: any): number | null {
  const score = Number(
    value?.final_score ?? value?.finalScore ?? value?.score ?? value?.ranking_score,
  );
  return Number.isFinite(score) ? score : null;
}

function collectResults(result: any) {
  const cards = Array.isArray(result?.cards) ? result.cards : [];
  if (cards.length > 0) {
    return cards.map((card: any) => ({
      item: card,
      type:
        card?.result_type ??
        card?.resultType ??
        card?.type ??
        (card?.restaurant && card?.activity ? "pair" : "matched_location"),
    }));
  }

  return [
    ...(Array.isArray(result?.pairs)
      ? result.pairs.map((item: any) => ({ item, type: "pair" }))
      : []),
    ...(Array.isArray(result?.restaurants)
      ? result.restaurants.map((item: any) => ({ item, type: "restaurant" }))
      : []),
    ...(Array.isArray(result?.activities)
      ? result.activities.map((item: any) => ({ item, type: "activity" }))
      : []),
    ...(Array.isArray(result?.matched_locations)
      ? result.matched_locations.map((item: any) => ({ item, type: "matched_location" }))
      : []),
  ];
}

async function runEvaluation() {
  const runKey = `phase4b-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const { data: scenarios, error: scenarioError } = await supabaseAdmin
    .from("search_internal_test_scenarios")
    .select("id,scenario_key,prompt,expected_result_type,expected_market,expected_min_results,metadata")
    .eq("active", true)
    .order("scenario_key");

  if (scenarioError) throw scenarioError;
  const activeScenarios = (scenarios ?? []) as Scenario[];

  const { data: run, error: runError } = await supabaseAdmin
    .from("search_internal_test_runs")
    .insert({
      run_key: runKey,
      status: "running",
      scenario_count: activeScenarios.length,
      summary: { mode: "shadow_only", live_reranking_applied: false },
    })
    .select("id,run_key")
    .single();

  if (runError) throw runError;

  await supabaseAdmin.from("search_internal_test_results").insert(
    activeScenarios.map((scenario) => ({
      run_id: run.id,
      scenario_id: scenario.id,
      status: "pending",
    })),
  );

  const failures: Array<{ scenario: string; error: string }> = [];

  for (const scenario of activeScenarios) {
    const searchId = randomUUID();
    const sessionId = `internal:${runKey}:${scenario.scenario_key}`;

    try {
      const searchResult = await runOutingSearch({
        query: scenario.prompt,
        market: scenario.expected_market,
        source: "phase4b_internal_test",
        route: "/api/cron/search-phase4b-evaluation",
        sessionId,
        displayLimit: 12,
        useLLM: true,
        logPerformance: true,
        body: {
          is_test_event: true,
          traffic_type: "internal_test",
          test_run_id: runKey,
          scenario_key: scenario.scenario_key,
        },
      });

      const collected = collectResults(searchResult).slice(0, 12);
      const impressionRows = collected.flatMap(({ item, type }, index) => {
        const pairIds = type === "pair" ? getPairIds(item) : null;
        const locationId =
          type === "pair"
            ? pairIds?.restaurantLocationId ?? pairIds?.activityLocationId ?? null
            : getLocationId(item);

        if (!locationId) return [];

        return [{
          dedupe_key: [runKey, scenario.scenario_key, searchId, index + 1, locationId].join(":"),
          search_id: searchId,
          session_id: sessionId,
          location_id: locationId,
          restaurant_location_id: pairIds?.restaurantLocationId ?? null,
          activity_location_id: pairIds?.activityLocationId ?? null,
          result_type: type,
          result_position: index + 1,
          market: scenario.expected_market,
          ranking_version: "phase4b_internal_v1",
          experiment_variant: "shadow_only",
          final_score: numericScore(item),
          metadata: {
            source: "phase4b_internal_test",
            schema_version: "search_impression_v1",
            is_test_event: true,
            traffic_type: "internal_test",
            test_run_id: runKey,
            scenario_key: scenario.scenario_key,
          },
        }];
      });

      if (impressionRows.length > 0) {
        const { error: impressionError } = await supabaseAdmin
          .from("search_result_impressions")
          .upsert(impressionRows, { onConflict: "dedupe_key", ignoreDuplicates: true });
        if (impressionError) throw impressionError;
      }

      await supabaseAdmin
        .from("search_internal_test_results")
        .update({
          search_id: searchId,
          result_count: impressionRows.length,
          findings: {
            scenario_key: scenario.scenario_key,
            generated_result_count: collected.length,
            persisted_impression_count: impressionRows.length,
            shadow_only: true,
          },
        })
        .eq("run_id", run.id)
        .eq("scenario_id", scenario.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown search test failure";
      failures.push({ scenario: scenario.scenario_key, error: message });
      await supabaseAdmin
        .from("search_internal_test_results")
        .update({ status: "failed", findings: { error: message } })
        .eq("run_id", run.id)
        .eq("scenario_id", scenario.id);
    }
  }

  await supabaseAdmin.rpc("refresh_behavioral_shadow_rankings", {
    p_window: "30 days",
  });

  const { data: evaluation, error: evaluationError } = await supabaseAdmin.rpc(
    "evaluate_internal_search_test_run",
    { p_run_id: run.id },
  );
  if (evaluationError) throw evaluationError;

  return {
    success: true,
    run_id: run.id,
    run_key: runKey,
    failures,
    evaluation,
    live_reranking_applied: false,
  };
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(await runEvaluation());
  } catch (error) {
    console.error("SEARCH_PHASE4B_EVALUATION_FAILED", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Phase 4B evaluation failed",
      },
      { status: 500 },
    );
  }
}
