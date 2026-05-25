import { runTheOutHavenSearch } from "@/lib/search/searchPipeline";
import { supabase } from "@/lib/supabase";

type SearchDiagnostics = {
  input: string;
  stage: string;
  preliminaryIntent?: any;
  finalIntent?: any;
  counts: Record<string, number>;
  notes: string[];
  errors: string[];
};

function createSearchDiagnostics(input: string): SearchDiagnostics {
  return {
    input,
    stage: "started",
    counts: {},
    notes: [],
    errors: [],
  };
}

function setDiagCount(
  diagnostics: SearchDiagnostics,
  key: string,
  value: unknown
) {
  diagnostics.counts[key] =
    Array.isArray(value) ? value.length : typeof value === "number" ? value : 0;
}

function logSearchDiagnostics(diagnostics: SearchDiagnostics) {
  const safeDiagnostics =
    process.env.NODE_ENV === "production"
      ? {
          input: diagnostics.input,
          stage: diagnostics.stage,
          counts: diagnostics.counts,
          notes: diagnostics.notes,
          errors: diagnostics.errors,
        }
      : diagnostics;

  console.log(
    "THEOUTHAVEN_SEARCH_DIAGNOSTICS",
    JSON.stringify(safeDiagnostics, null, 2)
  );
}

function hasAnySearchRecords(records: {
  locations?: any[];
  restaurants?: any[];
  activities?: any[];
}) {
  return (
    (records.locations?.length || 0) > 0 ||
    (records.restaurants?.length || 0) > 0 ||
    (records.activities?.length || 0) > 0
  );
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const input =
    typeof body?.message === "string"
      ? body.message
      : typeof body?.input === "string"
        ? body.input
        : typeof body?.query === "string"
          ? body.query
          : "";

  if (!input || !input.trim()) {
    const responsePayload = {
      success: false,
      reply: "Please provide a search request.",
      restaurants: [],
      activities: [],
      matched_locations: [],
      pairs: [],
      render_mode: "text",
      card_counts: { restaurants: 0, activities: 0, matched_locations: 0, pairs: 0 },
    };
    return Response.json({
      ...responsePayload,
    });
  }

  const diagnostics = createSearchDiagnostics(input);
  diagnostics.stage = "intent_parse_start";

  const result = await runTheOutHavenSearch(input, body);
  diagnostics.stage = "response_ready";
  diagnostics.preliminaryIntent = body?.intent ?? null;
  diagnostics.finalIntent = result?.intent ?? null;
  setDiagCount(diagnostics, "rpc_restaurants", result?.debug?.rawRestaurantCount);
  setDiagCount(diagnostics, "rpc_activities", result?.debug?.rawActivityCount);
  setDiagCount(diagnostics, "eligibility_restaurants", result?.debug?.afterCategoryFilterRestaurantCount);
  setDiagCount(diagnostics, "eligibility_activities", result?.debug?.afterCategoryFilterActivityCount);
  setDiagCount(diagnostics, "ranked_restaurants", result?.restaurants ?? []);
  setDiagCount(diagnostics, "ranked_activities", result?.activities ?? []);
  setDiagCount(diagnostics, "final_pairs", result?.pairs ?? []);
  if (!hasAnySearchRecords({ restaurants: result?.restaurants, activities: result?.activities })) {
    diagnostics.notes.push(result?.debug?.empty_reason || "no_final_cards");
  }

  const responsePayload: any = {
    ...result,
    render_mode:
      (result?.restaurants?.length || 0) > 0 ||
      (result?.activities?.length || 0) > 0 ||
      (result?.matched_locations?.length || 0) > 0
        ? "cards"
        : result?.render_mode,
    debug: process.env.NODE_ENV !== "production" ? diagnostics : undefined,
  };

  const cacheKey = input.trim().toLowerCase();
  const shouldCacheResponse =
    responsePayload.restaurants.length > 0 ||
    responsePayload.activities.length > 0 ||
    responsePayload.matched_locations.length > 0;

  if (shouldCacheResponse) {
    await supabase.from("ai_response_cache").upsert({
      cache_key: cacheKey,
      user_query: input,
      response: responsePayload,
    });
  } else {
    diagnostics.notes.push("Skipped cache because response had no card records.");
  }

  logSearchDiagnostics(diagnostics);

  return Response.json(responsePayload);
}
