import "server-only";

import {
  buildGoogleSuggestionRow,
  enrichLocationFromGoogle,
} from "@/lib/google/places";
import { applySpecialtyFoodConfidence } from "@/lib/google/specialty-food-confidence";
import { getLocationDataQualitySummary } from "@/lib/location-data-quality/summary";
import { supabaseAdmin } from "@/lib/supabase-admin";

type RunRow = {
  id: string;
  status: string;
  batch_size: number;
  max_api_calls: number | null;
  actual_api_calls: number;
  processed_records: number;
  matched_records: number;
  review_records: number;
  no_match_records: number;
  failed_records: number;
  batches_completed: number;
  stale_days: number;
};

type ClaimedItem = {
  id: string;
  run_id: string;
  location_id: string;
  attempts: number;
  reasons: string[] | null;
};

function usefulSuggestion(suggestion: any) {
  return Boolean(
    suggestion &&
      [
        ...(suggestion.foodTerms || []),
        ...(suggestion.cuisineTerms || []),
        ...(suggestion.categoryTerms || []),
        ...(suggestion.featureTerms || []),
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
  await event(run.id, status, status === "completed" ? "Catalog enrichment run completed" : "Catalog enrichment stopped at API budget");
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

  const claimLimit = Math.max(1, Math.min(run.batch_size || 5, 25, remainingBudget));
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
    review: 0,
    noMatch: 0,
    failed: 0,
    retried: 0,
    apiCalls: 0,
  };

  for (const item of items) {
    try {
      const { data: location, error: locationError } = await supabaseAdmin
        .from("locations")
        .select("*")
        .eq("id", item.location_id)
        .maybeSingle();
      if (locationError || !location) throw new Error(locationError?.message || "Location not found");

      // Reserve conservatively before making a request. A row with no Place ID can
      // require Text Search + Place Details (2 calls); a matched row needs Details (1).
      // This can under-spend the budget on no-match rows, but it cannot over-spend it.
      const reservedCalls = location.google_place_id ? 1 : 2;
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
        await supabaseAdmin.from("locations").update({
          google_enrichment_status: "no_match",
          google_last_error: "No Google match above confidence threshold",
          google_enriched_at: new Date().toISOString(),
        }).eq("id", item.location_id);
        await supabaseAdmin.from("location_enrichment_run_items").update({
          status: "no_match",
          api_calls: reservedCalls,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", item.id);
        continue;
      }

      batch.matched += 1;
      const place = result.place;
      const suggestion = result.suggestion
        ? applySpecialtyFoodConfidence(place, result.suggestion)
        : null;
      const hasUsefulSuggestion = usefulSuggestion(suggestion);
      const suggestionStatus = hasUsefulSuggestion
        ? result.confidence >= 90 ? "auto_apply_ready" : "pending_review"
        : "no_useful_terms";

      await supabaseAdmin.from("locations").update({
        google_place_id: place.id,
        google_enrichment_status: hasUsefulSuggestion ? "review_pending" : "enriched",
        google_enriched_at: new Date().toISOString(),
        google_primary_type: place.primaryType || null,
        google_types: place.types || [],
        google_maps_uri: place.googleMapsUri || null,
        google_website_uri: place.websiteUri || null,
        google_rating: place.rating ?? null,
        google_user_rating_count: place.userRatingCount ?? null,
        google_last_error: null,
      }).eq("id", item.location_id);

      let suggestionId: string | null = null;
      if (suggestion) {
        const suggestionRow = buildGoogleSuggestionRow(
          "locations",
          location,
          place,
          result.confidence,
          suggestion,
          { ...result.evidence, runId: run.id, runItemId: item.id, reasons: item.reasons || [] },
          suggestionStatus,
        );
        const { data: inserted, error: suggestionError } = await supabaseAdmin
          .from("location_google_food_term_suggestions")
          .insert(suggestionRow)
          .select("id")
          .single();
        if (suggestionError) throw new Error(`Suggestion insert failed: ${suggestionError.message}`);
        suggestionId = inserted.id;
      }

      if (hasUsefulSuggestion) batch.review += 1;
      await supabaseAdmin.from("location_enrichment_run_items").update({
        status: hasUsefulSuggestion ? "review" : "completed",
        api_calls: reservedCalls,
        suggestion_id: suggestionId,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", item.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retry = item.attempts < 3;
      if (retry) batch.retried += 1;
      else {
        batch.failed += 1;
        batch.processed += 1;
      }
      await supabaseAdmin.from("location_enrichment_run_items").update({
        status: retry ? "pending" : "failed",
        last_error: message.slice(0, 2000),
        completed_at: retry ? null : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", item.id);
    }
  }

  const now = new Date().toISOString();
  const nextActualCalls = run.actual_api_calls + batch.apiCalls;
  const { error: updateRunError } = await supabaseAdmin
    .from("location_enrichment_runs")
    .update({
      processed_records: run.processed_records + batch.processed,
      matched_records: run.matched_records + batch.matched,
      review_records: run.review_records + batch.review,
      no_match_records: run.no_match_records + batch.noMatch,
      failed_records: run.failed_records + batch.failed,
      actual_api_calls: nextActualCalls,
      batches_completed: run.batches_completed + 1,
      last_batch: batch,
      last_error: null,
      updated_at: now,
    })
    .eq("id", run.id);
  if (updateRunError) throw new Error(`Run progress update failed: ${updateRunError.message}`);

  await event(run.id, "batch_completed", "Catalog enrichment batch completed", batch);

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

  return { success: true, runId: run.id, ...batch, remaining: remaining || 0 };
}
