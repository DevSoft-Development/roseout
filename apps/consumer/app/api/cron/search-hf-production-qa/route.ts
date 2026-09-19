import { NextResponse } from "next/server";
import { resolveSearchMlRuntimeConfig } from "@/lib/search/huggingFaceEmbedding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PUBLIC_SEARCH_PATH = "/api/generate";
const PUBLIC_SEARCH_TIMEZONE = "America/New_York";
const PUBLIC_GUIDED_FLOW = "guided_create_v1";

const QUERIES = [
  "restaurant with hookah in the Bronx",
  "sports bar with wings",
  "restaurant with outdoor seating",
  "restaurant with private dining",
  "rooftop restaurant",
  "late night restaurant",
  "brunch with cocktails and outdoor seating",
  "group-friendly live music restaurant",
  "date night in Brooklyn",
  "upscale romantic date night in Brooklyn",
  "rooftop dinner in Brooklyn",
  "restaurant with hookah in Forest Hills",
  "dinner then hookah in Forest Hills",
  "seafood rooftop restaurant in Queens",
  "dinner then bowling in Forest Hills",
  "date night in Brooklyn, no museums",
  "restaurant and activity in Queens but no bowling",
  "girls night in Brooklyn",
  "family outing in Queens",
  "cocktails and something relaxing",
  "restaurant with hookah under one roof in Forest Hills",
  "jerk chicken pasta in Queens",
  "purple dragon noodles in Queens",
  "date night in Brooklyn tomorrow at 8 pm",
  "dinner then bowling in Forest Hills, walking distance",
] as const;

type BehaviorCheck = { name: string; ok: boolean; detail?: string };

const PLANNER_CONTROL_FOOD_TERMS = new Set([
  "same venue",
  "same place",
  "one venue",
  "one place",
  "under one roof",
  "same",
  "venue",
  "place",
  "under",
  "one",
  "roof",
  "walking distance",
  "walking",
  "walk",
  "walkable",
  "distance",
  "on foot",
  "driving",
  "drive",
  "by car",
  "car ride",
]);

async function authorized(request: Request) {
  const provided = request.headers.get("authorization");
  const cronSecret = String(process.env.CRON_SECRET || "").trim();
  if (cronSecret && provided === `Bearer ${cronSecret}`) return true;
  const runtimeConfig = await resolveSearchMlRuntimeConfig().catch(() => null);
  return Boolean(runtimeConfig?.token && provided === `Bearer ${runtimeConfig.token}`);
}

function parseDecision(decision: any) {
  try {
    return decision?.reason ? JSON.parse(decision.reason) : null;
  } catch {
    return decision?.reason ?? null;
  }
}

function cards(items: any[]) {
  return (items ?? []).slice(0, 5).map((item: any) => ({
    id: item?.id ?? null,
    name: item?.name ?? item?.restaurant_name ?? item?.activity_name ?? null,
    locationType: item?.location_type ?? null,
    primaryCategory: item?.primary_category ?? null,
    searchRole: item?.searchRole ?? null,
    searchScore: item?.searchScore ?? null,
    retrievalGeoLevel: item?.retrieval_geo_level ?? null,
    matchReasons: Array.isArray(item?.matchReasons) ? item.matchReasons : [],
    whyMatched: item?.whyMatched ?? item?.why_it_matched ?? null,
  }));
}

function pairCards(items: any[]) {
  return (items ?? []).slice(0, 5).map((pair: any) => ({
    restaurant: {
      id: pair?.restaurant?.id ?? null,
      name: pair?.restaurant?.name ?? pair?.restaurant?.restaurant_name ?? null,
    },
    activity: {
      id: pair?.activity?.id ?? null,
      name: pair?.activity?.name ?? pair?.activity?.activity_name ?? null,
    },
    distanceMiles: pair?.distanceMiles ?? null,
    walkingMinutes: pair?.walkingMinutes ?? null,
    geoTier: pair?.geoTier ?? null,
    isFallbackPair: pair?.isFallbackPair ?? false,
  }));
}

function itemText(item: any) {
  return [
    item?.name,
    item?.restaurant_name,
    item?.activity_name,
    item?.location_type,
    item?.primary_category,
    ...(Array.isArray(item?.matchReasons) ? item.matchReasons : []),
    item?.whyMatched,
    item?.why_it_matched,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function canonicalSearchResponse(response: any) {
  return response?.searchV2 ?? response;
}

function behaviorChecks(query: string, rawResponse: any): BehaviorCheck[] {
  const response = canonicalSearchResponse(rawResponse);
  const plan = response?.searchPlan ?? {};
  const pairs = Array.isArray(response?.pairs) ? response.pairs : [];
  const restaurants = Array.isArray(response?.restaurants) ? response.restaurants : [];
  const activities = Array.isArray(response?.activities) ? response.activities : [];
  const sameVenueResults = Array.isArray(response?.sameVenueResults)
    ? response.sameVenueResults
    : Array.isArray(response?.same_venue_results)
      ? response.same_venue_results
      : [];
  const checks: BehaviorCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) =>
    checks.push({ name, ok, ...(detail ? { detail } : {}) });
  const hasActivityExclusion = (term: RegExp) =>
    (plan?.activity?.exclusions ?? []).some((value: unknown) => term.test(String(value)));
  const returnedActivityMatches = (term: RegExp) =>
    activities.some((item: any) => term.test(itemText(item)));
  const restaurantFoods = (plan?.restaurant?.foods ?? []).map((value: unknown) =>
    String(value).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim(),
  );
  const leakedPlannerControlTerms = restaurantFoods.filter((value: string) =>
    PLANNER_CONTROL_FOOD_TERMS.has(value),
  );

  add(
    "restaurant_foods_exclude_planner_control_language",
    leakedPlannerControlTerms.length === 0,
    leakedPlannerControlTerms.length ? JSON.stringify(leakedPlannerControlTerms) : undefined,
  );

  switch (query) {
    case "restaurant with hookah in the Bronx":
      add(
        "bronx_is_geography",
        String(plan?.geo?.borough ?? "").toLowerCase() === "bronx",
        JSON.stringify(plan?.geo ?? {}),
      );
      add(
        "restaurant_bound_hookah_stays_restaurant_only",
        plan?.mode === "restaurant_only" &&
          plan?.restaurant?.required === true &&
          plan?.activity?.required === false &&
          (plan?.restaurant?.features ?? []).includes("hookah"),
        `mode=${plan?.mode};features=${JSON.stringify(plan?.restaurant?.features ?? [])}`,
      );
      break;
    case "rooftop dinner in Brooklyn":
      add(
        "rooftop_dinner_restaurant_only",
        plan?.mode === "restaurant_only" &&
          plan?.restaurant?.required === true &&
          plan?.activity?.required === false,
        `mode=${plan?.mode}`,
      );
      add("rooftop_dinner_no_activity_cards", activities.length === 0, `activityCards=${activities.length}`);
      break;
    case "restaurant with hookah in Forest Hills":
      add(
        "forest_hills_is_geography",
        String(plan?.geo?.neighborhood ?? "").toLowerCase() === "forest hills",
        JSON.stringify(plan?.geo ?? {}),
      );
      break;
    case "dinner then hookah in Forest Hills":
      add(
        "sequential_hookah_is_paired",
        plan?.mode === "paired_outing" &&
          plan?.restaurant?.required === true &&
          plan?.activity?.required === true,
        `mode=${plan?.mode}`,
      );
      add("sequential_hookah_has_pair", pairs.length > 0, `pairs=${pairs.length};outcome=${response?.outcome ?? "none"}`);
      break;
    case "seafood rooftop restaurant in Queens":
      add(
        "seafood_rooftop_restaurant_only",
        plan?.mode === "restaurant_only" && plan?.activity?.required === false,
        `mode=${plan?.mode}`,
      );
      add("seafood_rooftop_no_activity_cards", activities.length === 0, `activityCards=${activities.length}`);
      break;
    case "dinner then bowling in Forest Hills":
      add(
        "sequential_bowling_is_paired",
        plan?.mode === "paired_outing" &&
          plan?.restaurant?.required === true &&
          plan?.activity?.required === true,
        `mode=${plan?.mode}`,
      );
      add("sequential_bowling_has_pair", pairs.length > 0, `pairs=${pairs.length};outcome=${response?.outcome ?? "none"}`);
      break;
    case "date night in Brooklyn, no museums":
      add("museum_exclusion_parsed", hasActivityExclusion(/museum/i), JSON.stringify(plan?.activity?.exclusions ?? []));
      add("museum_exclusion_enforced", !returnedActivityMatches(/museum/i), `activityCards=${activities.length}`);
      break;
    case "restaurant and activity in Queens but no bowling":
      add("bowling_exclusion_parsed", hasActivityExclusion(/bowl/i), JSON.stringify(plan?.activity?.exclusions ?? []));
      add("bowling_exclusion_enforced", !returnedActivityMatches(/bowl/i), `activityCards=${activities.length}`);
      break;
    case "girls night in Brooklyn":
    case "family outing in Queens":
      add(
        "broad_occasion_builds_complete_outing",
        Boolean(plan?.restaurant?.required && plan?.activity?.required),
        `mode=${plan?.mode};occasion=${plan?.occasion ?? "none"}`,
      );
      add(
        "broad_occasion_has_results",
        restaurants.length > 0 || activities.length > 0 || pairs.length > 0,
        `restaurants=${restaurants.length};activities=${activities.length};pairs=${pairs.length}`,
      );
      break;
    case "cocktails and something relaxing":
      add("relaxing_request_has_activity_lane", plan?.activity?.required === true, `mode=${plan?.mode}`);
      add(
        "relaxing_request_has_results",
        activities.length > 0 || pairs.length > 0,
        `activities=${activities.length};pairs=${pairs.length}`,
      );
      break;
    case "restaurant with hookah under one roof in Forest Hills":
      add(
        "under_one_roof_uses_same_venue_mode",
        plan?.mode === "same_venue" && plan?.pairing?.sameVenueRequired === true,
        `mode=${plan?.mode};sameVenueRequired=${plan?.pairing?.sameVenueRequired}`,
      );
      add(
        "under_one_roof_has_same_venue_result",
        sameVenueResults.length > 0,
        `sameVenueResults=${sameVenueResults.length}`,
      );
      break;
    case "jerk chicken pasta in Queens": {
      const joinedFoods = restaurantFoods.join(" | ");
      const phrasePreserved =
        joinedFoods.includes("jerk chicken pasta") ||
        (joinedFoods.includes("jerk chicken") && joinedFoods.includes("pasta"));
      add("multiword_dish_preserved", phrasePreserved, JSON.stringify(restaurantFoods));
      add(
        "multiword_dish_stays_restaurant_only",
        plan?.restaurant?.required === true && plan?.activity?.required === false,
        `mode=${plan?.mode}`,
      );
      break;
    }
    case "purple dragon noodles in Queens":
      add(
        "unknown_dish_stays_restaurant_only",
        plan?.restaurant?.required === true && plan?.activity?.required === false,
        `mode=${plan?.mode}`,
      );
      add(
        "unknown_dish_falls_back_gracefully",
        restaurants.length > 0 || response?.requestFulfilled === true || response?.partialResults === true,
        `restaurants=${restaurants.length};fulfilled=${response?.requestFulfilled};partial=${response?.partialResults}`,
      );
      break;
    case "date night in Brooklyn tomorrow at 8 pm":
      add("date_time_is_parsed", Boolean(plan?.plannedFor), `plannedFor=${plan?.plannedFor ?? "null"}`);
      add(
        "date_time_keeps_brooklyn_geo",
        String(plan?.geo?.borough ?? "").toLowerCase() === "brooklyn",
        JSON.stringify(plan?.geo ?? {}),
      );
      break;
    case "dinner then bowling in Forest Hills, walking distance": {
      const walkingMetadataValid =
        pairs.length === 0
          ? response?.outcome === "expected_constraint_no_pair"
          : pairs.every(
              (pair: any) =>
                Number.isFinite(Number(pair?.walkingMinutes)) && Number(pair.walkingMinutes) >= 0,
            );
      add(
        "walking_constraint_is_explicit",
        plan?.travel?.mode === "walking" &&
          plan?.travel?.explicit === true &&
          plan?.pairing?.requireWalkable === true,
        JSON.stringify({ travel: plan?.travel, pairing: plan?.pairing }),
      );
      add(
        "walking_pairs_have_walking_metadata",
        walkingMetadataValid,
        `pairs=${pairs.length};outcome=${response?.outcome ?? "none"}`,
      );
      break;
    }
    default:
      break;
  }

  return checks;
}

function qaSnapshot(query: string, rawResponse: any, elapsedMs: number, httpStatus: number) {
  const response = canonicalSearchResponse(rawResponse);
  const decisions = Array.isArray(response?.debug?.decisions) ? response.debug.decisions : [];
  const semantic = decisions.find((item: any) => item?.stage === "hf_semantic_retrieval");
  const semanticCandidates = decisions.find((item: any) => item?.stage === "hf_semantic_candidates");
  const rerank = decisions.find((item: any) => item?.stage === "hf_cross_encoder_rerank");
  const requestedDomain = decisions.find((item: any) => item?.stage === "requested_domain_contract");
  const exactMenuEvidence = [...(response?.restaurants ?? []), ...(response?.activities ?? [])]
    .filter(
      (item: any) =>
        Array.isArray(item?.matchReasons) &&
        item.matchReasons.some((reason: string) => /exact menu phrase match/i.test(reason)),
    )
    .slice(0, 10)
    .map((item: any) => ({
      id: item?.id ?? null,
      name: item?.name ?? item?.restaurant_name ?? item?.activity_name ?? null,
    }));
  const checks = behaviorChecks(query, rawResponse);
  const routeSucceeded = httpStatus >= 200 && httpStatus < 300 && !rawResponse?.error;
  return {
    query,
    publicRoute: PUBLIC_SEARCH_PATH,
    publicHttpStatus: httpStatus,
    ok: routeSucceeded && response?.outcome !== "error",
    behavior: { ok: checks.every((check) => check.ok), checks },
    outcome: response?.outcome ?? null,
    requestFulfilled: response?.requestFulfilled ?? null,
    partialResults: response?.partialResults ?? null,
    requestedMode: response?.requestedMode ?? null,
    resolvedMode: response?.resolvedMode ?? null,
    searchPlan: response?.searchPlan
      ? {
          mode: response.searchPlan.mode,
          restaurant: response.searchPlan.restaurant,
          activity: response.searchPlan.activity,
          geo: response.searchPlan.geo,
          travel: response.searchPlan.travel,
          pairing: response.searchPlan.pairing,
          occasion: response.searchPlan.occasion,
          plannedFor: response.searchPlan.plannedFor,
        }
      : null,
    elapsedMs,
    timing: response?.timing ?? null,
    counts: response?.counts ?? {},
    retrieval: response?.retrieval ?? null,
    topRestaurants: cards(response?.restaurants ?? []),
    topActivities: cards(response?.activities ?? []),
    topSameVenueResults: cards(response?.sameVenueResults ?? response?.same_venue_results ?? []),
    topPairs: pairCards(response?.pairs ?? []),
    pairCount: Array.isArray(response?.pairs) ? response.pairs.length : 0,
    exactMenuEvidence,
    fallback: response?.fallback ?? null,
    semantic: semantic ? { decision: semantic.decision, details: parseDecision(semantic) } : null,
    semanticCandidates: semanticCandidates
      ? { decision: semanticCandidates.decision, details: parseDecision(semanticCandidates) }
      : null,
    rerank: rerank ? { decision: rerank.decision, details: parseDecision(rerank) } : null,
    requestedDomain: requestedDomain
      ? { decision: requestedDomain.decision, details: parseDecision(requestedDomain) }
      : null,
  };
}

function publicSearchRequestBody(query: string) {
  return {
    input: query,
    selectedSearchLane: "auto",
    timezone: PUBLIC_SEARCH_TIMEZONE,
    useCurrentLocation: false,
    guidedFlow: PUBLIC_GUIDED_FLOW,
    // The public controller already supports this flag. It only exposes the
    // diagnostics needed by the gate; search execution still follows /api/generate.
    debug: true,
  };
}

async function runPublicSearch(origin: string, query: string) {
  const response = await fetch(`${origin}${PUBLIC_SEARCH_PATH}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(publicSearchRequestBody(query)),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({
    error: "public_search_returned_non_json",
  }));
  return { payload, status: response.status };
}

export async function GET(request: Request) {
  if (!(await authorized(request))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const requestUrl = new URL(request.url);
  const expectedCommit = requestUrl.searchParams.get("expectedCommit")?.trim() || null;
  const deploymentCommit = String(process.env.VERCEL_GIT_COMMIT_SHA || "").trim() || null;
  if (expectedCommit && deploymentCommit !== expectedCommit) {
    return NextResponse.json(
      {
        ok: false,
        deploymentPending: true,
        expectedCommit,
        deploymentCommit,
      },
      { status: 409 },
    );
  }

  const runtimeConfig = await resolveSearchMlRuntimeConfig();
  const results: any[] = [];
  for (const query of QUERIES) {
    const started = performance.now();
    try {
      const publicResult = await runPublicSearch(requestUrl.origin, query);
      results.push(
        qaSnapshot(query, publicResult.payload, performance.now() - started, publicResult.status),
      );
    } catch (error) {
      results.push({
        query,
        publicRoute: PUBLIC_SEARCH_PATH,
        ok: false,
        behavior: {
          ok: false,
          checks: [
            {
              name: "public_search_completed",
              ok: false,
              detail: error instanceof Error ? error.message : "unknown_public_search_qa_failure",
            },
          ],
        },
        elapsedMs: performance.now() - started,
        error: error instanceof Error ? error.message : "unknown_public_search_qa_failure",
      });
    }
  }

  const failed = results.filter((result) => result.ok === false);
  const behavioralFailures = results.filter((result) => result.behavior?.ok === false);
  const missingMlTrace = results.filter(
    (result) => result.ok !== false && (!result.semantic || !result.rerank),
  );
  const latencies = results
    .map((result) => Number(result?.timing?.totalMs ?? result.elapsedMs ?? 0))
    .filter(Number.isFinite);
  const sorted = [...latencies].sort((a, b) => a - b);
  const percentile = (p: number) =>
    sorted.length
      ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)]
      : 0;
  const overallOk =
    failed.length === 0 && behavioralFailures.length === 0 && missingMlTrace.length === 0;

  return NextResponse.json(
    {
      ok: overallOk,
      generatedAt: new Date().toISOString(),
      deploymentCommit,
      publicSearch: {
        route: PUBLIC_SEARCH_PATH,
        method: "POST",
        selectedSearchLane: "auto",
        timezone: PUBLIC_SEARCH_TIMEZONE,
        guidedFlow: PUBLIC_GUIDED_FLOW,
        usesPublicHttpRoute: true,
      },
      runtime: {
        endpoint: runtimeConfig.endpoint,
        semanticMode: runtimeConfig.semanticMode,
        rerankMode: runtimeConfig.rerankMode,
        embeddingModel: runtimeConfig.embeddingModel,
        embeddingVersion: runtimeConfig.embeddingVersion,
        rerankModel: runtimeConfig.rerankModel,
        rerankVersion: runtimeConfig.rerankVersion,
      },
      summary: {
        queryCount: results.length,
        failedCount: failed.length,
        behavioralFailureCount: behavioralFailures.length,
        missingMlTraceCount: missingMlTrace.length,
        p50TotalMs: percentile(0.5),
        p95TotalMs: percentile(0.95),
        maxTotalMs: sorted.at(-1) ?? 0,
      },
      results,
    },
    { status: overallOk ? 200 : 503 },
  );
}
