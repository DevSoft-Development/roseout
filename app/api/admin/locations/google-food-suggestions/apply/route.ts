import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { syncSourceRowToLocation } from "@/lib/sync-location";

export const dynamic = "force-dynamic";

const VALID_TABLES = new Set(["locations", "restaurants", "activities"]);

type SourceTable = "locations" | "restaurants" | "activities";

function asArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean);
}

function uniqueMerge(...values: unknown[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const value of values) {
    for (const item of asArray(value)) {
      if (!seen.has(item)) {
        seen.add(item);
        merged.push(item);
      }
    }
  }

  return merged;
}

function firstNonEmpty(...values: unknown[]): string | null {
  for (const value of values) {
    if (Array.isArray(value)) {
      const first = asArray(value)[0];
      if (first) return first;
      continue;
    }

    const text = String(value || "").trim().toLowerCase();
    if (text) return text;
  }

  return null;
}

function keepExistingOrFirst(existing: unknown, suggested: unknown): string | null {
  const current = String(existing || "").trim();
  if (current) return current;
  return firstNonEmpty(suggested);
}

function buildCompatibleLocationUpdate(location: any, suggestion: any) {
  const suggestedFoodTerms = asArray(suggestion.suggested_food_terms);
  const suggestedCuisineTerms = asArray(suggestion.suggested_cuisine_terms);
  const suggestedCategoryTerms = asArray(suggestion.suggested_category_terms);
  const suggestedFeatureTerms = asArray(suggestion.suggested_feature_terms);
  const suggestedSearchKeywords = asArray(suggestion.suggested_search_keywords);
  const suggestedSemanticTags = asArray(suggestion.suggested_semantic_tags);
  const suggestedIntentTags = asArray(suggestion.suggested_intent_tags);
  const now = new Date().toISOString();

  const allSearchKeywords = uniqueMerge(
    location.search_keywords,
    suggestedSearchKeywords,
    suggestedFoodTerms,
    suggestedCuisineTerms,
    suggestedCategoryTerms,
    suggestedFeatureTerms,
  );

  const update: Record<string, unknown> = {
    google_place_id: suggestion.google_place_id || location.google_place_id || null,
    google_primary_type: suggestion.google_primary_type || location.google_primary_type || null,
    google_types: Array.isArray(suggestion.google_types)
      ? suggestion.google_types
      : Array.isArray(location.google_types)
        ? location.google_types
        : [],
    google_enrichment_status: "approved",
    google_enriched_at: now,
    google_last_error: null,
    signature_items: uniqueMerge(location.signature_items, suggestedFoodTerms),
    cuisine: keepExistingOrFirst(location.cuisine, suggestedCuisineTerms),
    cuisine_type: keepExistingOrFirst(location.cuisine_type, suggestedCuisineTerms),
    primary_category: keepExistingOrFirst(location.primary_category, suggestedCategoryTerms),
    primary_tag: keepExistingOrFirst(location.primary_tag, uniqueMerge(suggestedCategoryTerms, suggestedCuisineTerms)),
    special_features: uniqueMerge(location.special_features, suggestedFeatureTerms),
    tags: uniqueMerge(location.tags, suggestedCategoryTerms, suggestedFeatureTerms, suggestedCuisineTerms),
    search_keywords: allSearchKeywords,
    semantic_tags: uniqueMerge(location.semantic_tags, suggestedSemanticTags, suggestedSearchKeywords, suggestedFeatureTerms),
    intent_tags: uniqueMerge(location.intent_tags, suggestedIntentTags, suggestedSearchKeywords),
  };

  return Object.fromEntries(
    Object.entries(update).filter(([key]) => Object.prototype.hasOwnProperty.call(location, key)),
  );
}

async function enqueueProfileRefresh(locationId: string, reason: string) {
  const now = new Date().toISOString();
  const existing = await supabaseAdmin
    .from("location_search_profile_refresh_queue")
    .select("id")
    .eq("location_id", locationId)
    .in("status", ["pending", "processing"])
    .limit(1);

  if (existing.error) throw new Error(`Profile queue lookup failed: ${existing.error.message}`);

  if ((existing.data || []).length > 0) {
    const update = await supabaseAdmin
      .from("location_search_profile_refresh_queue")
      .update({ reason, available_at: now, updated_at: now })
      .eq("id", existing.data![0].id);
    if (update.error) throw new Error(`Profile enqueue failed: ${update.error.message}`);
    return;
  }

  const insert = await supabaseAdmin
    .from("location_search_profile_refresh_queue")
    .insert({
      location_id: locationId,
      reason,
      status: "pending",
      available_at: now,
      updated_at: now,
    });

  if (insert.error) throw new Error(`Profile enqueue failed: ${insert.error.message}`);
}

async function refreshCanonicalSearchProfile(sourceTable: SourceTable, sourceId: string, row: any) {
  if (sourceTable === "locations") {
    await enqueueProfileRefresh(sourceId, "google_enrichment_approved");
    return sourceId;
  }

  const synced = await syncSourceRowToLocation(sourceTable, row);
  const canonicalLocationId = String(synced.id);
  await enqueueProfileRefresh(canonicalLocationId, "google_enrichment_approved");
  return canonicalLocationId;
}

export async function POST(req: Request) {
  const auth = await requireAdminApiRole(["superadmin", "admin", "manager", "editor"]);
  if (auth.error) return auth.error;

  const body = await req.json();
  const suggestionIds = Array.isArray(body.suggestionIds) ? body.suggestionIds.filter(Boolean) : [];
  const action = body.action;

  if (!suggestionIds.length || !["approve", "reject"].includes(action)) {
    return Response.json({ success: false, error: "Provide suggestionIds and action approve or reject." }, { status: 400 });
  }

  const { data: suggestions, error } = await supabaseAdmin
    .from("location_google_food_term_suggestions")
    .select("*")
    .in("id", suggestionIds);

  if (error) return Response.json({ success: false, error: error.message }, { status: 400 });

  if (action === "reject") {
    const { error: rejectError } = await supabaseAdmin
      .from("location_google_food_term_suggestions")
      .update({ status: "rejected", reviewed_by: auth.adminUser?.user_id, reviewed_at: new Date().toISOString() })
      .in("id", suggestionIds);
    if (rejectError) return Response.json({ success: false, error: rejectError.message }, { status: 400 });
    return Response.json({ success: true, rejected: suggestions?.length || 0 });
  }

  let approved = 0;
  let profilesQueued = 0;
  const failures: Array<{ id: string; error: string }> = [];

  for (const suggestion of suggestions || []) {
    const sourceTable = suggestion.source_table as SourceTable;
    if (!VALID_TABLES.has(sourceTable)) {
      failures.push({ id: suggestion.id, error: "Invalid source table" });
      continue;
    }

    const { data: location, error: locationError } = await supabaseAdmin
      .from(sourceTable)
      .select("*")
      .eq("id", suggestion.source_id)
      .maybeSingle();

    if (locationError || !location) {
      failures.push({ id: suggestion.id, error: locationError?.message || "Source row not found" });
      continue;
    }

    const update = buildCompatibleLocationUpdate(location, suggestion);
    const updatedRow = { ...location, ...update };

    const { error: updateError } = await supabaseAdmin
      .from(sourceTable)
      .update(update)
      .eq("id", suggestion.source_id);

    if (updateError) {
      failures.push({ id: suggestion.id, error: updateError.message });
      continue;
    }

    try {
      await refreshCanonicalSearchProfile(sourceTable, String(suggestion.source_id), updatedRow);
      profilesQueued += 1;
    } catch (profileError) {
      failures.push({
        id: suggestion.id,
        error: profileError instanceof Error ? profileError.message : String(profileError),
      });
      continue;
    }

    const { error: suggestionError } = await supabaseAdmin
      .from("location_google_food_term_suggestions")
      .update({
        status: "approved",
        reviewed_by: auth.adminUser?.user_id,
        reviewed_at: new Date().toISOString(),
        applied_at: new Date().toISOString(),
      })
      .eq("id", suggestion.id);

    if (suggestionError) failures.push({ id: suggestion.id, error: suggestionError.message });
    else approved += 1;
  }

  return Response.json({ success: failures.length === 0, approved, profilesQueued, failures });
}
