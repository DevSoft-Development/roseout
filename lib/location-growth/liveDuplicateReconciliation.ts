/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

function lower(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function bounded(value: number | undefined) {
  const parsed = Number(value || 500);
  return Math.min(500, Math.max(1, Math.trunc(Number.isFinite(parsed) ? parsed : 500)));
}

function sameVenueName(left: any, right: any) {
  const a = lower(left.normalized_name || left.name);
  const b = lower(right.normalized_name || right.name);
  return Boolean(a && b && a === b);
}

async function masterHasOtherPendingReview(masterId: string, excludedReviewId: string) {
  const { count, error } = await supabaseAdmin
    .from("location_duplicate_review")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .or(`location_a_id.eq.${masterId},location_b_id.eq.${masterId}`)
    .neq("id", excludedReviewId);
  if (error) throw new Error(`Duplicate master pending-review check failed: ${error.message}`);
  return Number(count || 0) > 0;
}

export async function resolveLiveDuplicateBacklog({
  limit = 500,
  dryRun = true,
}: {
  limit?: number;
  dryRun?: boolean;
} = {}) {
  const safeLimit = bounded(limit);
  const { data: candidates, error } = await supabaseAdmin
    .from("locations")
    .select("id,name,normalized_name,duplicate_status,duplicate_score,duplicate_of,is_searchable,deleted_at")
    .is("deleted_at", null)
    .eq("is_demo", false)
    .eq("is_searchable", false)
    .in("duplicate_status", ["duplicate", "possible_duplicate"])
    .order("duplicate_status", { ascending: true })
    .limit(safeLimit);
  if (error) throw new Error(`Duplicate backlog select failed: ${error.message}`);

  const confirmed = (candidates || []).filter((row) => row.duplicate_status === "duplicate");
  const possible = (candidates || []).filter((row) => row.duplicate_status === "possible_duplicate");

  const confirmedMasterIds = confirmed.map((row) => row.duplicate_of).filter(Boolean);
  const { data: masters, error: masterError } = confirmedMasterIds.length
    ? await supabaseAdmin.from("locations").select("id,deleted_at,is_searchable").in("id", confirmedMasterIds)
    : { data: [], error: null as any };
  if (masterError) throw new Error(`Duplicate master validation failed: ${masterError.message}`);
  const masterMap = new Map((masters || []).map((row) => [row.id, row]));
  const validConfirmed = confirmed.filter((row) => row.duplicate_of && masterMap.has(row.duplicate_of));

  const possibleIds = possible.map((row) => row.id);
  const { data: reviews, error: reviewError } = possibleIds.length
    ? await supabaseAdmin
      .from("location_duplicate_review")
      .select("id,location_a_id,location_b_id,suggested_master_id,duplicate_score,match_reasons,status")
      .or(possibleIds.map((id) => `location_a_id.eq.${id},location_b_id.eq.${id}`).join(","))
    : { data: [], error: null as any };
  if (reviewError) throw new Error(`Duplicate review lookup failed: ${reviewError.message}`);

  const pairIds = Array.from(new Set((reviews || []).flatMap((review) => [review.location_a_id, review.location_b_id]).filter(Boolean)));
  const { data: pairLocations, error: pairError } = pairIds.length
    ? await supabaseAdmin
      .from("locations")
      .select("id,name,normalized_name,deleted_at,duplicate_status,is_searchable")
      .in("id", pairIds)
    : { data: [], error: null as any };
  if (pairError) throw new Error(`Duplicate pair lookup failed: ${pairError.message}`);
  const locationMap = new Map((pairLocations || []).map((row) => [row.id, row]));

  let exactMerged = 0;
  let staleCleared = 0;
  let mastersCleared = 0;
  let unresolved = 0;
  const processedPairs = new Set<string>();
  const processedRows = new Set<string>();
  const errors: string[] = [];

  for (const row of possible) {
    if (processedRows.has(row.id)) continue;
    const rowReviews = (reviews || []).filter((review) => review.location_a_id === row.id || review.location_b_id === row.id);
    const exact = rowReviews.find((review) => {
      if (review.status !== "pending" || Number(review.duplicate_score) < 100 || !review.suggested_master_id) return false;
      const reasons = Array.isArray(review.match_reasons) ? review.match_reasons : [];
      if (!reasons.some((reason: string) => ["same_google_place_id", "same_location_key", "same_normalized_name_address"].includes(reason))) return false;
      const left = locationMap.get(review.location_a_id);
      const right = locationMap.get(review.location_b_id);
      return left && right && !left.deleted_at && !right.deleted_at && sameVenueName(left, right);
    });

    if (exact) {
      const masterId = exact.suggested_master_id as string;
      const duplicateId = exact.location_a_id === masterId ? exact.location_b_id : exact.location_a_id;
      const pairKey = [masterId, duplicateId].sort().join(":");
      if (!processedPairs.has(pairKey)) {
        processedPairs.add(pairKey);
        processedRows.add(duplicateId);
        exactMerged += 1;

        const hasOtherPending = await masterHasOtherPendingReview(masterId, exact.id);
        if (!hasOtherPending) mastersCleared += 1;

        if (!dryRun) {
          const { error: mergeError } = await supabaseAdmin.rpc("oh_merge_live_location_duplicate", {
            p_master_id: masterId,
            p_duplicate_id: duplicateId,
            p_reason: "canonical_exact_duplicate_reconciliation",
          });
          if (mergeError) {
            errors.push(`${row.name || row.id}: ${mergeError.message}`);
          } else if (!hasOtherPending) {
            const { error: masterClearError } = await supabaseAdmin
              .from("locations")
              .update({
                duplicate_status: "unique",
                duplicate_of: null,
                duplicate_score: 0,
                last_deduped_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq("id", masterId)
              .eq("duplicate_status", "possible_duplicate");
            if (masterClearError) errors.push(`master ${masterId}: ${masterClearError.message}`);
          }
        }
      }
      continue;
    }

    const pending = rowReviews.some((review) => review.status === "pending");
    const safelyStale = !pending && (
      rowReviews.length === 0
        ? Number(row.duplicate_score || 0) <= 0
        : rowReviews.every((review) => ["not_duplicate", "merged"].includes(review.status))
    );

    if (safelyStale) {
      staleCleared += 1;
      if (!dryRun) {
        const { error: clearError } = await supabaseAdmin
          .from("locations")
          .update({
            duplicate_status: "unique",
            duplicate_of: null,
            duplicate_score: 0,
            last_deduped_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id)
          .eq("duplicate_status", "possible_duplicate");
        if (clearError) errors.push(`${row.name || row.id}: ${clearError.message}`);
      }
    } else {
      unresolved += 1;
    }
  }

  return {
    scanned: candidates?.length || 0,
    confirmedWithValidMaster: validConfirmed.length,
    confirmedBrokenMaster: confirmed.length - validConfirmed.length,
    possible: possible.length,
    exactMerged,
    staleCleared,
    mastersCleared,
    unresolved,
    dryRun,
    errors,
  };
}
