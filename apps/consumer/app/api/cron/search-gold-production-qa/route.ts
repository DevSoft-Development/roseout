import { NextResponse } from "next/server";
import { resolveSearchMlRuntimeConfig } from "@/lib/search/huggingFaceEmbedding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PUBLIC_SEARCH_PATH = "/api/generate";
const TEST_TIMEZONE = "America/New_York";
const REQUEST_DELAY_MS = 1500;
const MAX_RATE_LIMIT_RETRIES = 6;

const GOLD_QUERIES = [
  "Plan a restaurant and activity outing. dinner and comedy show near me. Return the best options, ranked by fit.",
  "Plan a date night with a nice restaurant and something fun to do after near me.",
  "Find me a Caribbean restaurant for dinner and pair it with an activity nearby.",
  "I want dinner and bowling tonight. Show me the best complete outing options near me.",
  "Plan dinner and a comedy show in Queens. Prioritize sit-down restaurants suitable for a night out.",
  "Find me a restaurant and activity for girls night with drinks and a lively vibe.",
  "Plan a romantic dinner and an activity afterward in Brooklyn.",
  "Find a steakhouse and something fun to do nearby. I want a full night-out experience.",
  "Find me a quick bite at a deli near me.",
  "I want takeout or fast casual food and something nearby to do afterward.",
] as const;

type GoldExpectation = {
  mode: "paired_outing" | "restaurant_only";
  restaurantRequired: boolean;
  activityRequired: boolean;
  borough?: string;
  cuisine?: string;
  activityCategory?: string;
  sameVenueRequired?: boolean;
  requirePair?: boolean;
};

const EXPECTATIONS: Record<(typeof GOLD_QUERIES)[number], GoldExpectation> = {
  [GOLD_QUERIES[0]]: { mode: "paired_outing", restaurantRequired: true, activityRequired: true, activityCategory: "comedy" },
  [GOLD_QUERIES[1]]: { mode: "paired_outing", restaurantRequired: true, activityRequired: true },
  [GOLD_QUERIES[2]]: { mode: "paired_outing", restaurantRequired: true, activityRequired: true, cuisine: "caribbean" },
  [GOLD_QUERIES[3]]: { mode: "paired_outing", restaurantRequired: true, activityRequired: true, activityCategory: "bowling", requirePair: true },
  [GOLD_QUERIES[4]]: { mode: "paired_outing", restaurantRequired: true, activityRequired: true, borough: "Queens", activityCategory: "comedy", requirePair: true },
  [GOLD_QUERIES[5]]: { mode: "paired_outing", restaurantRequired: true, activityRequired: true, sameVenueRequired: false },
  [GOLD_QUERIES[6]]: { mode: "paired_outing", restaurantRequired: true, activityRequired: true, borough: "Brooklyn" },
  [GOLD_QUERIES[7]]: { mode: "paired_outing", restaurantRequired: true, activityRequired: true, cuisine: "steakhouse" },
  [GOLD_QUERIES[8]]: { mode: "restaurant_only", restaurantRequired: true, activityRequired: false },
  [GOLD_QUERIES[9]]: { mode: "paired_outing", restaurantRequired: true, activityRequired: true },
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const normalize = (value: unknown) => String(value ?? "").toLowerCase().replace(/[_-]+/g, " ").trim();

async function authorized(request: Request) {
  const provided = request.headers.get("authorization");
  const cronSecret = String(process.env.CRON_SECRET || "").trim();
  if (cronSecret && provided === `Bearer ${cronSecret}`) return true;
  const runtimeConfig = await resolveSearchMlRuntimeConfig().catch(() => null);
  return Boolean(runtimeConfig?.token && provided === `Bearer ${runtimeConfig.token}`);
}

function canonical(response: any) {
  return response?.searchV2 ?? response;
}

function parseDecision(decision: any) {
  try {
    return decision?.reason ? JSON.parse(decision.reason) : null;
  } catch {
    return decision?.reason ?? null;
  }
}

function contains(values: unknown, expected: string) {
  return Array.isArray(values) && values.some((value) => normalize(value).includes(normalize(expected)) || normalize(expected).includes(normalize(value)));
}

function checksFor(query: (typeof GOLD_QUERIES)[number], rawResponse: any) {
  const response = canonical(rawResponse);
  const plan = response?.searchPlan ?? {};
  const expected = EXPECTATIONS[query];
  const pairs = Array.isArray(response?.pairs) ? response.pairs : [];
  const restaurants = Array.isArray(response?.restaurants) ? response.restaurants : [];
  const activities = Array.isArray(response?.activities) ? response.activities : [];
  const checks: Array<{ name: string; ok: boolean; detail?: string }> = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, ...(detail ? { detail } : {}) });

  add("mode", plan?.mode === expected.mode, `expected=${expected.mode};actual=${plan?.mode ?? "null"}`);
  add("restaurant_lane", plan?.restaurant?.required === expected.restaurantRequired, `required=${plan?.restaurant?.required}`);
  add("activity_lane", plan?.activity?.required === expected.activityRequired, `required=${plan?.activity?.required}`);
  if (expected.borough) add("borough", normalize(plan?.geo?.borough) === normalize(expected.borough), `borough=${plan?.geo?.borough ?? "null"}`);
  if (expected.cuisine) add("cuisine", contains(plan?.restaurant?.cuisines, expected.cuisine), JSON.stringify(plan?.restaurant?.cuisines ?? []));
  if (expected.activityCategory) add("activity_category", contains(plan?.activity?.categories, expected.activityCategory), JSON.stringify(plan?.activity?.categories ?? []));
  if (expected.sameVenueRequired !== undefined) add("same_venue", plan?.pairing?.sameVenueRequired === expected.sameVenueRequired, `sameVenueRequired=${plan?.pairing?.sameVenueRequired}`);
  if (expected.requirePair) add("live_pair_available", pairs.length > 0, `pairs=${pairs.length};restaurants=${restaurants.length};activities=${activities.length};outcome=${response?.outcome ?? "null"}`);
  if (expected.mode === "restaurant_only") add("restaurant_results_available", restaurants.length > 0, `restaurants=${restaurants.length}`);

  return checks;
}

async function runPublicSearch(origin: string, query: string) {
  let rateLimitRetries = 0;
  let lastPayload: any = null;
  let lastStatus = 0;
  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt += 1) {
    const response = await fetch(`${origin}${PUBLIC_SEARCH_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        input: query,
        selectedSearchLane: "auto",
        timezone: TEST_TIMEZONE,
        useCurrentLocation: false,
        guidedFlow: "guided_create_v1",
        debug: true,
      }),
      cache: "no-store",
    });
    lastStatus = response.status;
    lastPayload = await response.json().catch(() => ({ error: "public_search_returned_non_json" }));
    if (response.status !== 429) break;
    rateLimitRetries += 1;
    if (attempt < MAX_RATE_LIMIT_RETRIES) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const fallbackBackoff = 1500 * 2 ** attempt;
      const backoff = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : fallbackBackoff;
      await sleep(Math.min(15000, backoff));
    }
  }
  return { payload: lastPayload, status: lastStatus, rateLimitRetries };
}

function snapshot(query: (typeof GOLD_QUERIES)[number], rawResponse: any, status: number, elapsedMs: number, rateLimitRetries: number) {
  const response = canonical(rawResponse);
  const decisions = Array.isArray(response?.debug?.decisions) ? response.debug.decisions : [];
  const pairing = decisions.find((item: any) => item?.stage === "pairing_performance");
  const rerank = decisions.find((item: any) => item?.stage === "hf_cross_encoder_rerank");
  const checks = checksFor(query, rawResponse);
  const routeOk = status >= 200 && status < 300 && !rawResponse?.error;
  const restaurants = Array.isArray(response?.restaurants) ? response.restaurants : [];
  const activities = Array.isArray(response?.activities) ? response.activities : [];
  const pairs = Array.isArray(response?.pairs) ? response.pairs : [];
  return {
    query,
    ok: routeOk && checks.every((check) => check.ok),
    httpStatus: status,
    rateLimitRetries,
    elapsedMs,
    outcome: response?.outcome ?? null,
    checks,
    counts: { restaurants: restaurants.length, activities: activities.length, pairs: pairs.length },
    timing: response?.timing ?? null,
    pairing: pairing ? parseDecision(pairing) : response?.debug?.pairingDebug ?? null,
    rerank: rerank ? parseDecision(rerank) : null,
    topRestaurants: restaurants.slice(0, 5).map((item: any) => ({ id: item?.id ?? null, name: item?.name ?? item?.restaurant_name ?? null })),
    topActivities: activities.slice(0, 5).map((item: any) => ({ id: item?.id ?? null, name: item?.name ?? item?.activity_name ?? null })),
    topPairs: pairs.slice(0, 5).map((pair: any) => ({
      restaurant: pair?.restaurant?.name ?? pair?.restaurant?.restaurant_name ?? null,
      activity: pair?.activity?.name ?? pair?.activity?.activity_name ?? null,
      distanceMiles: pair?.distanceMiles ?? null,
      walkingMinutes: pair?.walkingMinutes ?? null,
    })),
  };
}

export async function GET(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const requestUrl = new URL(request.url);
  const expectedCommit = requestUrl.searchParams.get("expectedCommit")?.trim() || null;
  const deploymentCommit = String(process.env.VERCEL_GIT_COMMIT_SHA || "").trim() || null;
  if (expectedCommit && deploymentCommit !== expectedCommit) {
    return NextResponse.json({ ok: false, deploymentPending: true, expectedCommit, deploymentCommit }, { status: 409 });
  }

  const results: any[] = [];
  for (let index = 0; index < GOLD_QUERIES.length; index += 1) {
    const query = GOLD_QUERIES[index];
    const started = performance.now();
    try {
      const result = await runPublicSearch(requestUrl.origin, query);
      results.push(snapshot(query, result.payload, result.status, performance.now() - started, result.rateLimitRetries));
    } catch (error) {
      results.push({ query, ok: false, elapsedMs: performance.now() - started, error: error instanceof Error ? error.message : "unknown_gold_qa_failure" });
    }
    if (index < GOLD_QUERIES.length - 1) await sleep(REQUEST_DELAY_MS);
  }

  const failed = results.filter((result) => !result.ok);
  const latencies = results.map((result) => Number(result?.timing?.totalMs ?? result.elapsedMs ?? 0)).filter(Number.isFinite).sort((a, b) => a - b);
  const percentile = (p: number) => latencies.length ? latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * p) - 1)] : 0;
  const pairEvaluations = results.map((result) => Number(result?.pairing?.pairCandidatesEvaluated ?? 0)).filter((value) => value > 0);
  const rerankLatencies = results.flatMap((result) => [Number(result?.rerank?.restaurantLatencyMs ?? 0), Number(result?.rerank?.activityLatencyMs ?? 0)]).filter((value) => value > 0);

  return NextResponse.json({
    ok: failed.length === 0,
    generatedAt: new Date().toISOString(),
    deploymentCommit,
    summary: {
      queryCount: results.length,
      passedCount: results.length - failed.length,
      failedCount: failed.length,
      rateLimitRetries: results.reduce((sum, result) => sum + Number(result?.rateLimitRetries ?? 0), 0),
      p50TotalMs: percentile(0.5),
      p95TotalMs: percentile(0.95),
      maxTotalMs: latencies.at(-1) ?? 0,
      maxPairCandidatesEvaluated: pairEvaluations.length ? Math.max(...pairEvaluations) : 0,
      maxHfRerankLaneMs: rerankLatencies.length ? Math.max(...rerankLatencies) : 0,
    },
    results,
  }, { status: failed.length === 0 ? 200 : 503 });
}