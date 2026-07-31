#!/usr/bin/env node

const baseUrl = process.env.SEARCH_BENCHMARK_BASE_URL;
const adminToken = process.env.SEARCH_BENCHMARK_ADMIN_TOKEN;
const limit = Number(process.env.SEARCH_BENCHMARK_LIMIT ?? 1000);

if (!baseUrl || !adminToken) {
  console.error("SEARCH_BENCHMARK_BASE_URL and SEARCH_BENCHMARK_ADMIN_TOKEN are required.");
  process.exit(1);
}

const headers = { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" };

async function json(url, init = {}) {
  const response = await fetch(url, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${JSON.stringify(body)}`);
  return body;
}

function classify(result, expected) {
  const debug = result?.searchV2?.debug ?? result?.debug ?? {};
  const counts = result?.searchV2?.counts ?? debug.canonicalCounts ?? {};
  const decisions = result?.searchV2?.debug?.decisions ?? result?.debug?.decisions ?? [];
  const pairing = [...decisions].reverse().find((item) => item.stage === "pairing_eligibility");
  let pairingReason = {};
  try { pairingReason = pairing?.reason ? JSON.parse(pairing.reason) : {}; } catch {}

  if (result?.errors?.length) return "SERIALIZATION_FAILURE";
  if ((expected?.unknownTerms ?? []).length) return "UNKNOWN_TAXONOMY";
  if (expected?.knownInventoryRequired && (counts.retrievedCandidates ?? 0) === 0) {
    const profile = result?.searchV2?.retrieval?.profileCandidateCount ?? 0;
    const legacy = result?.searchV2?.retrieval?.legacyCandidateCount ?? 0;
    return profile === 0 && legacy > 0 ? "PROFILE_CLASSIFICATION_GAP" : "RETRIEVAL_RECALL_FAILURE";
  }
  if ((counts.retrievedCandidates ?? 0) === 0) return "NO_INVENTORY";
  if (pairingReason.primaryFailure === "geography_rejection") return "GEOGRAPHY_REJECTION";
  if (pairingReason.primaryFailure === "distance_rejection") return "HARD_DISTANCE_NO_PAIR";
  if (pairingReason.primaryFailure === "no_restaurant_candidates" || pairingReason.primaryFailure === "no_activity_candidates") return "ROLE_ASSIGNMENT_FAILURE";
  return result?.requestFulfilled ? null : "UNCLASSIFIED";
}

function engineCorrect(result, expected) {
  const plan = result?.searchV2?.searchPlan;
  if (!plan) return false;
  if (expected?.mode && plan.mode !== expected.mode) return false;
  if (expected?.primaryDomain && result.primaryDomain !== expected.primaryDomain && result.primary_domain !== expected.primaryDomain) return false;
  if (expected?.maxWalkingMinutes != null) {
    const violatingPair = (result.pairs ?? []).some((pair) => Number(pair.walkingMinutes) > Number(expected.maxWalkingMinutes));
    if (violatingPair) return false;
  }
  return !(result?.warnings ?? []).includes("geography_leakage") && !(result?.warnings ?? []).includes("wrong_domain");
}

const casesPayload = await json(`${baseUrl}/api/admin/search-quality/benchmark-cases?limit=${limit}`);
const cases = Array.isArray(casesPayload?.cases) ? casesPayload.cases : [];
if (!cases.length) throw new Error("No enabled benchmark cases were returned.");

const run = await json(`${baseUrl}/api/admin/search-quality/benchmark-runs`, {
  method: "POST",
  body: JSON.stringify({ environment: process.env.VERCEL_ENV ?? "production", commitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null }),
});

const results = [];
for (const testCase of cases) {
  const started = performance.now();
  let response;
  try {
    response = await json(`${baseUrl}/api/generate`, { method: "POST", body: JSON.stringify({ query: testCase.query, benchmark: true }) });
  } catch (error) {
    response = { success: false, errors: [error instanceof Error ? error.message : String(error)] };
  }
  const latencyMs = performance.now() - started;
  const failureClass = classify(response, testCase.expected ?? {});
  const correct = engineCorrect(response, testCase.expected ?? {});
  const fulfilled = Boolean(response?.requestFulfilled ?? response?.success);
  const acceptable = correct && (fulfilled || (!testCase.knownInventoryRequired && ["NO_INVENTORY", "HARD_DISTANCE_NO_PAIR"].includes(failureClass)));
  results.push({ caseId: testCase.id, query: testCase.query, passed: acceptable, engineCorrect: correct, fulfilled, knownInventoryRecalled: testCase.knownInventoryRequired ? fulfilled : null, failureClass, noResultReason: response?.no_results_reason ?? response?.fallback?.reason ?? null, latencyMs, response });
}

const metrics = {
  total: results.length,
  engineCorrectnessRate: 100 * results.filter((item) => item.engineCorrect).length / results.length,
  fulfillmentRate: 100 * results.filter((item) => item.fulfilled).length / results.length,
  knownInventoryRecallRate: (() => { const scoped = results.filter((item) => item.knownInventoryRecalled != null); return scoped.length ? 100 * scoped.filter((item) => item.knownInventoryRecalled).length / scoped.length : null; })(),
  acceptableOutcomeRate: 100 * results.filter((item) => item.passed).length / results.length,
  failureClusters: Object.groupBy(results.filter((item) => !item.passed), (item) => item.failureClass ?? "UNCLASSIFIED"),
};

await json(`${baseUrl}/api/admin/search-quality/benchmark-runs/${run.id}/complete`, { method: "POST", body: JSON.stringify({ results, metrics }) });
console.log(JSON.stringify(metrics, null, 2));
if (metrics.engineCorrectnessRate < 98 || (metrics.knownInventoryRecallRate != null && metrics.knownInventoryRecallRate < 98)) process.exit(2);
