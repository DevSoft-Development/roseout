import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { searchV2 } from "@/lib/search/v2";
import { GOLDEN_SEARCH_QUERIES } from "@/lib/search/quality/goldenQueries";
import { buildLaunchGates, percentile, type SearchQualityMetrics } from "@/lib/search/quality/launchGates";
import {
  countResponseResults,
  responseDomainInventory,
  type ServedDomain,
} from "@/lib/search/quality/replayEvaluation";

function laneDiagnostics(response: any) {
  const calls = Array.isArray(response?.debug?.retrievalCalls) ? response.debug.retrievalCalls : [];
  const inventory = responseDomainInventory(response);
  return (["restaurant", "activity"] as const).map((domain) => {
    const matching = calls.filter((call: any) => String(call.role).includes(domain));
    const strictEmpty = matching.some((call: any) => call.reason === "canonical_profile_strict_empty");
    return {
      domain,
      profileRetrieved: matching.filter((call: any) => String(call.reason).includes("canonical_profile")).reduce((sum: number, call: any) => sum + Number(call.resultCount ?? 0), 0),
      served: inventory.counts[domain],
      strictEmpty,
    };
  });
}

export function evaluateServedDomains(response: any) {
  const inventory = responseDomainInventory(response);
  return {
    servedDomains: inventory.servedDomains,
    slotMismatches: inventory.slotMismatches,
    counts: inventory.counts,
  };
}

function isServedDomain(value: unknown): value is ServedDomain {
  return value === "restaurant" || value === "activity";
}

export function evaluateReplayCase(query: any, legacy: any, canonical: any, strictCanonical: any) {
  const expected = query.expectations ?? {};
  const expectedPair = Number(expected.minimumPairs ?? 0);
  const canonicalCount = countResponseResults(canonical);
  const legacyCount = countResponseResults(legacy);
  const { servedDomains, slotMismatches, counts } = evaluateServedDomains(strictCanonical);
  const expectedDomains: ServedDomain[] = (Array.isArray(expected.expectedDomains)
    ? expected.expectedDomains
    : []
  ).filter(isServedDomain);
  const missingDomains: ServedDomain[] = expectedDomains.filter(
    (domain: ServedDomain) => !servedDomains.has(domain),
  );
  const wrongDomain = missingDomains.length > 0 || slotMismatches.length > 0;
  const pairedPass = expectedPair === 0 || counts.pairs >= expectedPair;
  const noResultRegression = legacyCount > 0 && canonicalCount === 0;
  return {
    passed: !wrongDomain && pairedPass && !noResultRegression,
    wrongDomain,
    missingDomains,
    slotMismatches,
    pairedPass,
    noResultRegression,
    legacyCount,
    canonicalCount,
    strictCanonicalCount: countResponseResults(strictCanonical),
    strictDomainCounts: counts,
    fallbackUsed: Boolean(canonical.retrieval?.legacyFallbackUsed),
    fallbackDomains: canonical.retrieval?.fallbackDomains ?? [],
    latencyMs: Number(canonical.timing?.totalMs ?? 0),
    domainDiagnostics: laneDiagnostics(strictCanonical),
  };
}

export async function POST(request: Request) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.searchHealth);
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => ({}));
  const source = body.source === "production_replay" ? "production_replay" : "golden";
  let cases: any[] = GOLDEN_SEARCH_QUERIES;
  if (source === "production_replay") {
    const { data } = await supabaseAdmin.from("search_logs").select("id,raw_query").not("raw_query", "is", null).order("created_at", { ascending: false }).limit(Math.min(100, Math.max(10, Number(body.limit ?? 50))));
    cases = (data ?? []).map((row: any) => ({ id: `production-${row.id}`, sourceSearchId: row.id, category: "production", query: row.raw_query, expectations: { expectedDomains: [] } }));
  }
  const { data: run, error } = await supabaseAdmin.from("search_quality_replay_runs").insert({ source, status: "running", query_count: cases.length, created_by: auth.adminUser!.user_id }).select("id").single();
  if (error || !run) return NextResponse.json({ error: error?.message ?? "Unable to create replay run." }, { status: 500 });
  const rows: any[] = [];
  for (const testCase of cases) {
    try {
      const requestId = `${run.id}:${testCase.id}`;
      const [legacy, canonical, strictCanonical] = await Promise.all([
        searchV2({ query: testCase.query, requestId: `${requestId}:legacy`, supabase: supabaseAdmin, rolloutOverride: { mode: "off", canaryPercent: 0 } }),
        searchV2({ query: testCase.query, requestId: `${requestId}:profile`, supabase: supabaseAdmin, rolloutOverride: { mode: "primary", canaryPercent: 100 } }),
        searchV2({ query: testCase.query, requestId: `${requestId}:strict-profile`, supabase: supabaseAdmin, rolloutOverride: { mode: "primary", canaryPercent: 100, strictNoFallback: true } }),
      ]);
      const comparison = evaluateReplayCase(testCase, legacy, canonical, strictCanonical);
      rows.push({ run_id: run.id, source_search_id: testCase.sourceSearchId ?? null, query: testCase.query, category: testCase.category, expectations: testCase.expectations, legacy_result: legacy, canonical_result: { served: canonical, strict: strictCanonical }, comparison, passed: comparison.passed });
    } catch (runError) {
      rows.push({ run_id: run.id, source_search_id: testCase.sourceSearchId ?? null, query: testCase.query, category: testCase.category, expectations: testCase.expectations, comparison: { error: runError instanceof Error ? runError.message : "Replay failed", contractFailure: true }, passed: false });
    }
  }
  await supabaseAdmin.from("search_quality_replay_items").insert(rows);
  const total = rows.length || 1;
  const paired = rows.filter((row) => Number(row.expectations?.minimumPairs ?? 0) > 0);
  const metrics: SearchQualityMetrics = {
    total: rows.length,
    successRate: (rows.filter((row) => row.passed).length / total) * 100,
    wrongDomainRate: (rows.filter((row) => row.comparison?.wrongDomain).length / total) * 100,
    geographyLeakageRate: (rows.filter((row) => row.comparison?.geographyLeakage).length / total) * 100,
    pairedQuerySuccessRate: paired.length ? (paired.filter((row) => row.comparison?.pairedPass).length / paired.length) * 100 : 100,
    noResultRegressionRate: (rows.filter((row) => row.comparison?.noResultRegression).length / total) * 100,
    legacyFallbackRate: (rows.filter((row) => row.comparison?.fallbackUsed).length / total) * 100,
    p95LatencyMs: percentile(rows.map((row) => Number(row.comparison?.latencyMs ?? 0)), 95),
    contractFailureCount: rows.filter((row) => row.comparison?.contractFailure).length,
  };
  const gates = buildLaunchGates(metrics);
  await supabaseAdmin.from("search_quality_replay_runs").update({ status: "completed", passed_count: rows.filter((row) => row.passed).length, failed_count: rows.filter((row) => !row.passed).length, metrics: { ...metrics, gates, replayMode: "canonical_strict", domainDiagnostics: true, responseShapeAware: true }, completed_at: new Date().toISOString() }).eq("id", run.id);
  return NextResponse.json({ success: true, runId: run.id, metrics, gates, replayMode: "canonical_strict" });
}
