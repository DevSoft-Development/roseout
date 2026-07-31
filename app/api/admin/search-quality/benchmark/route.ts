import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { searchV2 } from "@/lib/search/v2";
import { acceptableOutcome, classifySearchFailure, evaluateEngineCorrectness } from "@/lib/search/quality/searchReliability";

function pairingDiagnostics(response: any) {
  const decisions = response?.debug?.decisions ?? [];
  const item = [...decisions].reverse().find((decision: any) => decision?.stage === "pairing_eligibility");
  if (!item?.reason) return {};
  try { return JSON.parse(item.reason); } catch { return {}; }
}

export async function GET(request: Request) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.searchHealth);
  if (auth.error) return auth.error;
  const limit = Math.min(1000, Math.max(1, Number(new URL(request.url).searchParams.get("limit") ?? 1000)));
  const { data, error } = await supabaseAdmin.from("search_benchmark_cases").select("*").eq("enabled", true).order("class").limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cases: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.searchHealth);
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => ({}));
  const limit = Math.min(1000, Math.max(1, Number(body.limit ?? 1000)));
  const { data: cases, error: caseError } = await supabaseAdmin.from("search_benchmark_cases").select("*").eq("enabled", true).order("class").limit(limit);
  if (caseError) return NextResponse.json({ error: caseError.message }, { status: 500 });
  if (!cases?.length) return NextResponse.json({ error: "No enabled benchmark cases." }, { status: 400 });

  const { data: run, error: runError } = await supabaseAdmin.from("search_benchmark_runs").insert({ environment: body.environment ?? "production", commit_sha: body.commitSha ?? null }).select("id").single();
  if (runError || !run) return NextResponse.json({ error: runError?.message ?? "Unable to create run." }, { status: 500 });

  const rows: any[] = [];
  for (const testCase of cases) {
    const started = performance.now();
    let response: any;
    try {
      response = await searchV2({ query: testCase.query, requestId: `${run.id}:${testCase.id}`, supabase: supabaseAdmin, rolloutOverride: { mode: "primary", canaryPercent: 100, strictNoFallback: true } });
    } catch (error) {
      response = { errors: [error instanceof Error ? error.message : "benchmark execution failed"] };
    }
    const pairing = pairingDiagnostics(response);
    const counts = response?.counts ?? response?.debug?.canonicalCounts ?? {};
    const expected = testCase.expected ?? {};
    const hardViolations = expected.maxWalkingMinutes == null ? 0 : (response?.pairs ?? []).filter((pair: any) => Number(pair.walkingMinutes) > Number(expected.maxWalkingMinutes)).length;
    const engineCorrect = evaluateEngineCorrectness({ responseContractValid: !response?.errors?.length, wrongDomainCount: Number(response?.debug?.wrongDomainCount ?? 0), geographyLeakageCount: Number(response?.debug?.geographyLeakageCount ?? 0), hardConstraintViolations: hardViolations, parserCorrect: !expected.mode || response?.searchPlan?.mode === expected.mode });
    const failureClass = classifySearchFailure({ responseContractValid: !response?.errors?.length, parserConfidence: response?.searchPlan?.confidence?.overall, unknownTerms: expected.unknownTerms, knownInventoryRequired: testCase.known_inventory_required, profileCandidateCount: response?.retrieval?.profileCandidateCount, legacyCandidateCount: response?.retrieval?.legacyCandidateCount, retrievedCandidateCount: counts.retrievedCandidates, restaurantCandidateCount: counts.restaurantCandidates, activityCandidateCount: counts.activityCandidates, restaurantRequired: response?.searchPlan?.restaurant?.required, activityRequired: response?.searchPlan?.activity?.required, rejectedForGeography: pairing.rejectedForGeography, rejectedForDistance: pairing.rejectedForDistance, evaluatedPairs: pairing.evaluated, hardDistance: pairing.hardDistance, displayedResults: counts.displayedResults });
    const fulfilled = Boolean(response?.requestFulfilled);
    const passed = acceptableOutcome({ engineCorrect, fulfilled, knownInventoryRequired: Boolean(testCase.known_inventory_required), failureClass });
    rows.push({ run_id: run.id, case_id: testCase.id, query: testCase.query, passed, engine_correct: engineCorrect, fulfilled, known_inventory_recalled: testCase.known_inventory_required ? fulfilled : null, failure_class: failureClass, no_result_reason: response?.fallback?.reason ?? null, latency_ms: performance.now() - started, response });
  }

  const { error: resultError } = await supabaseAdmin.from("search_benchmark_results").insert(rows);
  if (resultError) return NextResponse.json({ error: resultError.message, runId: run.id }, { status: 500 });

  const known = rows.filter((row) => row.known_inventory_recalled != null);
  const metrics = {
    total: rows.length,
    engineCorrectnessRate: 100 * rows.filter((row) => row.engine_correct).length / rows.length,
    fulfillmentRate: 100 * rows.filter((row) => row.fulfilled).length / rows.length,
    knownInventoryRecallRate: known.length ? 100 * known.filter((row) => row.known_inventory_recalled).length / known.length : null,
    acceptableOutcomeRate: 100 * rows.filter((row) => row.passed).length / rows.length,
  };
  await supabaseAdmin.from("search_benchmark_runs").update({ finished_at: new Date().toISOString(), totals: { passed: rows.filter((row) => row.passed).length, failed: rows.filter((row) => !row.passed).length }, metrics }).eq("id", run.id);
  return NextResponse.json({ success: true, runId: run.id, metrics, failures: rows.filter((row) => !row.passed).map((row) => ({ query: row.query, failureClass: row.failure_class })) });
}
