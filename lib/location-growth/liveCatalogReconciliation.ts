/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";

import { buildPublishabilityUpdate, isActiveMarketState } from "@/lib/location-publishability";
import { isStorefrontTakeoutRestaurant, isWeakGenericRestaurant } from "@/lib/search/lowLevel";
import { supabaseAdmin } from "@/lib/supabase-admin";

const SOURCE = "canonical_live_reconciliation";

function text(value: unknown) {
  return String(value ?? "").trim();
}

function lower(value: unknown) {
  return text(value).toLowerCase();
}

function bounded(value: number | undefined, fallback: number, max = 1000) {
  const parsed = Number(value || fallback);
  return Math.min(max, Math.max(1, Math.trunc(Number.isFinite(parsed) ? parsed : fallback)));
}

function hasPublicPhoto(row: any) {
  return row.has_photos === true && lower(row.photo_status) !== "missing_photo" && Boolean(text(row.main_image) || (Array.isArray(row.images) && row.images.length));
}

function hasCompleteLocation(row: any) {
  return Boolean(text(row.address) && text(row.city) && text(row.state) && Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude)));
}

function importedUnverifiedReason(row: any) {
  const businessStatus = text(row.google_business_status).toUpperCase();
  if (businessStatus === "CLOSED_PERMANENTLY") return "google_closed_permanently";
  if (businessStatus === "CLOSED_TEMPORARILY") return "google_closed_temporarily";
  if (row.rating == null || row.review_count == null) return "legacy_missing_reputation";
  if (Number(row.rating) < 4.4 || Number(row.review_count) < 200) return "legacy_below_current_quality_floor";
  if (lower(row.curation_tier) === "low_level" || isStorefrontTakeoutRestaurant(row) || isWeakGenericRestaurant(row)) return "legacy_quick_service_or_low_level";
  if (lower(row.data_status) !== "clean" || !hasPublicPhoto(row) || !hasCompleteLocation(row)) return "legacy_incomplete_public_data";
  if (!isActiveMarketState(row.state)) return "outside_active_market";
  if (lower(row.duplicate_status) !== "unique") return "duplicate_review_required";
  if (businessStatus !== "OPERATIONAL") return "business_status_not_verified_operational";
  return "curated_manual_review";
}

function canRecoverImportedUnverified(row: any) {
  return text(row.google_business_status).toUpperCase() === "OPERATIONAL"
    && isActiveMarketState(row.state)
    && ["approved", "active", ""].includes(lower(row.status))
    && lower(row.location_type) === "restaurant"
    && lower(row.data_status) === "clean"
    && lower(row.duplicate_status) === "unique"
    && Number(row.rating) >= 4.4
    && Number(row.review_count) >= 200
    && hasPublicPhoto(row)
    && hasCompleteLocation(row)
    && lower(row.curation_tier) !== "low_level"
    && !isStorefrontTakeoutRestaurant(row)
    && !isWeakGenericRestaurant(row);
}

export async function reconcileImportedUnverified({ limit = 1000, dryRun = true }: { limit?: number; dryRun?: boolean } = {}) {
  const safeLimit = bounded(limit, 1000);
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("*")
    .is("deleted_at", null)
    .eq("is_demo", false)
    .eq("is_searchable", false)
    .eq("source_quality_status", "imported_unverified")
    .order("updated_at", { ascending: true })
    .limit(safeLimit);
  if (error) throw new Error(`Imported-unverified reconciliation select failed: ${error.message}`);

  const reasonCounts: Record<string, number> = {};
  let recovered = 0;
  let closedPermanently = 0;
  let closedTemporarily = 0;
  let retained = 0;
  const errors: string[] = [];

  for (const row of data || []) {
    const reason = importedUnverifiedReason(row);
    reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
    const businessStatus = text(row.google_business_status).toUpperCase();

    let update: Record<string, unknown>;
    if (businessStatus === "CLOSED_PERMANENTLY") {
      closedPermanently += 1;
      update = {
        status: "closed",
        is_searchable: false,
        is_hidden: true,
        public_visibility_tier: "hidden",
        quality_status: "suppressed",
        low_level_reason: reason,
        low_level_source: SOURCE,
        low_level_detected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    } else if (businessStatus === "CLOSED_TEMPORARILY") {
      closedTemporarily += 1;
      update = {
        is_searchable: false,
        is_hidden: true,
        public_visibility_tier: "hidden",
        quality_status: "needs_review",
        low_level_reason: reason,
        low_level_source: SOURCE,
        low_level_detected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    } else if (canRecoverImportedUnverified(row)) {
      const normalized = {
        ...row,
        source_quality_status: "enriched",
        import_confidence: "high",
        public_visibility_tier: "standard",
        is_hidden: false,
        is_low_level: false,
      };
      const { result, update: publishability } = buildPublishabilityUpdate(normalized, { allowApproval: true });
      if (result.isSearchable) {
        recovered += 1;
        update = {
          ...publishability,
          data_status: "clean",
          low_level_reason: null,
          low_level_source: SOURCE,
          updated_at: new Date().toISOString(),
        };
      } else {
        retained += 1;
        update = {
          is_searchable: false,
          low_level_reason: reason,
          low_level_source: SOURCE,
          low_level_detected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      }
    } else {
      retained += 1;
      update = {
        is_searchable: false,
        low_level_reason: reason,
        low_level_source: SOURCE,
        low_level_detected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }

    if (!dryRun) {
      const { error: updateError } = await supabaseAdmin.from("locations").update(update).eq("id", row.id);
      if (updateError) errors.push(`${row.name || row.id}: ${updateError.message}`);
    }
  }

  return { scanned: data?.length || 0, recovered, retained, closedPermanently, closedTemporarily, reasonCounts, dryRun, errors };
}

function sameVenueName(left: any, right: any) {
  const a = lower(left.normalized_name || left.name);
  const b = lower(right.normalized_name || right.name);
  return Boolean(a && b && a === b);
}

export async function resolveLiveDuplicateBacklog({ limit = 500, dryRun = true }: { limit?: number; dryRun?: boolean } = {}) {
  const safeLimit = bounded(limit, 500, 500);
  const { data: candidates, error } = await supabaseAdmin
    .from("locations")
    .select("id,name,normalized_name,duplicate_status,duplicate_score,duplicate_of,is_searchable,deleted_at")
    .is("deleted_at", null)
    .eq("is_demo", false)
    .in("duplicate_status", ["duplicate", "possible_duplicate"])
    .order("duplicate_status", { ascending: true })
    .limit(safeLimit);
  if (error) throw new Error(`Duplicate backlog select failed: ${error.message}`);

  const confirmed = (candidates || []).filter((row) => row.duplicate_status === "duplicate");
  const possible = (candidates || []).filter((row) => row.duplicate_status === "possible_duplicate");
  const confirmedIds = confirmed.map((row) => row.duplicate_of).filter(Boolean);
  const { data: masters, error: masterError } = confirmedIds.length
    ? await supabaseAdmin.from("locations").select("id,deleted_at,is_searchable").in("id", confirmedIds)
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
    ? await supabaseAdmin.from("locations").select("id,name,normalized_name,deleted_at,duplicate_status,is_searchable").in("id", pairIds)
    : { data: [], error: null as any };
  if (pairError) throw new Error(`Duplicate pair lookup failed: ${pairError.message}`);
  const locationMap = new Map((pairLocations || []).map((row) => [row.id, row]));

  let exactMerged = 0;
  let staleCleared = 0;
  let unresolved = 0;
  const processedPairs = new Set<string>();
  const errors: string[] = [];

  for (const row of possible) {
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
      const duplicateId = exact.location_a_id === exact.suggested_master_id ? exact.location_b_id : exact.location_a_id;
      const pairKey = [exact.suggested_master_id, duplicateId].sort().join(":");
      if (!processedPairs.has(pairKey)) {
        processedPairs.add(pairKey);
        exactMerged += 1;
        if (!dryRun) {
          const { error: mergeError } = await supabaseAdmin.rpc("oh_merge_live_location_duplicate", {
            p_master_id: exact.suggested_master_id,
            p_duplicate_id: duplicateId,
            p_reason: "canonical_exact_duplicate_reconciliation",
          });
          if (mergeError) errors.push(`${row.name || row.id}: ${mergeError.message}`);
        }
      }
      continue;
    }

    const pending = rowReviews.some((review) => review.status === "pending");
    const safelyStale = !pending && (rowReviews.length === 0 ? Number(row.duplicate_score || 0) <= 0 : rowReviews.every((review) => ["not_duplicate", "merged"].includes(review.status)));
    if (safelyStale) {
      staleCleared += 1;
      if (!dryRun) {
        const { error: clearError } = await supabaseAdmin.from("locations").update({
          duplicate_status: "unique",
          duplicate_of: null,
          duplicate_score: 0,
          last_deduped_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", row.id).eq("duplicate_status", "possible_duplicate");
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
    unresolved,
    dryRun,
    errors,
  };
}

export async function reconcilePublishReadyNonSearchable({ limit = 500, dryRun = true }: { limit?: number; dryRun?: boolean } = {}) {
  const safeLimit = bounded(limit, 500, 500);
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("*")
    .is("deleted_at", null)
    .eq("is_demo", false)
    .eq("is_searchable", false)
    .eq("quality_status", "publish_ready")
    .order("updated_at", { ascending: true })
    .limit(safeLimit);
  if (error) throw new Error(`Publish-ready reconciliation select failed: ${error.message}`);

  let restoredSearchable = 0;
  let duplicateBlocked = 0;
  let staleStatusCorrected = 0;
  const reasonCounts: Record<string, number> = {};
  const errors: string[] = [];

  for (const row of data || []) {
    const duplicateBlockedRow = ["duplicate", "possible_duplicate"].includes(lower(row.duplicate_status));
    if (duplicateBlockedRow) duplicateBlocked += 1;

    const staleHidden = row.is_hidden === true
      && lower(row.public_visibility_tier) === "standard"
      && lower(row.source_quality_status) === "enriched"
      && lower(row.data_status) === "clean"
      && !text(row.low_level_reason)
      && !duplicateBlockedRow
      && isActiveMarketState(row.state);

    const input = staleHidden ? { ...row, is_hidden: false } : row;
    const { result, update } = buildPublishabilityUpdate(input, { allowApproval: true });
    const reasons = result.reasons.length ? result.reasons : ["stale_searchable_flag"];
    for (const reason of reasons) reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;

    if (result.isSearchable) restoredSearchable += 1;
    else staleStatusCorrected += 1;

    if (!dryRun) {
      const { error: updateError } = await supabaseAdmin.from("locations").update({
        ...update,
        data_status: result.isSearchable ? "clean" : row.data_status,
        updated_at: new Date().toISOString(),
      }).eq("id", row.id);
      if (updateError) errors.push(`${row.name || row.id}: ${updateError.message}`);
    }
  }

  return { scanned: data?.length || 0, restoredSearchable, duplicateBlocked, staleStatusCorrected, reasonCounts, dryRun, errors };
}
