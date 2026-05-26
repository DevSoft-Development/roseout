import { inferRecordDomain, searchFallbackActivities, searchFallbackRestaurants } from "@/lib/search/database";
import { parseCanonicalIntent } from "@/lib/search/intent";
import { runTheOutHavenSearch } from "@/lib/search/searchPipeline";


const NYC_SERVICE_TERMS = [
  "new york",
  "nyc",
  "brooklyn",
  "queens",
  "manhattan",
  "bronx",
  "staten island",
  "astoria",
  "elmhurst",
  "jackson heights",
  "ridgewood",
  "long island city",
  "lic",
  "jamaica",
  "flushing",
  "forest hills",
  "fresh meadows",
  "sunnyside",
  "woodside",
  "bayside",
  "rego park",
  "corona",
];

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

function getSourceErrorReply(args: {
  sourceErrorCount: number;
  finalHasCards: boolean;
}) {
  const { sourceErrorCount, finalHasCards } = args;
  if (finalHasCards || sourceErrorCount < 2) return null;
  return "Search providers are temporarily unavailable. Please retry in a moment.";
}

function normalizeLocation(item: any) {
  return {
    ...item,
    location: typeof item?.location === "string" ? item.location.trim() : "",
    borough: typeof item?.borough === "string" ? item.borough.trim() : "",
    city: typeof item?.city === "string" ? item.city.trim() : "",
  };
}

function isOutingEligibleLocation(item: any) {
  return Boolean(item && (item.name || item.title));
}

function isWithinTheOutHavenServiceArea(item: any) {
  const area = [
    item?.borough,
    item?.city,
    item?.neighborhood,
    item?.address,
    item?.search_document,
    item?.location,
  ].join(" ").toLowerCase();

  if (!area.trim()) return true;

  return NYC_SERVICE_TERMS.some((token) => area.includes(token));
}

async function fetchFallbackRecords(input: string = "") {
  const fallbackIntent = parseCanonicalIntent(input, {});
  const [restaurantsResult, activitiesResult] = await Promise.all([
    searchFallbackRestaurants(fallbackIntent),
    searchFallbackActivities(fallbackIntent),
  ]);
  const restaurants = restaurantsResult.records ?? [];
  const activities = activitiesResult.records ?? [];
  return {
    locations: [...restaurants, ...activities],
    restaurants,
    activities,
  };
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
    return Response.json({
      success: false,
      reply: "Please provide a search request.",
      restaurants: [],
      activities: [],
      matched_locations: [],
      pairs: [],
      render_mode: "text",
      card_counts: { restaurants: 0, activities: 0, matched_locations: 0, pairs: 0 },
    });
  }

  const diagnostics = createSearchDiagnostics(input);
  diagnostics.stage = "intent_parse_start";

  const result = await runTheOutHavenSearch(input, body);
  const intent = result?.intent ?? body?.intent ?? parseCanonicalIntent(input, body);

  const mergedLocations = [
    ...(result?.matched_locations ?? []),
    ...(result?.restaurants ?? []),
    ...(result?.activities ?? []),
  ];
  const locations = mergedLocations.map(normalizeLocation);
  setDiagCount(diagnostics, "merged_locations", mergedLocations);
  setDiagCount(diagnostics, "normalized_locations", locations);

  diagnostics.stage = "response_ready";
  diagnostics.preliminaryIntent = body?.intent ?? null;
  diagnostics.finalIntent = {
    wantsRestaurant: intent.wantsRestaurant,
    wantsActivity: intent.wantsActivity,
    wantsFullOuting: intent.wantsFullOuting,
    foodIntents: intent.foodIntents,
    activityIntents: intent.activityIntents,
    locations: intent.locations,
    multiIntentMode: (intent as any).multiIntentMode,
  };

  const usableLocations = locations.filter(
    (item: any) => isOutingEligibleLocation(item) && isWithinTheOutHavenServiceArea(item)
  );
  const sourceLocations = usableLocations.length > 0 ? usableLocations : locations;
  setDiagCount(diagnostics, "usable_locations", usableLocations);
  setDiagCount(diagnostics, "source_locations", sourceLocations);
  if (usableLocations.length === 0 && locations.length > 0) {
    diagnostics.notes.push(
      "All normalized locations were removed by approval/service-area filtering."
    );
  }

  const restaurants = result?.restaurants ?? [];
  const activities = result?.activities ?? [];
  setDiagCount(diagnostics, "initial_restaurants", restaurants);
  setDiagCount(diagnostics, "initial_activities", activities);

  const rankedRestaurants = [...restaurants];
  const rankedActivities = [...activities];
  let topRestaurants = [...rankedRestaurants];
  let topActivities = [...rankedActivities];
  let matchedLocationResults = result?.matched_locations ?? [];
  let fallbackAttempted = false;

  setDiagCount(diagnostics, "filtered_restaurants", restaurants);
  setDiagCount(diagnostics, "filtered_activities", activities);
  setDiagCount(diagnostics, "ranked_restaurants", rankedRestaurants);
  setDiagCount(diagnostics, "ranked_activities", rankedActivities);
  setDiagCount(diagnostics, "top_restaurants", topRestaurants);
  setDiagCount(diagnostics, "top_activities", topActivities);
  setDiagCount(diagnostics, "matched_location_results", matchedLocationResults);

  if (
    topRestaurants.length === 0 &&
    topActivities.length === 0 &&
    matchedLocationResults.length === 0
  ) {
    fallbackAttempted = true;
    const fallbackRecords = await fetchFallbackRecords(input);
    const normalizedFallbackLocations = (fallbackRecords.locations ?? [])
      .map(normalizeLocation)
      .filter(
        (item: any) =>
          isOutingEligibleLocation(item) && isWithinTheOutHavenServiceArea(item)
      );

    const requestedLocations: string[] = Array.isArray(intent?.locations)
      ? intent.locations
      : [];
    const locationFilteredFallback =
      requestedLocations.length > 0
        ? normalizedFallbackLocations.filter((item: any) => {
            const haystack = `${item?.location ?? ""} ${item?.borough ?? ""} ${item?.city ?? ""}`.toLowerCase();
            return requestedLocations.some((loc) => haystack.includes(String(loc).toLowerCase()));
          })
        : normalizedFallbackLocations;

    const emergencyRestaurants = locationFilteredFallback.filter(
      (item: any) => inferRecordDomain(item) === "restaurant"
    );
    const emergencyActivities = locationFilteredFallback.filter(
      (item: any) => inferRecordDomain(item) === "activity"
    );

    topRestaurants = emergencyRestaurants;
    topActivities = emergencyActivities;
    matchedLocationResults = locationFilteredFallback;

    diagnostics.notes.push("Emergency fallback records used for empty-card recovery.");
    setDiagCount(diagnostics, "emergency_restaurants", emergencyRestaurants);
    setDiagCount(diagnostics, "emergency_activities", emergencyActivities);
    setDiagCount(diagnostics, "emergency_matched_locations", locationFilteredFallback);
  }

  setDiagCount(diagnostics, "rpc_restaurants", result?.debug?.rawRestaurantCount);
  setDiagCount(diagnostics, "rpc_activities", result?.debug?.rawActivityCount);
  setDiagCount(diagnostics, "eligibility_restaurants", result?.debug?.afterCategoryFilterRestaurantCount);
  setDiagCount(diagnostics, "eligibility_activities", result?.debug?.afterCategoryFilterActivityCount);
  setDiagCount(diagnostics, "ranked_restaurants", result?.restaurants ?? []);
  setDiagCount(diagnostics, "ranked_activities", result?.activities ?? []);
  setDiagCount(diagnostics, "final_pairs", result?.pairs ?? []);
  if (!hasAnySearchRecords({ restaurants: topRestaurants, activities: topActivities, locations: matchedLocationResults })) {
    diagnostics.notes.push(result?.debug?.empty_reason || "no_final_cards");
  }
  logSearchDiagnostics(diagnostics);

  const finalHasCards =
    topRestaurants.length > 0 ||
    topActivities.length > 0 ||
    matchedLocationResults.length > 0 ||
    (result?.pairs?.length ?? 0) > 0;

  const sourceErrors = result?.debug?.sourceErrors ?? [];
  const sourceErrorCount = sourceErrors.length;
  const sourceErrorReply = getSourceErrorReply({
    sourceErrorCount,
    finalHasCards,
  });

  const finalReply =
    sourceErrorReply
      ? sourceErrorReply
      : !finalHasCards && sourceErrorCount > 0
        ? (process.env.NODE_ENV === "production"
          ? "Search providers are temporarily unavailable. Please retry in a moment."
          : "Search database error. Check debug.sourceErrors.")
      : topRestaurants.length && topActivities.length
      ? "Found food and activity options for your outing."
      : topRestaurants.length
        ? "Found restaurant matches. Activity inventory is limited for this request."
        : topActivities.length
          ? "Found activity matches. Restaurant inventory is limited for this request."
          : result?.reply ?? "No matching records found yet.";

  return Response.json({
    ...result,
    reply: finalReply,
    restaurants: topRestaurants,
    activities: topActivities,
    matched_locations: matchedLocationResults,
    render_mode: finalHasCards ? "cards" : result?.render_mode ?? "empty",
    card_counts: {
      ...result?.card_counts,
      restaurants: topRestaurants.length,
      activities: topActivities.length,
      matched_locations: matchedLocationResults.length,
    },
  });
}
