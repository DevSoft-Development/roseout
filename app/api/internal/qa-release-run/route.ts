import { NextRequest, NextResponse } from "next/server";
import { createPublicSearchController } from "@/lib/search/public-api/controller";
import { persistQaSearchLog } from "@/lib/search/quality/qaSearchLog";
import { evaluateSearchAcceptanceContracts } from "@/lib/search/quality/searchAcceptanceContracts";
import { normalizeQaDiagnosisSummary } from "@/lib/search/quality/normalizeQaDiagnosisSummary";
import { SEARCH_RELEASE_GATE_QUERIES } from "@/lib/search/quality/releaseGateQueries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CHUNK_SIZE = 30;
const asArray = (value: unknown): any[] => Array.isArray(value) ? value : [];
const strings = (value: unknown): string[] => asArray(value).map((item) => String(item ?? "").trim()).filter(Boolean);
const stringOrNull = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;
const numberOrNull = (value: unknown): number | null => { const n = Number(value); return Number.isFinite(n) ? n : null; };

function countsOf(result: any) {
  const restaurants = asArray(result?.restaurants).length;
  const activities = asArray(result?.activities).length;
  const pairs = asArray(result?.pairs).length;
  const cards = asArray(result?.cards).length;
  return { restaurants, activities, pairs, displayed: cards || restaurants + activities + pairs };
}

function speedStatus(ms: number): "fast" | "good" | "slow" | "critical" {
  if (ms < 1000) return "fast";
  if (ms < 2000) return "good";
  if (ms < 4000) return "slow";
  return "critical";
}

function controller() {
  return createPublicSearchController({
    getIdentity: async () => ({ user: null, guestId: null, setGuestCookie: false }) as any,
    checkLimit: async () => ({ allowed: true, settings: { enabled: false }, plan: { planKey: "free", unlimited: false, isBeta: false, isAdmin: false }, usedThisWeek: 0, weeklyLimit: null, message: null }) as any,
    recordUsage: async () => undefined,
    logAnalytics: async () => ({ ok: true }),
    logSearchHealth: async () => ({ ok: true }),
    logRouteTiming: () => undefined,
  });
}

async function runOne(searchController: ReturnType<typeof createPublicSearchController>, query: string, index: number) {
  const requestId = crypto.randomUUID();
  const started = Date.now();
  let result: any = null;
  let caught: unknown = null;
  try {
    const request = new Request("https://www.theouthaven.com/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": requestId },
      body: JSON.stringify({ input: query }),
    });
    const response = await searchController(request);
    result = await response.json().catch(() => null);
    if (!result || typeof result !== "object") throw new Error(`Unreadable public response (${response.status})`);
    if (!response.ok && !result.success) throw new Error(result?.error?.message ?? result?.error ?? `Public search failed (${response.status})`);
  } catch (error) {
    caught = error;
    result = { success: false, requestId, error: error instanceof Error ? error.message : String(error) };
  }

  const elapsed = Date.now() - started;
  const debug = result?.debug ?? {};
  const intent = debug?.normalizedIntent ?? result?.normalizedIntent ?? result?.searchV2?.searchPlan ?? {};
  const retrieval = result?.retrieval ?? result?.searchV2?.retrieval ?? debug?.retrieval ?? {};
  const counts = countsOf(result);
  const errors = [
    ...strings(result?.errors),
    ...strings(debug?.errors),
    ...(result?.error ? [typeof result.error === "string" ? result.error : String(result?.error?.message ?? "search_error")] : []),
    ...(caught ? [caught instanceof Error ? caught.message : String(caught)] : []),
  ];
  const warnings = [...strings(result?.warnings), ...strings(debug?.warnings)];
  const acceptance = evaluateSearchAcceptanceContracts({ result: { ...result, query }, errors, warnings, counts });
  const truth = normalizeQaDiagnosisSummary({ diagnosis: acceptance.diagnosis, result });

  const configuredMode = stringOrNull(retrieval?.configuredMode);
  const configuredPercent = numberOrNull(retrieval?.canaryPercent);
  const servedSource = stringOrNull(retrieval?.servedSource);
  const legacyFallbackUsed = Boolean(retrieval?.legacyFallbackUsed);
  const fallbackDomains = strings(retrieval?.fallbackDomains);
  const canonicalConfigPassed = configuredMode === "primary" && configuredPercent === 100;
  const canonicalServingPassed = servedSource === "canonical_profile" || (servedSource === "mixed" && legacyFallbackUsed && fallbackDomains.length > 0);
  const canonicalProfilePassed = canonicalConfigPassed && canonicalServingPassed;
  const testPassed = acceptance.testPassed && canonicalProfilePassed;
  const normalizedSearchType = stringOrNull(intent?.searchType ?? intent?.mode ?? result?.search_type ?? result?.searchType);
  const primaryDomain = stringOrNull(intent?.primaryDomain ?? result?.primary_domain ?? result?.primaryDomain);
  const mixed = primaryDomain === "mixed" || normalizedSearchType === "paired_outing" || normalizedSearchType === "same_venue";
  const noResultsReason = counts.displayed === 0 ? stringOrNull(result?.no_results_reason ?? debug?.no_results_reason ?? truth.outcome) ?? "no_renderable_results" : null;
  const noPairsReason = mixed && counts.pairs === 0 ? stringOrNull(result?.no_pairs_reason ?? truth.diagnosisClassification ?? truth.outcome) ?? "no_valid_pair" : null;
  const currentSpeed = speedStatus(elapsed);
  const suspiciousFlags = [
    ...(errors.length ? ["errors"] : []),
    ...(warnings.length ? ["warnings"] : []),
    ...(currentSpeed === "slow" ? ["slow"] : []),
    ...(currentSpeed === "critical" ? ["critical_speed"] : []),
    ...(!acceptance.intent.passed ? ["intent_contract_failed"] : []),
    ...(!acceptance.geoAnchor.passed ? ["geo_anchor_contract_failed"] : []),
    ...(!acceptance.retrieval.passed ? ["retrieval_contract_failed"] : []),
    ...(!acceptance.pairing.passed ? ["pairing_contract_failed"] : []),
    ...(!canonicalProfilePassed ? ["canonical_profile_failed"] : []),
  ];

  const summary: any = {
    index,
    query,
    ok: testPassed,
    testPassed,
    engine: "public",
    normalized_search_type: normalizedSearchType,
    primary_domain: primaryDomain,
    restaurant_count: counts.restaurants,
    activity_count: counts.activities,
    pair_count: counts.pairs,
    result_count: counts.displayed,
    timing_ms: elapsed,
    speed_status: currentSpeed,
    intentParserSource: stringOrNull(debug?.intentParserSource ?? intent?.parser?.source),
    no_results_reason: noResultsReason,
    no_pairs_reason: noPairsReason,
    suspiciousFlags: [...new Set(suspiciousFlags)],
    warnings,
    errors,
    needsRestaurant: Boolean(intent?.needsRestaurant ?? intent?.restaurant?.required),
    needsActivity: Boolean(intent?.needsActivity ?? intent?.activity?.required),
    intentPassed: acceptance.intent.passed,
    geoAnchorPassed: acceptance.geoAnchor.passed,
    retrievalPassed: acceptance.retrieval.passed,
    pairingPassed: acceptance.pairing.passed,
    outcomePassed: acceptance.qa.passed,
    canonicalProfilePassed,
    contracts: {
      ...acceptance,
      canonicalProfile: {
        status: canonicalProfilePassed ? "pass" : "fail",
        passed: canonicalProfilePassed,
        evidence: { configuredMode, configuredPercent, servedSource, legacyFallbackUsed, fallbackDomains },
      },
      testPassed,
    },
  };

  const log = await persistQaSearchLog(summary, requestId);
  return { index, query, passed: Boolean(log.quality_success), contractPassed: testPassed, timingMs: elapsed, speedStatus: currentSpeed, issueType: log.quality_issue_type, suspiciousFlags: summary.suspiciousFlags };
}

export async function GET(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview") return NextResponse.json({ ok: false, error: "preview_only" }, { status: 404 });

  const chunk = Math.max(0, Math.min(5, Number(new URL(request.url).searchParams.get("chunk") ?? 0)));
  const start = chunk * CHUNK_SIZE;
  const queries = SEARCH_RELEASE_GATE_QUERIES.slice(start, start + CHUNK_SIZE);
  if (!queries.length) return NextResponse.json({ ok: false, error: "invalid_chunk" }, { status: 400 });

  const searchController = controller();
  const rows = [];
  for (const [offset, query] of queries.entries()) rows.push(await runOne(searchController, query, start + offset));

  const passed = rows.filter((row) => row.passed).length;
  const contractPassed = rows.filter((row) => row.contractPassed).length;
  const timings = rows.map((row) => row.timingMs).sort((a, b) => a - b);
  const p95 = timings[Math.min(timings.length - 1, Math.ceil(timings.length * 0.95) - 1)] ?? null;
  return NextResponse.json({ ok: true, chunk, start, count: rows.length, passed, failed: rows.length - passed, qualityPassPercent: Number(((passed / rows.length) * 100).toFixed(1)), contractPassed, contractPassPercent: Number(((contractPassed / rows.length) * 100).toFixed(1)), p95Ms: p95, rows });
}
