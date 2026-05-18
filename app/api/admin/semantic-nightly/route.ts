import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DEFAULT_BATCH_SIZE = 50;
const EMBEDDING_MODEL = "text-embedding-3-small";
const OPTIONAL_UPDATE_COLUMNS = new Set([
  "semantic_search_text",
  "semantic_tags",
  "intent_tags",
  "quality_score",
  "recommendation_score",
  "analytics_score",
  "semantic_embedding",
  "embedding_updated_at",
  "needs_semantic_refresh",
]);

const DESSERT_TERMS = [
  "bakery",
  "dessert",
  "dessert cafe",
  "ice cream",
  "gelato",
  "cake",
  "pastry",
  "cookies",
  "cookie",
  "sweets",
  "sweet",
  "chocolate",
];

const NIGHTLIFE_TERMS = ["hookah", "lounge", "bar", "nightlife", "cocktail", "club", "nightclub", "rooftop"];
const ACTIVITY_TERMS = ["activity", "activities", "museum", "escape", "bowling", "arcade", "class", "studio", "karaoke", "mini golf", "paint"];
const RESTAURANT_TERMS = ["restaurant", "dinner", "brunch", "lunch", "breakfast", "food", "cuisine", "dining", "cafe"];
const ROMANTIC_TERMS = ["romantic", "date night", "intimate", "anniversary", "cozy"];
const GROUP_TERMS = ["group", "friends", "party", "large party", "team"];
const BIRTHDAY_TERMS = ["birthday", "celebration", "celebrate"];
const FAMILY_TERMS = ["family", "kids", "children", "all ages"];

function getBearerToken(request: NextRequest) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  return auth.slice(7).trim();
}

function isCronAuthorized(request: NextRequest) {
  const bearerToken = getBearerToken(request);
  return Boolean(process.env.CRON_SECRET && bearerToken === process.env.CRON_SECRET);
}

async function authorizeAdminOrCron(request: NextRequest) {
  if (process.env.NODE_ENV === "development" || isCronAuthorized(request)) return null;

  const { error } = await requireAdminApiRole(["superuser", "admin", "editor"]);
  return error;
}

function toArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function safeNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function uniqueTags(tags: string[]) {
  return Array.from(new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean)));
}

function buildSemanticSearchText(location: Record<string, unknown>) {
  return [
    location.name,
    location.restaurant_name,
    location.activity_name,
    location.description,
    location.city,
    location.state,
    location.cuisine,
    location.cuisine_type,
    location.category,
    location.primary_category,
    ...toArray(location.tags),
    ...toArray(location.vibe_tags),
    ...toArray(location.best_for_tags),
  ]
    .map(cleanText)
    .filter(Boolean)
    .join(" · ")
    .slice(0, 7000);
}

function buildSemanticTags(location: Record<string, unknown>, semanticText: string) {
  return uniqueTags([
    cleanText(location.location_type),
    cleanText(location.primary_category),
    cleanText(location.category),
    cleanText(location.cuisine),
    cleanText(location.cuisine_type),
    cleanText(location.activity_type),
    ...toArray(location.tags),
    ...toArray(location.vibe_tags),
    ...toArray(location.best_for_tags),
    ...semanticText.split(/\s+/).filter((word) => word.length > 3).slice(0, 30),
  ]).slice(0, 80);
}

function buildIntentTags(location: Record<string, unknown>, semanticText: string) {
  const text = [
    semanticText,
    location.name,
    location.restaurant_name,
    location.activity_name,
    location.category,
    location.primary_category,
    location.cuisine,
    location.activity_type,
    location.type,
    location.source_table,
    location.description,
    ...toArray(location.tags),
    ...toArray(location.vibe_tags),
    ...toArray(location.google_types),
  ]
    .map(cleanText)
    .join(" ")
    .toLowerCase();
  const tags: string[] = [];
  const locationType = cleanText(location.location_type || location.type).toLowerCase();
  const sourceTable = cleanText(location.source_table).toLowerCase();
  const categoryText = [cleanText(location.category), cleanText(location.primary_category)].join(" ").toLowerCase();

  if (locationType === "restaurant" || sourceTable.includes("restaurant") || includesAny(text, RESTAURANT_TERMS)) tags.push("restaurant");
  if (includesAny(text, DESSERT_TERMS)) tags.push("dessert");
  if (includesAny(text, NIGHTLIFE_TERMS)) tags.push("nightlife");
  if (locationType === "activity" || sourceTable.includes("activity") || includesAny(text, ACTIVITY_TERMS)) tags.push("activity");
  if (includesAny(text, ROMANTIC_TERMS)) tags.push("romantic");
  if (includesAny(text, GROUP_TERMS)) tags.push("group");
  if (includesAny(text, BIRTHDAY_TERMS)) tags.push("birthday");
  if (includesAny(text, FAMILY_TERMS)) tags.push("family");

  if (includesAny(categoryText, ["lounge", "bar", "hookah", "nightlife"])) tags.push("nightlife");
  if (includesAny(categoryText, ["dessert", "bakery", "ice cream", "pastry", "cake"])) tags.push("dessert");

  return uniqueTags(tags);
}

function calculateQualityScore(location: Record<string, unknown>) {
  const fields = [
    location.name || location.restaurant_name || location.activity_name,
    location.description,
    location.address,
    location.city,
    location.state,
    location.phone,
    location.website,
    location.google_place_id,
    location.reservation_link || location.reservation_url || location.external_reservation_url || location.booking_url,
    location.rating,
  ];

  return Number(((fields.filter((field) => cleanText(field).length > 0 || safeNumber(field) > 0).length / fields.length) * 100).toFixed(2));
}

function calculateAnalyticsScore(analytics: Record<string, unknown> | null | undefined) {
  if (!analytics) return 0;

  const views = safeNumber(analytics.views);
  const clicks = safeNumber(analytics.clicks);
  const saves = safeNumber(analytics.saves);
  const bookings = safeNumber(analytics.bookings);
  const skips = safeNumber(analytics.skips);

  return Number(Math.max(0, views * 0.05 + clicks * 0.5 + saves * 1.5 + bookings * 4 - skips * 0.35).toFixed(2));
}

function calculateRecommendationScore(location: Record<string, unknown>, qualityScore: number, analyticsScore: number) {
  const rating = safeNumber(location.rating);
  const hasReservation = Boolean(location.reservation_link || location.reservation_url || location.external_reservation_url || location.booking_url || location.reservation_enabled);
  const promoted = Boolean(location.is_promoted) || ["pro", "premium", "growth", "launch"].includes(cleanText(location.subscription_plan).toLowerCase());

  return Number(
    Math.max(
      0,
      qualityScore * 0.35 +
        analyticsScore * 0.25 +
        rating * 10 +
        (hasReservation ? 8 : 0) +
        (promoted ? 10 : 0),
    ).toFixed(2),
  );
}

function missingColumnName(message: string) {
  const quoted = message.match(/column\s+"?([a-zA-Z0-9_]+)"?\s+(?:of relation\s+"?[a-zA-Z0-9_]+"?\s+)?does not exist/i);
  return quoted?.[1] || null;
}

async function safeUpdateLocation(id: string, payload: Record<string, unknown>) {
  let remainingPayload = { ...payload };

  for (let attempt = 0; attempt < OPTIONAL_UPDATE_COLUMNS.size + 1; attempt += 1) {
    const { error } = await supabaseAdmin.from("locations").update(remainingPayload).eq("id", id);
    if (!error) return { success: true, skippedColumns: [] as string[] };

    const missingColumn = missingColumnName(error.message || "");
    if (!missingColumn || !OPTIONAL_UPDATE_COLUMNS.has(missingColumn)) {
      return { success: false, error: error.message, skippedColumns: [] as string[] };
    }

    const { [missingColumn]: _removed, ...nextPayload } = remainingPayload;
    remainingPayload = nextPayload;
  }

  return { success: false, error: "Unable to update location after removing missing optional columns.", skippedColumns: [] as string[] };
}

async function runSemanticNightly(request: NextRequest) {
  const authError = await authorizeAdminOrCron(request);
  if (authError) return authError;

  const body = request.method === "POST" ? await request.json().catch(() => ({})) : {};
  const searchParams = request.nextUrl.searchParams;
  const processAll = searchParams.get("all") === "true";
  const batchSize = Math.min(Math.max(Number(searchParams.get("limit") || body.batch_size || searchParams.get("batch_size") || DEFAULT_BATCH_SIZE), 1), 100);
  const offset = Math.max(Number(searchParams.get("offset") || body.offset || 0), 0);

  let query = supabaseAdmin.from("locations").select("*").range(offset, offset + batchSize - 1);
  if (!processAll) {
    query = query.or("needs_semantic_refresh.is.true,needs_semantic_refresh.is.null");
  }
  const { data: locations, error } = await query;

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const ids = (locations || []).map((location: any) => location.id).filter(Boolean);
  const analyticsByLocation = new Map<string, Record<string, unknown>>();

  if (ids.length > 0) {
    const { data: analytics } = await supabaseAdmin
      .from("location_analytics")
      .select("*")
      .in("location_id", ids);

    (analytics || []).forEach((row: any) => analyticsByLocation.set(String(row.location_id), row));
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const processedNames: string[] = [];
  const failures: Array<{ id: string; error: string }> = [];

  for (const location of locations || []) {
    const id = String(location.id || "");
    if (!id) continue;

    try {
      const semanticSearchText = buildSemanticSearchText(location) || cleanText(location.name || location.restaurant_name || location.activity_name || id);

      const embedding = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: semanticSearchText,
      });

      const qualityScore = calculateQualityScore(location);
      const analyticsScore = calculateAnalyticsScore(analyticsByLocation.get(id));
      const recommendationScore = calculateRecommendationScore(location, qualityScore, analyticsScore);
      const payload = {
        semantic_search_text: semanticSearchText,
        semantic_tags: buildSemanticTags(location, semanticSearchText),
        intent_tags: buildIntentTags(location, semanticSearchText),
        quality_score: qualityScore,
        analytics_score: analyticsScore,
        recommendation_score: recommendationScore,
        semantic_embedding: embedding.data[0]?.embedding || null,
        embedding_updated_at: new Date().toISOString(),
        needs_semantic_refresh: false,
      };

      const updateResult = await safeUpdateLocation(id, payload);
      if (!updateResult.success) {
        failures.push({ id, error: updateResult.error || "Update failed" });
        continue;
      }

      processedNames.push(cleanText(location.name || location.restaurant_name || location.activity_name) || id);
    } catch (locationError) {
      failures.push({ id, error: locationError instanceof Error ? locationError.message : String(locationError) });
    }
  }

  return NextResponse.json({
    success: failures.length === 0,
    processed: processedNames.length,
    limit: batchSize,
    offset,
    all: processAll,
    updated_location_names: processedNames,
    failures,
  });
}

export async function GET(request: NextRequest) {
  return runSemanticNightly(request);
}

export async function POST(request: NextRequest) {
  return runSemanticNightly(request);
}
