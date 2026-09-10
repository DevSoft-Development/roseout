/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

const SOURCE = "canonical_duplicate_identity_reconciliation";

function text(value: unknown) {
  return String(value ?? "").trim();
}

function lower(value: unknown) {
  return text(value).toLowerCase();
}

function bounded(value: number | undefined, fallback: number, max = 500) {
  const parsed = Number(value || fallback);
  return Math.min(max, Math.max(1, Math.trunc(Number.isFinite(parsed) ? parsed : fallback)));
}

function sameNormalizedAddress(left: any, right: any) {
  const a = lower(left.normalized_address || left.address);
  const b = lower(right.normalized_address || right.address);
  return Boolean(a && b && a === b);
}

function sameCityState(left: any, right: any) {
  return Boolean(
    text(left.city)
    && text(left.state)
    && lower(left.city) === lower(right.city)
    && lower(left.state) === lower(right.state),
  );
}

export async function reconcileUnknownDuplicateIdentity({
  limit = 500,
  dryRun = true,
}: {
  limit?: number;
  dryRun?: boolean;
} = {}) {
  const safeLimit = bounded(limit, 500);
  const { data: candidates, error } = await supabaseAdmin
    .from("locations")
    .select("*")
    .is("deleted_at", null)
    .eq("is_demo", false)
    .eq("is_searchable", false)
    .eq("duplicate_status", "unknown")
    .eq("low_level_reason", "duplicate_identity_not_confirmed_unique")
    .order("updated_at", { ascending: true })
    .limit(safeLimit);
  if (error) throw new Error(`Duplicate identity reconciliation select failed: ${error.message}`);

  let uniqueResolved = 0;
  let exactDuplicates = 0;
  let retained = 0;
  const reasonCounts: Record<string, number> = {};
  const errors: string[] = [];

  for (const row of candidates || []) {
    const placeId = text(row.google_place_id);
    if (!placeId) {
      retained += 1;
      reasonCounts.missing_google_place_id = (reasonCounts.missing_google_place_id || 0) + 1;
      continue;
    }

    const { data: placeCollisions, error: placeError } = await supabaseAdmin
      .from("locations")
      .select("id,name,duplicate_status,duplicate_of,is_searchable,deleted_at")
      .eq("google_place_id", placeId)
      .neq("id", row.id)
      .is("deleted_at", null)
      .limit(3);
    if (placeError) {
      errors.push(`${row.name || row.id}: ${placeError.message}`);
      continue;
    }

    if ((placeCollisions || []).length === 1) {
      const master = placeCollisions![0];
      exactDuplicates += 1;
      reasonCounts.exact_duplicate_google_place_id = (reasonCounts.exact_duplicate_google_place_id || 0) + 1;
      if (!dryRun) {
        const now = new Date().toISOString();
        const { error: childError } = await supabaseAdmin.from("locations").update({
          duplicate_status: "duplicate",
          duplicate_of: master.id,
          duplicate_score: 100,
          is_searchable: false,
          low_level_reason: "exact_duplicate_google_place_id",
          low_level_source: SOURCE,
          low_level_detected_at: now,
          last_deduped_at: now,
          updated_at: now,
        }).eq("id", row.id).eq("duplicate_status", "unknown");
        if (childError) errors.push(`${row.name || row.id}: ${childError.message}`);

        if (["unknown", "possible_duplicate"].includes(lower(master.duplicate_status))) {
          const { error: masterError } = await supabaseAdmin.from("locations").update({
            duplicate_status: "unique",
            duplicate_of: null,
            duplicate_score: 0,
            last_deduped_at: now,
            updated_at: now,
          }).eq("id", master.id);
          if (masterError) errors.push(`${master.name || master.id}: ${masterError.message}`);
        }
      }
      continue;
    }

    if ((placeCollisions || []).length > 1) {
      retained += 1;
      reasonCounts.multiple_google_place_id_collisions = (reasonCounts.multiple_google_place_id_collisions || 0) + 1;
      continue;
    }

    const normalizedName = text(row.normalized_name);
    if (!normalizedName) {
      retained += 1;
      reasonCounts.missing_normalized_name = (reasonCounts.missing_normalized_name || 0) + 1;
      continue;
    }

    const { data: sameNames, error: nameError } = await supabaseAdmin
      .from("locations")
      .select("id,name,address,normalized_address,city,state,google_place_id,duplicate_status,deleted_at")
      .eq("normalized_name", normalizedName)
      .neq("id", row.id)
      .is("deleted_at", null)
      .limit(10);
    if (nameError) {
      errors.push(`${row.name || row.id}: ${nameError.message}`);
      continue;
    }

    const identityConflict = (sameNames || []).some((other) => sameNormalizedAddress(row, other) || sameCityState(row, other));
    if (identityConflict) {
      retained += 1;
      reasonCounts.same_name_identity_review = (reasonCounts.same_name_identity_review || 0) + 1;
      if (!dryRun) {
        const { error: labelError } = await supabaseAdmin.from("locations").update({
          low_level_reason: "same_name_identity_review",
          low_level_source: SOURCE,
          low_level_detected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", row.id).eq("duplicate_status", "unknown");
        if (labelError) errors.push(`${row.name || row.id}: ${labelError.message}`);
      }
      continue;
    }

    uniqueResolved += 1;
    reasonCounts.identity_confirmed_unique = (reasonCounts.identity_confirmed_unique || 0) + 1;
    if (!dryRun) {
      const now = new Date().toISOString();
      const { error: updateError } = await supabaseAdmin.from("locations").update({
        duplicate_status: "unique",
        duplicate_of: null,
        duplicate_score: 0,
        low_level_reason: null,
        low_level_source: SOURCE,
        last_deduped_at: now,
        updated_at: now,
      }).eq("id", row.id).eq("duplicate_status", "unknown");
      if (updateError) errors.push(`${row.name || row.id}: ${updateError.message}`);
    }
  }

  return {
    scanned: candidates?.length || 0,
    uniqueResolved,
    exactDuplicates,
    retained,
    reasonCounts,
    googleApiCalls: 0,
    dryRun,
    errors,
  };
}
