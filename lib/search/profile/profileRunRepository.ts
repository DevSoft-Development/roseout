import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

type CreateProfileRunInput = {
  mode: string;
  filters: Record<string, unknown>;
  configuration: Record<string, unknown>;
  requestedBy: string;
  locationIds?: readonly string[];
};

const MAX_TARGETS = 10_000;
const INSERT_BATCH_SIZE = 500;

export async function createProfileRun(input: CreateProfileRunInput) {
  const created = await supabaseAdmin
    .from("location_search_profile_runs")
    .insert({
      mode: input.mode,
      filters: input.filters,
      configuration: input.configuration,
      requested_by: input.requestedBy || null,
    })
    .select("*")
    .single();

  if (created.error) {
    throw new Error(`Unable to create profile run: ${created.error.message}`);
  }

  let ids = [...new Set(input.locationIds ?? [])];

  if (ids.length === 0) {
    const targets = await supabaseAdmin
      .from("locations")
      .select("id")
      .eq("active", true)
      .eq("is_searchable", true)
      .eq("is_hidden", false)
      .eq("is_low_level", false)
      .order("id", { ascending: true })
      .limit(MAX_TARGETS);

    if (targets.error) {
      await supabaseAdmin
        .from("location_search_profile_runs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", created.data.id);
      throw new Error(`Unable to resolve eligible locations: ${targets.error.message}`);
    }

    ids = (targets.data ?? []).map((row) => row.id);
  }

  try {
    for (let start = 0; start < ids.length; start += INSERT_BATCH_SIZE) {
      const inserted = await supabaseAdmin
        .from("location_search_profile_run_items")
        .insert(
          ids.slice(start, start + INSERT_BATCH_SIZE).map((locationId) => ({
            run_id: created.data.id,
            location_id: locationId,
            status: "pending",
          })),
        );

      if (inserted.error) {
        throw new Error(inserted.error.message);
      }
    }

    const now = new Date().toISOString();
    const updated = await supabaseAdmin
      .from("location_search_profile_runs")
      .update({
        target_count: ids.length,
        status: ids.length > 0 ? "running" : "completed",
        started_at: ids.length > 0 ? now : null,
        completed_at: ids.length > 0 ? null : now,
        updated_at: now,
      })
      .eq("id", created.data.id)
      .select("*")
      .single();

    if (updated.error) {
      throw new Error(updated.error.message);
    }

    return updated.data;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Profile run initialization failed";
    await supabaseAdmin
      .from("location_search_profile_runs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        configuration: {
          ...input.configuration,
          initializationError: message,
        },
      })
      .eq("id", created.data.id);
    throw new Error(`Unable to initialize profile run: ${message}`);
  }
}

export async function requestRunCancellation(runId: string) {
  const now = new Date().toISOString();
  const result = await supabaseAdmin
    .from("location_search_profile_runs")
    .update({
      status: "cancelling",
      cancellation_requested_at: now,
      updated_at: now,
    })
    .eq("id", runId)
    .select("*")
    .single();

  if (result.error) throw new Error(result.error.message);
  return result.data;
}

export async function resumeProfileRun(runId: string, retryFailed = false) {
  const now = new Date().toISOString();
  let items = supabaseAdmin
    .from("location_search_profile_run_items")
    .update({
      status: "pending",
      available_at: now,
      lease_owner: null,
      lease_expires_at: null,
      updated_at: now,
    })
    .eq("run_id", runId);

  items = retryFailed
    ? items.eq("status", "failed")
    : items.in("status", ["failed", "cancelled"]);

  const updatedItems = await items;
  if (updatedItems.error) throw new Error(updatedItems.error.message);

  const run = await supabaseAdmin
    .from("location_search_profile_runs")
    .update({
      status: "running",
      cancellation_requested_at: null,
      completed_at: null,
      updated_at: now,
    })
    .eq("id", runId)
    .select("*")
    .single();

  if (run.error) throw new Error(run.error.message);
  return run.data;
}
