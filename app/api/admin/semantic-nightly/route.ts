import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DEFAULT_BATCH_SIZE = 50;
const EMBEDDING_MODEL = "text-embedding-3-small";
const LOCATION_SAFE_ORDER_COLUMN = "id";
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

const NIGHTLIFE_TERMS = ["lounge", "bar", "hookah", "nightclub", "nightlife", "cocktail", "club"];
const DESSERT_TERMS = ["dessert", "bakery", "ice cream", "cake", "pastry", "cookie", "cookies", "chocolate", "sweets"];
const ROMANTIC_TERMS = ["romantic", "date night", "upscale", "intimate"];
const BIRTHDAY_TERMS = ["birthday", "celebration"];
const GROUP_TERMS = ["group", "private party", "team"];
const FAMILY_TERMS = ["family", "kids", "children"];
const FOOD_TERMS = ["restaurant", "food", "dining", "cuisine", "brunch", "lunch", "dinner", "cafe"];

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
  const { error } = await requireAdminApiRole(["superadmin", "admin", "editor"]);
  return error;
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => cleanText(item)).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((item) => cleanText(item)).filter(Boolean);
  return [];
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
  const parts = [
    location.name,
    location.restaurant_name,
    location.activity_name,
    location.description,
    location.address,
    location.city,
    location.state,
    location.cuisine,
    location.cuisine_type,
    location.category,
    location.primary_category,
    location.activity_type,
    location.primary_tag,
    location.source_table,
    ...toArray(location.tags),
    ...toArray(location.vibe_tags),
    ...toArray(location.best_for_tags),
    ...toArray(location.google_types),
  ]
    .map((value) => cleanText(value))
    .filter(Boolean);

  const joined = parts.join(" · ").slice(0, 7000);
  if (joined) return joined;

  const city = cleanText(location.city) || "Unknown city";
  const state = cleanText(location.state) || "Unknown state";
  const category = cleanText(location.source_table) || cleanText(location.location_type) || cleanText(location.category) || "general";
  return `Unnamed location in ${city} ${state} categorized as ${category}`;
}

function buildSemanticTags(location: Record<string, unknown>, semanticText: string) {
  return uniqueTags([
    cleanText(location.location_type),
    cleanText(location.primary_category),
    cleanText(location.category),
    cleanText(location.cuisine),
    cleanText(location.cuisine_type),
    cleanText(location.activity_type),
    cleanText(location.primary_tag),
    cleanText(location.source_table),
    ...toArray(location.tags),
    ...toArray(location.vibe_tags),
    ...toArray(location.best_for_tags),
    ...toArray(location.google_types),
    ...semanticText.split(/\s+/).filter((word) => word.length > 3).slice(0, 30),
  ]).slice(0, 80);
}

function buildIntentTags(location: Record<string, unknown>, semanticText: string) {
  const tags: string[] = [];
  const sourceTable = cleanText(location.source_table).toLowerCase();
  const type = cleanText(location.location_type).toLowerCase();
  const compositeText = [
    semanticText,
    cleanText(location.name),
    cleanText(location.restaurant_name),
    cleanText(location.activity_name),
    cleanText(location.category),
    cleanText(location.primary_category),
    cleanText(location.activity_type),
    ...toArray(location.tags),
    ...toArray(location.google_types),
  ]
    .join(" ")
    .toLowerCase();

  if (sourceTable.includes("restaurant") || type.includes("restaurant") || cleanText(location.restaurant_name) || cleanText(location.cuisine)) tags.push("restaurant");
  if (sourceTable.includes("activity") || type.includes("activity") || cleanText(location.activity_name)) tags.push("activity");
  if (includesAny(compositeText, NIGHTLIFE_TERMS)) tags.push("nightlife");
  if (includesAny(compositeText, DESSERT_TERMS)) tags.push("dessert");
  if (includesAny(compositeText, ROMANTIC_TERMS)) tags.push("romantic");
  if (includesAny(compositeText, BIRTHDAY_TERMS)) tags.push("birthday");
  if (includesAny(compositeText, GROUP_TERMS)) tags.push("group");
  if (includesAny(compositeText, FAMILY_TERMS)) tags.push("family");

  const unique = uniqueTags(tags);
  if (unique.length > 0) return unique;

  const fallbackText = [sourceTable, cleanText(location.category), cleanText(location.primary_category)].join(" ").toLowerCase();
  return [includesAny(fallbackText, FOOD_TERMS) ? "restaurant" : "activity"];
}

function calculateQualityScore(location: Record<string, unknown>) { const fields = [location.name || location.restaurant_name || location.activity_name, location.description, location.address, location.city, location.state, location.phone, location.website, location.google_place_id, location.reservation_link || location.reservation_url || location.external_reservation_url || location.booking_url, location.rating]; return Number(((fields.filter((field) => cleanText(field).length > 0 || safeNumber(field) > 0).length / fields.length) * 100).toFixed(2)); }
function calculateAnalyticsScore(analytics: Record<string, unknown> | null | undefined) { if (!analytics) return 0; const views = safeNumber(analytics.views); const clicks = safeNumber(analytics.clicks); const saves = safeNumber(analytics.saves); const bookings = safeNumber(analytics.bookings); const skips = safeNumber(analytics.skips); return Number(Math.max(0, views * 0.05 + clicks * 0.5 + saves * 1.5 + bookings * 4 - skips * 0.35).toFixed(2)); }
function calculateRecommendationScore(location: Record<string, unknown>, qualityScore: number, analyticsScore: number) { const rating = safeNumber(location.rating); const hasReservation = Boolean(location.reservation_link || location.reservation_url || location.external_reservation_url || location.booking_url || location.reservation_enabled); const promoted = Boolean(location.is_promoted) || ["pro", "premium", "growth", "launch"].includes(cleanText(location.subscription_plan).toLowerCase()); return Number(Math.max(0, qualityScore * 0.35 + analyticsScore * 0.25 + rating * 10 + (hasReservation ? 8 : 0) + (promoted ? 10 : 0)).toFixed(2)); }

function missingColumnName(message: string) { const quoted = message.match(/column\s+"?([a-zA-Z0-9_]+)"?\s+(?:of relation\s+"?[a-zA-Z0-9_]+"?\s+)?does not exist/i); return quoted?.[1] || null; }

async function safeUpdateLocation(id: string, payload: Record<string, unknown>) {
  let remainingPayload = { ...payload };
  for (let attempt = 0; attempt < OPTIONAL_UPDATE_COLUMNS.size + 1; attempt += 1) {
    const { error } = await supabaseAdmin.from("locations").update(remainingPayload).eq("id", id);
    if (!error) return { success: true };
    const missingColumn = missingColumnName(error.message || "");
    if (!missingColumn || !OPTIONAL_UPDATE_COLUMNS.has(missingColumn)) return { success: false, error: error.message };
    const { [missingColumn]: _removed, ...nextPayload } = remainingPayload;
    remainingPayload = nextPayload;
  }
  return { success: false, error: "Unable to update location after removing missing optional columns." };
}

function parseBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["1", "true", "yes"].includes(value.toLowerCase());
  return false;
}

async function runSemanticNightly(request: NextRequest) {
  const authError = await authorizeAdminOrCron(request);
  if (authError) return authError;

  const body = request.method === "POST" ? await request.json().catch(() => ({})) : {};
  const query = request.nextUrl.searchParams;
  const limit = Math.min(Math.max(Number(body.limit || body.batch_size || query.get("limit") || query.get("batch_size") || DEFAULT_BATCH_SIZE), 1), 200);
  const offset = Math.max(Number(body.offset || query.get("offset") || 0), 0);
  const all = parseBoolean(body.all ?? query.get("all"));
  const missing = parseBoolean(body.missing ?? query.get("missing"));
  const repair = parseBoolean(body.repair ?? query.get("repair"));

  let selector = supabaseAdmin.from("locations").select("*", { count: "exact" }).order(LOCATION_SAFE_ORDER_COLUMN, { ascending: true }).range(offset, offset + limit - 1);

  if (repair || missing) {
    selector = selector.or("semantic_search_text.is.null,semantic_search_text.eq.,intent_tags.is.null,recommendation_score.is.null,analytics_score.is.null,intent_tags.eq.{}");
  } else if (!all) {
    selector = selector.eq("needs_semantic_refresh", true);
  }

  const { data: locations, error } = await selector;
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  const ids = (locations || []).map((location: any) => String(location.id)).filter(Boolean);
  const analyticsByLocation = new Map<string, Record<string, unknown>>();
  if (ids.length > 0) {
    const { data: analytics } = await supabaseAdmin.from("location_analytics").select("*").in("location_id", ids);
    (analytics || []).forEach((row: any) => analyticsByLocation.set(String(row.location_id), row));
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  let updated = 0;
  let skipped = 0;
  const failures: Array<{ id: string; error: string }> = [];

  for (const location of locations || []) {
    const id = String(location.id || "");
    if (!id) continue;
    try {
      const semanticSearchText = buildSemanticSearchText(location);
      const intentTags = buildIntentTags(location, semanticSearchText);
      let embeddingVector: number[] | null = null;
      let embeddingFailed = false;
      try {
        const embedding = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: semanticSearchText });
        embeddingVector = embedding.data[0]?.embedding || null;
      } catch {
        embeddingFailed = true;
      }
      const qualityScore = calculateQualityScore(location);
      const analyticsScore = calculateAnalyticsScore(analyticsByLocation.get(id));
      const recommendationScore = calculateRecommendationScore(location, qualityScore, analyticsScore);
      const payload = {
        semantic_search_text: semanticSearchText,
        semantic_tags: buildSemanticTags(location, semanticSearchText),
        intent_tags: intentTags,
        quality_score: qualityScore,
        analytics_score: analyticsScore,
        recommendation_score: recommendationScore,
        semantic_embedding: embeddingVector,
        embedding_updated_at: new Date().toISOString(),
        needs_semantic_refresh: embeddingFailed,
      };
      const updateResult = await safeUpdateLocation(id, payload);
      if (!updateResult.success) {
        failures.push({ id, error: updateResult.error || "Update failed" });
        continue;
      }
      updated += 1;
      if (embeddingFailed) {
        failures.push({ id, error: "embedding_failed" });
      }
    } catch (locationError) {
      failures.push({ id, error: locationError instanceof Error ? locationError.message : String(locationError) });
    }
  }

  const missingFilter = "semantic_search_text.is.null,semantic_search_text.eq.,intent_tags.is.null,intent_tags.eq.{}";
  const [missingTextRes, missingIntentRes, sampleMissingRes] = await Promise.all([
    supabaseAdmin.from("locations").select("id", { count: "exact", head: true }).or("semantic_search_text.is.null,semantic_search_text.eq."),
    supabaseAdmin.from("locations").select("id", { count: "exact", head: true }).or("intent_tags.is.null,intent_tags.eq.{}"),
    supabaseAdmin.from("locations").select("id,name,restaurant_name,activity_name,source_table,location_type,city,state").or(missingFilter).limit(10),
  ]);

  const sampleMissingLocations = (sampleMissingRes.data || []).map((row: any) => ({
    id: row.id,
    name: row.name || row.restaurant_name || row.activity_name || "Unnamed",
    source_table: row.source_table || null,
    type: row.location_type || null,
    city: row.city || null,
    state: row.state || null,
  }));

  return NextResponse.json({
    success: failures.length === 0,
    mode: repair ? "repair" : missing ? "missing" : all ? "all" : "refresh_only",
    processed: (locations || []).length,
    updated,
    skipped,
    failures,
    remaining_missing_semantic_search_text: missingTextRes.count || 0,
    remaining_missing_intent_tags: missingIntentRes.count || 0,
    sample_missing_locations: sampleMissingLocations,
  });
}

export async function GET(request: NextRequest) { return runSemanticNightly(request); }
export async function POST(request: NextRequest) { return runSemanticNightly(request); }
