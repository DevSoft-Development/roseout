import "server-only";

import {
  buildGoogleSuggestionRow,
  enrichLocationFromGoogle,
} from "@/lib/google/places";
import { applySpecialtyFoodConfidence } from "@/lib/google/specialty-food-confidence";
import { cacheGooglePlacePhotoToStorage } from "@/lib/location-growth/cacheGooglePhoto";
import { buildGoogleNoMatchDiagnostics } from "@/lib/location-data-quality/google-match-diagnostics";
import { getLocationDataQualitySummary } from "@/lib/location-data-quality/summary";
import { extractReservationUrl } from "@/lib/reservation-links";
import { enqueueLocationSearchProfileRefresh } from "@/lib/search/profile/profileRepository";
import { supabaseAdmin } from "@/lib/supabase-admin";

type RunSettings = {
  market?: string;
  sourceType?: string;
  gaps?: string[];
  targetLimit?: number;
  processingChunkSize?: number;
};

type RunRow = {
  id: string;
  status: string;
  mode: string;
  batch_size: number;
  max_api_calls: number | null;
  actual_api_calls: number;
  processed_records: number;
  matched_records: number;
  review_records: number;
  no_match_records: number;
  failed_records: number;
  enriched_records: number;
  unchanged_records: number;
  skipped_records: number;
  profiles_queued_records: number;
  photos_cached_records: number;
  batches_completed: number;
  stale_days: number;
  settings: RunSettings | null;
};

type ClaimedItem = {
  id: string;
  run_id: string;
  location_id: string;
  attempts: number;
  reasons: string[] | null;
};

type RecentResult = {
  locationId: string;
  name: string;
  status: "enriched" | "unchanged" | "skipped" | "failed" | "review";
  message: string;
};

const PROFILE_RELEVANT_FIELDS = new Set([
  "google_place_id",
  "google_primary_type",
  "google_types",
  "primary_category",
  "cuisine",
  "cuisine_type",
  "activity_type",
  "search_keywords",
  "semantic_tags",
  "intent_tags",
  "latitude",
  "longitude",
]);

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function locationName(location: Record<string, unknown>) {
  return stringValue(location.name)
    || stringValue(location.restaurant_name)
    || stringValue(location.activity_name)
    || String(location.id || "Location");
}

function isMissing(value: unknown) {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return !value.trim();
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length === 0;
  return false;
}

function hasPhoto(location: Record<string, unknown>) {
  return Boolean(
    stringValue(location.main_image)
      || stringValue(location.image_url)
      || (Array.isArray(location.images) && location.images.length > 0),
  );
}

function normalizedArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry || "").trim()).filter(Boolean).sort();
}

function valuesEqual(left: unknown, right: unknown) {
  if (Array.isArray(left) || Array.isArray(right)) {
    return JSON.stringify(normalizedArray(left)) === JSON.stringify(normalizedArray(right));
  }
  if (left && typeof left === "object" || right && typeof right === "object") {
    return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
  }
  return left === right;
}

function selectedGaps(run: RunRow) {
  return Array.isArray(run.settings?.gaps) ? run.settings?.gaps || [] : [];
}

function targetsGap(run: RunRow, gap: string) {
  if (run.mode === "full_refresh") return true;
  const gaps = selectedGaps(run);
  return gaps.length === 0 || gaps.includes(gap);
}

function usefulSuggestion(suggestion: unknown) {
  const value = record(suggestion);
  return Boolean(
    [
      ...(Array.isArray(value.foodTerms) ? value.foodTerms : []),
      ...(Array.isArray(value.cuisineTerms) ? value.cuisineTerms : []),
      ...(Array.isArray(value.categoryTerms) ? value.categoryTerms : []),
      ...(Array.isArray(value.featureTerms) ? value.featureTerms : []),
    ].length,
  );
}

async function event(runId: string, eventType: string, message: string, metadata: Record<string, unknown> = {}) {
  await supabaseAdmin.from("location_enrichment_run_events").insert({
    run_id: runId,
    event_type: eventType,
    message,
    metadata,
  });
}

async function saveGoogleSuggestion(suggestionRow: Record<string, unknown>) {
  const sourceTable = String(suggestionRow.source_table || "");
  const sourceId = String(suggestionRow.source_id || "");
  const status = String(suggestionRow.status || "");

  if (sourceTable && sourceId && ["pending_review", "auto_apply_ready"].includes(status)) {
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("location_google_food_term_suggestions")
      .select("id")
      .eq("source_table", sourceTable)
      .eq("source_id", sourceId)
      .eq("status", status)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingError) throw new Error(`Suggestion lookup failed: ${existingError.message}`);
    if (existing?.id) {
      const { data: updated, error: updateError } = await supabaseAdmin
        .from("location_google_food_term_suggestions")
        .update(suggestionRow)
        .eq("id", existing.id)
        .select("id")
        .single();
      if (updateError) throw new Error(`Suggestion refresh failed: ${updateError.message}`);
      return updated.id as string;
    }
  }

  const { data: inserted, error: suggestionError } = await supabaseAdmin
    .from("location_google_food_term_suggestions")
    .insert(suggestionRow)
    .select("id")
    .single();
  if (suggestionError) throw new Error(`Suggestion insert failed: ${suggestionError.message}`);
  return inserted.id as string;
}

async function finishRun(run: RunRow, status: "completed" | "budget_stopped") {
  const afterQuality = await getLocationDataQualitySummary(run.stale_days).catch(() => null);
  await supabaseAdmin
    .from("location_enrichment_runs")
    .update({
      status,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      after_quality: afterQuality || {},
    })
    .eq("id", run.id);
  await event(run.id, status, status === "completed" ? "Targeted location enrichment completed" : "Targeted location enrichment stopped at API budget");
}

async function findIdentityCollision(location: Record<string, unknown>, placeId: string) {
  const locationId = String(location.id || "");
  const canonical = await supabaseAdmin
    .from("locations")
    .select("id,name,source_table,source_id")
    .eq("google_place_id", placeId)
    .neq("id", locationId)
    .limit(1)
    .maybeSingle();
  if (canonical.error) throw new Error(`Canonical duplicate check failed: ${canonical.error.message}`);
  if (canonical.data) {
    return { kind: "canonical" as const, id: String(canonical.data.id), name: stringValue(canonical.data.name) };
  }

  for (const table of ["restaurants", "activities"] as const) {
    const source = table === "restaurants"
      ? await supabaseAdmin
        .from("restaurants")
        .select("id,name,restaurant_name")
        .eq("google_place_id", placeId)
        .limit(1)
        .maybeSingle()
      : await supabaseAdmin
        .from("activities")
        .select("id,name,activity_name")
        .eq("google_place_id", placeId)
        .limit(1)
        .maybeSingle();
    if (source.error) throw new Error(`${table} duplicate check failed: ${source.error.message}`);
    if (!source.data) continue;

    const sourceId = String(source.data.id);
    if (stringValue(location.source_table) === table && String(location.source_id || "") === sourceId) continue;

    const linked = await supabaseAdmin
      .from("locations")
      .select("id,name")
      .eq("source_table", table)
      .eq("source_id", sourceId)
      .neq("id", locationId)
      .limit(1)
      .maybeSingle();
    if (linked.error) throw new Error(`Source-link duplicate check failed: ${linked.error.message}`);

    const sourceRecord = source.data as Record<string, unknown>;
    return {
      kind: "source" as const,
      id: linked.data?.id ? String(linked.data.id) : sourceId,
      name: linked.data?.name
        ? String(linked.data.name)
        : stringValue(sourceRecord.name) || stringValue(sourceRecord.restaurant_name) || stringValue(sourceRecord.activity_name),
    };
  }

  return null;
}

function addUpdate(
  location: Record<string, unknown>,
  update: Record<string, unknown>,
  changedFields: Set<string>,
  field: string,
  nextValue: unknown,
  options: { onlyWhenMissing?: boolean } = {},
) {
  if (nextValue === undefined || nextValue === null || nextValue === "") return;
  if (options.onlyWhenMissing && !isMissing(location[field])) return;
  if (valuesEqual(location[field], nextValue)) return;
  update[field] = nextValue;
  changedFields.add(field);
}

function addFailureReason(target: Record<string, number>, reason: string) {
  target[reason] = (target[reason] || 0) + 1;
}

export async function processLocationEnrichmentRun(runId?: string) {
  let runQuery = supabaseAdmin
    .from("location_enrichment_runs")
    .select("*")
    .eq("status", "running");
  if (runId) runQuery = runQuery.eq("id", runId);
  runQuery = runQuery.order("created_at", { ascending: true }).limit(1);

  const { data: runData, error: runError } = await runQuery.maybeSingle();
  if (runError) throw new Error(`Run lookup failed: ${runError.message}`);
  if (!runData) return { success: true, processed: 0, message: "No running enrichment run." };
  const run = runData as RunRow;

  if (run.max_api_calls !== null && run.actual_api_calls >= run.max_api_calls) {
    await finishRun(run, "budget_stopped");
    return { success: true, processed: 0, status: "budget_stopped" };
  }

  const remainingBudget = run.max_api_calls === null
    ? Number.MAX_SAFE_INTEGER
    : Math.max(0, run.max_api_calls - run.actual_api_calls);
  if (remainingBudget === 0) {
    await finishRun(run, "budget_stopped");
    return { success: true, processed: 0, status: "budget_stopped" };
  }

  const claimLimit = Math.max(1, Math.min(run.batch_size || 25, 25, remainingBudget));
  const { data: claimed, error: claimError } = await supabaseAdmin.rpc("claim_location_enrichment_items", {
    p_run_id: run.id,
    p_limit: claimLimit,
  });
  if (claimError) throw new Error(`Run item claim failed: ${claimError.message}`);

  const items = (claimed || []) as ClaimedItem[];
  if (!items.length) {
    const { count } = await supabaseAdmin
      .from("location_enrichment_run_items")
      .select("id", { count: "exact", head: true })
      .eq("run_id", run.id)
      .in("status", ["pending", "processing"]);
    if (!count) await finishRun(run, "completed");
    return { success: true, processed: 0, status: count ? "running" : "completed" };
  }

  const batch = {
    processed: 0,
    matched: 0,
    enriched: 0,
    unchanged: 0,
    skipped: 0,
    review: 0,
    noMatch: 0,
    failed: 0,
    retried: 0,
    profilesQueued: 0,
    photosCached: 0,
    apiCalls: 0,
    failureReasons: {} as Record<string, number>,
    recentResults: [] as RecentResult[],
  };

  for (const item of items) {
    let displayName = item.location_id;
    try {
      const { data: locationData, error: locationError } = await supabaseAdmin
        .from("locations")
        .select("*")
        .eq("id", item.location_id)
        .maybeSingle();
      if (locationError || !locationData) throw new Error(locationError?.message || "Location not found");
      const location = record(locationData);
      displayName = locationName(location);

      const photoTarget = targetsGap(run, "missing_photos") && !hasPhoto(location);
      const reservedCalls = (location.google_place_id ? 1 : 2) + (photoTarget ? 2 : 0);
      if (run.max_api_calls !== null && run.actual_api_calls + batch.apiCalls + reservedCalls > run.max_api_calls) {
        await supabaseAdmin
          .from("location_enrichment_run_items")
          .update({ status: "pending", updated_at: new Date().toISOString() })
          .eq("id", item.id);
        continue;
      }
      batch.apiCalls += reservedCalls;

      const result = await enrichLocationFromGoogle(location);
      batch.processed += 1;

      if (result.status === "no_match" || !result.place) {
        batch.noMatch += 1;
        batch.skipped += 1;
        addFailureReason(batch.failureReasons, "no_google_match");
        const matchDiagnostics = buildGoogleNoMatchDiagnostics(result);
        await supabaseAdmin.from("locations").update({
          google_enrichment_status: "no_match",
          google_last_error: `No Google match above confidence threshold (${matchDiagnostics.confidence})`,
          google_enriched_at: new Date().toISOString(),
        }).eq("id", item.location_id);
        await supabaseAdmin.from("location_enrichment_run_items").update({
          status: "no_match",
          api_calls: reservedCalls,
          match_diagnostics: matchDiagnostics,
          last_error: "No Google match above the safe confidence threshold.",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", item.id);
        batch.recentResults.push({ locationId: item.location_id, name: displayName, status: "skipped", message: "No safe Google match found." });
        continue;
      }

      batch.matched += 1;
      const place = result.place;
      const existingPlaceId = stringValue(location.google_place_id);
      if (place.id && place.id !== existingPlaceId) {
        const collision = await findIdentityCollision(location, place.id);
        if (collision) {
          batch.skipped += 1;
          addFailureReason(batch.failureReasons, "duplicate_google_place_id");
          const message = `Skipped because Google Place ID is already linked to ${collision.name || collision.id}.`;
          await supabaseAdmin.from("location_enrichment_run_items").update({
            status: "skipped",
            api_calls: reservedCalls,
            last_error: message,
            match_diagnostics: { reason: "duplicate_google_place_id", collision },
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("id", item.id);
          batch.recentResults.push({ locationId: item.location_id, name: displayName, status: "skipped", message });
          continue;
        }
      }

      const suggestion = result.suggestion
        ? applySpecialtyFoodConfidence(place, result.suggestion)
        : null;
      const hasUsefulSuggestion = usefulSuggestion(suggestion);
      const suggestionStatus = hasUsefulSuggestion
        ? result.confidence >= 90 ? "auto_apply_ready" : "pending_review"
        : "no_useful_terms";

      const update: Record<string, unknown> = {};
      const changedFields = new Set<string>();

      addUpdate(location, update, changedFields, "google_place_id", place.id, { onlyWhenMissing: true });
      addUpdate(location, update, changedFields, "google_primary_type", place.primaryType || null);
      addUpdate(location, update, changedFields, "google_types", place.types || []);
      addUpdate(location, update, changedFields, "google_maps_uri", place.googleMapsUri || null);
      addUpdate(location, update, changedFields, "google_website_uri", place.websiteUri || null);
      addUpdate(location, update, changedFields, "google_rating", place.rating ?? null);
      addUpdate(location, update, changedFields, "google_user_rating_count", place.userRatingCount ?? null);

      if (targetsGap(run, "missing_website")) {
        addUpdate(location, update, changedFields, "website", place.websiteUri || null, { onlyWhenMissing: true });
      }
      if (targetsGap(run, "missing_phone")) {
        addUpdate(location, update, changedFields, "phone", place.nationalPhoneNumber || null, { onlyWhenMissing: true });
      }
      if (targetsGap(run, "missing_hours")) {
        addUpdate(location, update, changedFields, "operating_hours", place.currentOpeningHours || place.regularOpeningHours || null, { onlyWhenMissing: true });
      }
      if (targetsGap(run, "missing_coordinates")) {
        addUpdate(location, update, changedFields, "latitude", place.location?.latitude ?? null, { onlyWhenMissing: true });
        addUpdate(location, update, changedFields, "longitude", place.location?.longitude ?? null, { onlyWhenMissing: true });
      }
      if (targetsGap(run, "missing_reservation")) {
        const reservationUrl = extractReservationUrl(place as unknown as Record<string, unknown>);
        if (reservationUrl) {
          addUpdate(location, update, changedFields, "external_reservation_url", reservationUrl, { onlyWhenMissing: true });
          addUpdate(location, update, changedFields, "reservation_url", reservationUrl, { onlyWhenMissing: true });
          addUpdate(location, update, changedFields, "reservation_link", reservationUrl, { onlyWhenMissing: true });
          addUpdate(location, update, changedFields, "booking_url", reservationUrl, { onlyWhenMissing: true });
        }
      }

      if (photoTarget) {
        try {
          const photo = await cacheGooglePlacePhotoToStorage({
            id: item.location_id,
            name: stringValue(location.name),
            restaurant_name: stringValue(location.restaurant_name),
            activity_name: stringValue(location.activity_name),
            google_place_id: place.id,
          });
          addUpdate(location, update, changedFields, "main_image", photo.publicUrl, { onlyWhenMissing: true });
          addUpdate(location, update, changedFields, "image_url", photo.publicUrl, { onlyWhenMissing: true });
          batch.photosCached += 1;
        } catch (photoError) {
          addFailureReason(batch.failureReasons, "photo_cache_failed");
          batch.recentResults.push({ locationId: item.location_id, name: displayName, status: "review", message: `Metadata enriched, but photo cache failed: ${photoError instanceof Error ? photoError.message : String(photoError)}`.slice(0, 300) });
        }
      }

      const profileRelevantChanged = [...changedFields].some((field) => PROFILE_RELEVANT_FIELDS.has(field));
      update.google_enrichment_status = hasUsefulSuggestion ? "review_pending" : "enriched";
      update.google_enriched_at = new Date().toISOString();
      update.google_last_error = null;

      if (Object.keys(update).length) {
        const { error: updateError } = await supabaseAdmin.from("locations").update(update).eq("id", item.location_id);
        if (updateError) throw new Error(`Location update failed: ${updateError.message}`);
      }

      if (profileRelevantChanged) {
        await enqueueLocationSearchProfileRefresh(item.location_id, "google_enrichment_profile_fields_changed");
        batch.profilesQueued += 1;
      }

      let suggestionId: string | null = null;
      if (suggestion) {
        const suggestionRow = buildGoogleSuggestionRow("locations", location, place, result.confidence, suggestion, { ...result.evidence, runId: run.id, runItemId: item.id, reasons: item.reasons || [] }, suggestionStatus) as unknown as Record<string, unknown>;
        suggestionId = await saveGoogleSuggestion(suggestionRow);
      }

      if (hasUsefulSuggestion) batch.review += 1;
      const changed = changedFields.size > 0;
      if (changed) batch.enriched += 1;
      else batch.unchanged += 1;

      await supabaseAdmin.from("location_enrichment_run_items").update({
        status: hasUsefulSuggestion ? "review" : changed ? "completed" : "unchanged",
        api_calls: reservedCalls,
        suggestion_id: suggestionId,
        match_diagnostics: { changedFields: [...changedFields], profileQueued: profileRelevantChanged },
        last_error: null,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", item.id);

      if (!batch.recentResults.some((entry) => entry.locationId === item.location_id)) {
        batch.recentResults.push({
          locationId: item.location_id,
          name: displayName,
          status: hasUsefulSuggestion ? "review" : changed ? "enriched" : "unchanged",
          message: hasUsefulSuggestion
            ? `Google evidence saved for review${changed ? `; ${changedFields.size} metadata field(s) enriched.` : "."}`
            : changed
              ? `Enriched ${[...changedFields].join(", ")}.`
              : "Google data matched, but no selected missing fields needed changes.",
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retry = item.attempts < 3;
      if (retry) batch.retried += 1;
      else {
        batch.failed += 1;
        batch.processed += 1;
        addFailureReason(batch.failureReasons, "processing_error");
        batch.recentResults.push({ locationId: item.location_id, name: displayName, status: "failed", message: message.slice(0, 300) });
      }
      await supabaseAdmin.from("location_enrichment_run_items").update({
        status: retry ? "pending" : "failed",
        last_error: message.slice(0, 2000),
        completed_at: retry ? null : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", item.id);
    }
  }

  batch.recentResults = batch.recentResults.slice(-20);
  const now = new Date().toISOString();
  const nextActualCalls = run.actual_api_calls + batch.apiCalls;
  const lastCursor = items.at(-1)?.location_id || null;
  const { error: updateRunError } = await supabaseAdmin
    .from("location_enrichment_runs")
    .update({
      processed_records: run.processed_records + batch.processed,
      matched_records: run.matched_records + batch.matched,
      review_records: run.review_records + batch.review,
      no_match_records: run.no_match_records + batch.noMatch,
      failed_records: run.failed_records + batch.failed,
      enriched_records: (run.enriched_records || 0) + batch.enriched,
      unchanged_records: (run.unchanged_records || 0) + batch.unchanged,
      skipped_records: (run.skipped_records || 0) + batch.skipped,
      profiles_queued_records: (run.profiles_queued_records || 0) + batch.profilesQueued,
      photos_cached_records: (run.photos_cached_records || 0) + batch.photosCached,
      actual_api_calls: nextActualCalls,
      batches_completed: run.batches_completed + 1,
      cursor_location_id: lastCursor,
      last_batch: batch,
      last_error: null,
      updated_at: now,
    })
    .eq("id", run.id);
  if (updateRunError) throw new Error(`Run progress update failed: ${updateRunError.message}`);

  await event(run.id, "batch_completed", "Targeted location enrichment batch completed", { ...batch, cursorLocationId: lastCursor });

  const { count: remaining } = await supabaseAdmin
    .from("location_enrichment_run_items")
    .select("id", { count: "exact", head: true })
    .eq("run_id", run.id)
    .in("status", ["pending", "processing"]);

  if (!remaining) {
    await finishRun({ ...run, actual_api_calls: nextActualCalls }, "completed");
  } else if (run.max_api_calls !== null && nextActualCalls >= run.max_api_calls) {
    await finishRun({ ...run, actual_api_calls: nextActualCalls }, "budget_stopped");
  }

  return { success: true, runId: run.id, ...batch, remaining: remaining || 0, cursorLocationId: lastCursor };
}
