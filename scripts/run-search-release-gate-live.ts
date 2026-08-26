import { writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { SEARCH_RELEASE_GATE_QUERIES } from "../lib/search/quality/releaseGateQueries";
import { evaluateSearchAcceptanceContracts } from "../lib/search/quality/searchAcceptanceContracts";
import { normalizeQaDiagnosisSummary } from "../lib/search/quality/normalizeQaDiagnosisSummary";

const BASE_URL = process.env.SEARCH_QA_BASE_URL || "https://www.theouthaven.com";
const BETA_TESTER_ID = process.env.SEARCH_QA_BETA_TESTER_ID || "";
const SESSION_ID = process.env.SEARCH_QA_SESSION_ID || `search-release-gate-${Date.now()}`;
const GUEST_ID = process.env.SEARCH_QA_GUEST_ID || SESSION_ID;
const CONCURRENCY = Math.max(1, Math.min(5, Number(process.env.SEARCH_QA_CONCURRENCY || 3)));

if (!BETA_TESTER_ID) throw new Error("SEARCH_QA_BETA_TESTER_ID is required");

const asArray = (value: unknown): any[] => Array.isArray(value) ? value : [];
const strings = (value: unknown): string[] => asArray(value).map((item) => String(item ?? "").trim()).filter(Boolean);
const numberOrNull = (value: unknown): number | null => { const n = Number(value); return Number.isFinite(n) ? n : null; };
const stringOrNull = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;

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

function detectExpectedDomains(query: string) {
  const q = query.toLowerCase();
  const activityAliases: Array<[RegExp, string]> = [
    [/\bbowling\b/, "bowling"],
    [/\b(?:art gallery|gallery)\b/, "art_gallery"],
    [/\b(?:escape room|escape game)\b/, "escape_room"],
    [/\bkaraoke\b/, "karaoke"],
    [/\b(?:live music|jazz|music venue|concert|live band)\b/, "live_music"],
  ];
  const activityTerms = activityAliases.filter(([pattern]) => pattern.test(q)).map(([, term]) => term);
  const restaurant = /\b(restaurant|dinner|lunch|brunch|breakfast|food|eat|cuisine|steak|sushi|seafood|italian|mexican|halal|vegan|chicken)\b/.test(q);
  const activity = activityTerms.length > 0 || /\b(activity|activities|things to do|fun)\b/.test(q);
  return { restaurant, activity, activityTerms };
}

function classifyQuality(summary: any) {
  const expected = detectExpectedDomains(summary.query);
  const technicalSuccess = summary.errors.length === 0;
  if (!technicalSuccess) return { technicalSuccess, qualitySuccess: false, severity: "critical", type: "technical_failure", label: summary.errors[0] ?? "Search QA execution failed", expected };
  if (summary.result_count === 0) return { technicalSuccess, qualitySuccess: false, severity: "high", type: "no_results", label: summary.no_results_reason ?? "No valid results", expected };
  const droppedRestaurant = expected.restaurant && !summary.needsRestaurant;
  const droppedActivity = expected.activity && !summary.needsActivity;
  if (droppedRestaurant || droppedActivity) {
    const dropped = [droppedRestaurant ? "restaurant" : null, droppedActivity ? "activity" : null].filter(Boolean).join(" and ");
    return { technicalSuccess, qualitySuccess: false, severity: "high", type: "dropped_expected_domain", label: `Parser dropped explicit ${dropped} intent`, expected };
  }
  if (expected.restaurant && expected.activity && summary.pair_count === 0) return { technicalSuccess, qualitySuccess: false, severity: "high", type: "missing_pair", label: summary.no_pairs_reason ?? summary.no_results_reason ?? "Paired query returned no pair", expected };
  if (summary.speed_status === "critical" || summary.speed_status === "slow") return { technicalSuccess, qualitySuccess: false, severity: summary.speed_status === "critical" ? "high" : "medium", type: "slow_search", label: `Search completed with ${summary.speed_status} latency`, expected };
  const contractPass = summary.testPassed !== false && summary.intentPassed !== false && summary.geoAnchorPassed !== false && summary.retrievalPassed !== false && summary.pairingPassed !== false && summary.outcomePassed !== false && summary.canonicalProfilePassed !== false;
  if (!contractPass) return { technicalSuccess, qualitySuccess: false, severity: "high", type: "contract_failure", label: "Search acceptance contract failed", expected };
  return { technicalSuccess, qualitySuccess: true, severity: null, type: null, label: null, expected };
}

async function runOne(query: string, index: number) {
  const requestId = randomUUID();
  const started = Date.now();
  let result: any = null;
  let caught: unknown = null;
  try {
    const response = await fetch(`${BASE_URL}/api/generate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": requestId,
        "x-session-id": SESSION_ID,
        "x-beta-tester-id": BETA_TESTER_ID,
        "cookie": `guest_search_id=${GUEST_ID}`,
      },
      body: JSON.stringify({ input: query }),
      redirect: "follow",
    });
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
    requestId,
    testPassed,
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

  const quality = classifyQuality(summary);
  const qualityFindings = {
    source: "admin_search_health_batch_qa",
    runSource: "github_actions_live_release_gate",
    requestId,
    sessionId: SESSION_ID,
    engine: "public",
    searchType: normalizedSearchType,
    primaryDomain,
    restaurantCount: counts.restaurants,
    activityCount: counts.activities,
    pairCount: counts.pairs,
    resultCount: counts.displayed,
    timingMs: elapsed,
    speedStatus: currentSpeed,
    intentParserSource: summary.intentParserSource,
    needsRestaurant: summary.needsRestaurant,
    needsActivity: summary.needsActivity,
    expectedRestaurant: quality.expected.restaurant,
    expectedActivity: quality.expected.activity,
    expectedActivityTerms: quality.expected.activityTerms,
    noResultsReason,
    noPairsReason,
    warnings,
    errors,
    testPassed,
    intentPassed: summary.intentPassed,
    geoAnchorPassed: summary.geoAnchorPassed,
    retrievalPassed: summary.retrievalPassed,
    pairingPassed: summary.pairingPassed,
    outcomePassed: summary.outcomePassed,
    canonicalProfilePassed,
    contractPass: testPassed,
    contracts: summary.contracts,
  };

  return {
    ...summary,
    technicalSuccess: quality.technicalSuccess,
    qualitySuccess: quality.qualitySuccess,
    qualitySeverity: quality.severity,
    qualityIssueType: quality.type,
    qualityIssueLabel: quality.label,
    qualityFindings,
  };
}

async function main() {
  const startedAt = new Date().toISOString();
  const results = new Array<any>(SEARCH_RELEASE_GATE_QUERIES.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= SEARCH_RELEASE_GATE_QUERIES.length) return;
      const query = SEARCH_RELEASE_GATE_QUERIES[index];
      const row = await runOne(query, index);
      results[index] = row;
      console.log(`[${index + 1}/${SEARCH_RELEASE_GATE_QUERIES.length}] ${row.qualitySuccess ? "PASS" : "FAIL"} ${row.timing_ms}ms :: ${query}${row.qualityIssueType ? ` :: ${row.qualityIssueType}` : ""}`);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  const timings = results.map((row) => row.timing_ms).sort((a, b) => a - b);
  const p95Ms = timings[Math.min(timings.length - 1, Math.ceil(timings.length * 0.95) - 1)] ?? null;
  const qualityPassed = results.filter((row) => row.qualitySuccess).length;
  const technicalPassed = results.filter((row) => row.technicalSuccess).length;
  const contractPassed = results.filter((row) => row.testPassed).length;
  const issueCounts = results.reduce<Record<string, number>>((acc, row) => {
    const key = row.qualityIssueType || "none";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const payload = {
    run: { startedAt, finishedAt: new Date().toISOString(), baseUrl: BASE_URL, sessionId: SESSION_ID, guestId: GUEST_ID, betaTesterId: BETA_TESTER_ID, concurrency: CONCURRENCY, commit: process.env.GITHUB_SHA || null },
    summary: {
      total: results.length,
      qualityPassed,
      qualityPassPercent: Number(((qualityPassed / results.length) * 100).toFixed(1)),
      technicalPassed,
      technicalPassPercent: Number(((technicalPassed / results.length) * 100).toFixed(1)),
      contractPassed,
      contractPassPercent: Number(((contractPassed / results.length) * 100).toFixed(1)),
      p95Ms,
      issueCounts,
    },
    results,
  };
  await writeFile("qa-results.json", JSON.stringify(payload, null, 2));
  console.log("SEARCH_RELEASE_GATE_SUMMARY", JSON.stringify(payload.summary));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
