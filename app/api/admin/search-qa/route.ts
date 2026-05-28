import { requireAdminApiRole } from "@/lib/admin-api-auth";

const SEARCH_QA_QUERIES = [
  "dinner and dessert",
  "dessert add-on",
  "romantic dinner",
  "hookah and dinner",
  "group activity",
  "birthday dinner",
  "fun date night",
  "seafood dinner walking distance activity",
  "rooftop lounge",
  "brunch and activity",
] as const;

type SearchResultItem = Record<string, unknown>;

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function buildReason(item: SearchResultItem, query: string) {
  const reason: string[] = [];
  const intentTags = Array.isArray(item.intent_tags) ? item.intent_tags : [];
  const semanticTags = Array.isArray(item.semantic_tags) ? item.semantic_tags : [];

  if (intentTags.length) reason.push(`intent_tags: ${intentTags.join(", ")}`);
  if (semanticTags.length) reason.push(`semantic_tags: ${semanticTags.join(", ")}`);
  if (typeof item.semantic_similarity === "number") reason.push(`semantic_similarity: ${item.semantic_similarity.toFixed(3)}`);
  if (typeof item.recommendation_score === "number") reason.push(`recommendation_score: ${item.recommendation_score.toFixed(2)}`);
  if (typeof item.analytics_score === "number") reason.push(`analytics_score: ${item.analytics_score.toFixed(2)}`);
  if (!reason.length) reason.push(`Matched by ranking pipeline for query \"${query}\"`);

  return reason.join(" | ");
}

function buildWarnings(query: string, item: SearchResultItem, type: "restaurant" | "activity") {
  const warnings: string[] = [];
  const queryText = query.toLowerCase();
  const searchable = [
    item.name,
    item.restaurant_name,
    item.activity_name,
    item.primary_category,
    item.category,
    item.activity_type,
    item.cuisine,
    item.semantic_search_text,
    ...(Array.isArray(item.intent_tags) ? item.intent_tags : []),
  ]
    .map((entry) => normalizeText(entry))
    .join(" ");

  if (!Array.isArray(item.intent_tags) || item.intent_tags.length === 0) warnings.push("missing intent_tags");
  if (!normalizeText(item.semantic_search_text).trim()) warnings.push("missing semantic_search_text");
  if (item.latitude == null || item.longitude == null) warnings.push("missing coordinates");

  if (queryText.includes("dessert") && includesAny(searchable, ["candle", "dance", "fitness", "class"])) {
    warnings.push("dessert query returned likely unrelated candle/dance/fitness/class result");
  }

  if (type === "restaurant" && includesAny(searchable, ["activity", "class", "studio", "tour"]) && !includesAny(searchable, ["restaurant", "dinner", "food", "cafe"])) {
    warnings.push("restaurant search returned activity-only looking place");
  }

  const distance = typeof item.distance_miles === "number" ? item.distance_miles : null;
  if (queryText.includes("walking distance") && typeof distance === "number" && distance > 2) {
    warnings.push("walking distance query returned distance over realistic threshold (>2 miles)");
  }

  const city = normalizeText(item.city);
  const state = normalizeText(item.state);
  if ((city.includes("new york") || city === "nyc") && state && state !== "ny" && state !== "new york") {
    warnings.push("mismatched city/state (NYC city with non-NY state)");
  }

  return warnings;
}

async function runQuery(origin: string, query: string) {
  const res = await fetch(`${origin}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input: query }),
    cache: "no-store",
  });

  const data = await res.json();
  const restaurants = Array.isArray(data.restaurants) ? data.restaurants.slice(0, 10) : [];
  const activities = Array.isArray(data.activities) ? data.activities.slice(0, 10) : [];

  const mapItem = (item: SearchResultItem, type: "restaurant" | "activity") => ({
    id: item.id,
    name: item.name || item.restaurant_name || item.activity_name || "Unnamed",
    type,
    category_intent_tags: item.intent_tags ?? [],
    city: item.city ?? null,
    state: item.state ?? null,
    rating: item.rating ?? null,
    recommendation_score: item.recommendation_score ?? null,
    analytics_score: item.analytics_score ?? null,
    distance_miles: item.distance_miles ?? null,
    reason: buildReason(item, query),
    warnings: buildWarnings(query, item, type),
  });

  return {
    query,
    top_restaurants: restaurants.map((item: SearchResultItem) => mapItem(item, "restaurant")),
    top_activities: activities.map((item: SearchResultItem) => mapItem(item, "activity")),
  };
}

export async function POST(request: Request) {
  const { error } = await requireAdminApiRole(["superadmin", "admin", "editor", "reviewer", "viewer"]);
  if (error) return error;

  const origin = new URL(request.url).origin;
  const reports = [];

  for (const query of SEARCH_QA_QUERIES) reports.push(await runQuery(origin, query));

  return Response.json({
    success: true,
    generated_at: new Date().toISOString(),
    total_queries: SEARCH_QA_QUERIES.length,
    reports,
  });
}
