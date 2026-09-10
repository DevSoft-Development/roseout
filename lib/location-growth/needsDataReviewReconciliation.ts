/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";

import { buildPublishabilityUpdate, isActiveMarketState } from "@/lib/location-publishability";
import { isStorefrontTakeoutRestaurant, isWeakGenericRestaurant } from "@/lib/search/lowLevel";
import { supabaseAdmin } from "@/lib/supabase-admin";

const SOURCE = "canonical_needs_data_review_reconciliation";

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

function hasPublicPhoto(row: any) {
  return row.has_photos === true
    && lower(row.photo_status) !== "missing_photo"
    && Boolean(text(row.main_image) || (Array.isArray(row.images) && row.images.length));
}

function hasCompleteLocation(row: any) {
  return Boolean(
    text(row.address)
    && text(row.city)
    && text(row.state)
    && Number.isFinite(Number(row.latitude))
    && Number.isFinite(Number(row.longitude)),
  );
}

function meetsCurrentNumericFloor(row: any) {
  if (lower(row.location_type) === "restaurant") {
    return Number(row.rating) >= 4.4 && Number(row.review_count) >= 200;
  }
  if (lower(row.location_type) === "activity") {
    return Number(row.rating) >= 4.4 && Number(row.review_count) >= 100;
  }
  return false;
}

function reviewReason(row: any) {
  const businessStatus = text(row.google_business_status).toUpperCase();
  if (businessStatus !== "OPERATIONAL") return "business_status_not_operational";
  if (!isActiveMarketState(row.state)) return "outside_active_market";
  if (lower(row.duplicate_status) !== "unique") return "duplicate_identity_not_confirmed_unique";
  if (lower(row.source_quality_status) !== "enriched" || lower(row.import_confidence) !== "high") return "stored_evidence_not_high_confidence";
  if (!hasCompleteLocation(row)) return "incomplete_location";
  if (!hasPublicPhoto(row)) return "missing_public_photo";
  if (row.rating == null || row.review_count == null) return "missing_reputation";
  if (!meetsCurrentNumericFloor(row)) return "below_current_quality_floor";
  if (lower(row.curation_tier) === "low_level" || isStorefrontTakeoutRestaurant(row) || isWeakGenericRestaurant(row)) return "quick_service_or_low_level";
  if (lower(row.public_visibility_tier) !== "standard" || row.is_hidden === true || row.is_low_level === true) return "visibility_review_required";
  return "canonical_publishability_review";
}

function canRecover(row: any) {
  return text(row.google_business_status).toUpperCase() === "OPERATIONAL"
    && isActiveMarketState(row.state)
    && ["approved", "active", ""].includes(lower(row.status))
    && ["restaurant", "activity"].includes(lower(row.location_type))
    && lower(row.duplicate_status) === "unique"
    && lower(row.source_quality_status) === "enriched"
    && lower(row.import_confidence) === "high"
    && lower(row.public_visibility_tier) === "standard"
    && row.is_hidden !== true
    && row.is_low_level !== true
    && hasCompleteLocation(row)
    && hasPublicPhoto(row)
    && meetsCurrentNumericFloor(row)
    && lower(row.curation_tier) !== "low_level"
    && !isStorefrontTakeoutRestaurant(row)
    && !isWeakGenericRestaurant(row);
}

export async function reconcileNeedsDataReview({ limit = 500, dryRun = true }: { limit?: number; dryRun?: boolean } = {}) {
  const safeLimit = bounded(limit, 500);
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("*")
    .is("deleted_at", null)
    .eq("is_demo", false)
    .eq("is_searchable", false)
    .eq("data_status", "needs_review")
    .in("quality_status", ["needs_review", "review"])
    .neq("source_quality_status", "imported_unverified")
    .not("duplicate_status", "in", "(duplicate,possible_duplicate)")
    .not("google_business_status", "in", "(CLOSED_PERMANENTLY,CLOSED_TEMPORARILY)")
    .order("updated_at", { ascending: true })
    .limit(safeLimit);
  if (error) throw new Error(`Needs-data-review reconciliation select failed: ${error.message}`);

  let recovered = 0;
  let retained = 0;
  const reasonCounts: Record<string, number> = {};
  const errors: string[] = [];

  for (const row of data || []) {
    const reason = reviewReason(row);
    reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;

    if (!canRecover(row)) {
      retained += 1;
      if (!dryRun) {
        const { error: updateError } = await supabaseAdmin.from("locations").update({
          low_level_reason: reason,
          low_level_source: SOURCE,
          low_level_detected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", row.id).eq("is_searchable", false);
        if (updateError) errors.push(`${row.name || row.id}: ${updateError.message}`);
      }
      continue;
    }

    const normalized = {
      ...row,
      data_status: "clean",
      quality_status: "needs_review",
      source_quality_status: "enriched",
      import_confidence: "high",
      public_visibility_tier: "standard",
      is_hidden: false,
      is_low_level: false,
    };
    const { result, update } = buildPublishabilityUpdate(normalized, { allowApproval: true });

    if (!result.isSearchable) {
      retained += 1;
      const canonicalReason = result.reasons.length ? `canonical:${result.reasons.join("|")}` : reason;
      reasonCounts[canonicalReason] = (reasonCounts[canonicalReason] || 0) + 1;
      if (!dryRun) {
        const { error: updateError } = await supabaseAdmin.from("locations").update({
          low_level_reason: canonicalReason,
          low_level_source: SOURCE,
          low_level_detected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", row.id).eq("is_searchable", false);
        if (updateError) errors.push(`${row.name || row.id}: ${updateError.message}`);
      }
      continue;
    }

    recovered += 1;
    if (!dryRun) {
      const { error: updateError } = await supabaseAdmin.from("locations").update({
        ...update,
        data_status: "clean",
        low_level_reason: null,
        low_level_source: SOURCE,
        updated_at: new Date().toISOString(),
      }).eq("id", row.id).eq("is_searchable", false).eq("duplicate_status", "unique");
      if (updateError) errors.push(`${row.name || row.id}: ${updateError.message}`);
    }
  }

  return {
    scanned: data?.length || 0,
    recovered,
    retained,
    reasonCounts,
    googleApiCalls: 0,
    dryRun,
    errors,
  };
}
