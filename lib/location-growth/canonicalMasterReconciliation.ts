/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";

import { buildPublishabilityUpdate, isActiveMarketState } from "@/lib/location-publishability";
import { isStorefrontTakeoutRestaurant, isWeakGenericRestaurant } from "@/lib/search/lowLevel";
import { supabaseAdmin } from "@/lib/supabase-admin";

const SOURCE = "canonical_master_reconciliation";

function text(value: unknown) {
  return String(value ?? "").trim();
}

function lower(value: unknown) {
  return text(value).toLowerCase();
}

function hasPhoto(row: any) {
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

function exactIdentity(master: any, duplicate: any) {
  if (text(master.google_place_id) && master.google_place_id === duplicate.google_place_id) return true;
  if (text(master.location_key) && master.location_key === duplicate.location_key) return true;
  return Boolean(
    text(master.normalized_name)
    && master.normalized_name === duplicate.normalized_name
    && text(master.normalized_address)
    && master.normalized_address === duplicate.normalized_address,
  );
}

function thresholdSatisfied(row: any) {
  const type = lower(row.location_type);
  const rating = Number(row.rating || 0);
  const reviews = Number(row.review_count || 0);
  if (type === "activity" || type === "nightlife") return rating >= 4.4 && reviews >= 100;
  if (type === "restaurant") return rating >= 4.4 && reviews >= 200;
  return false;
}

function blocker(master: any, evidence: any | null) {
  const businessStatus = text(master.google_business_status).toUpperCase();
  if (businessStatus === "CLOSED_PERMANENTLY") return "canonical_master_closed_permanently";
  if (businessStatus !== "OPERATIONAL") return "canonical_master_not_verified_operational";
  if (!isActiveMarketState(master.state)) return "canonical_master_outside_active_market";
  if (!evidence) return "canonical_master_missing_exact_enriched_evidence";
  if (!thresholdSatisfied(master)) return "canonical_master_below_quality_floor";
  if (lower(master.curation_tier) === "low_level" || isStorefrontTakeoutRestaurant(master) || isWeakGenericRestaurant(master)) {
    return "canonical_master_low_level_or_quick_service";
  }
  if (!hasPhoto(master) || !hasCompleteLocation(master)) return "canonical_master_incomplete_public_data";
  return "canonical_master_ready";
}

export async function reconcileCanonicalDuplicateMasters({
  limit = 100,
  dryRun = true,
}: {
  limit?: number;
  dryRun?: boolean;
} = {}) {
  const safeLimit = Math.min(500, Math.max(1, Math.trunc(Number(limit) || 100)));

  const { data: duplicateRows, error: duplicateError } = await supabaseAdmin
    .from("locations")
    .select("id,duplicate_of")
    .is("deleted_at", null)
    .eq("is_demo", false)
    .eq("duplicate_status", "duplicate")
    .not("duplicate_of", "is", null)
    .limit(2000);
  if (duplicateError) throw new Error(`Canonical master child lookup failed: ${duplicateError.message}`);

  const masterIds = Array.from(new Set((duplicateRows || []).map((row) => row.duplicate_of).filter(Boolean))).slice(0, safeLimit);
  if (!masterIds.length) {
    return { scanned: 0, recovered: 0, retained: 0, reasonCounts: {}, dryRun, googleApiCalls: 0, errors: [] };
  }

  const { data: masters, error: masterError } = await supabaseAdmin
    .from("locations")
    .select("*")
    .in("id", masterIds)
    .is("deleted_at", null)
    .eq("is_demo", false)
    .eq("is_searchable", false);
  if (masterError) throw new Error(`Canonical master lookup failed: ${masterError.message}`);

  const targetIds = (masters || []).map((row) => row.id);
  const { data: children, error: childError } = targetIds.length
    ? await supabaseAdmin
      .from("locations")
      .select("*")
      .in("duplicate_of", targetIds)
      .eq("duplicate_status", "duplicate")
      .is("deleted_at", null)
    : { data: [], error: null as any };
  if (childError) throw new Error(`Canonical master evidence lookup failed: ${childError.message}`);

  let recovered = 0;
  let retained = 0;
  const reasonCounts: Record<string, number> = {};
  const errors: string[] = [];

  for (const master of masters || []) {
    const exactEvidence = (children || [])
      .filter((child) => child.duplicate_of === master.id && exactIdentity(master, child))
      .sort((a, b) => {
        const aTrust = lower(a.source_quality_status) === "enriched" && lower(a.import_confidence) === "high" && lower(a.data_status) === "clean" ? 1 : 0;
        const bTrust = lower(b.source_quality_status) === "enriched" && lower(b.import_confidence) === "high" && lower(b.data_status) === "clean" ? 1 : 0;
        return bTrust - aTrust;
      })
      .find((child) => lower(child.source_quality_status) === "enriched" && lower(child.import_confidence) === "high" && lower(child.data_status) === "clean") || null;

    const reason = blocker(master, exactEvidence);
    reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;

    if (reason !== "canonical_master_ready") {
      retained += 1;
      if (!dryRun && !text(master.low_level_reason) && reason !== "canonical_master_closed_permanently") {
        const { error: labelError } = await supabaseAdmin.from("locations").update({
          low_level_reason: reason,
          low_level_source: SOURCE,
          low_level_detected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", master.id);
        if (labelError) errors.push(`${master.name || master.id}: ${labelError.message}`);
      }
      continue;
    }

    const normalized = {
      ...master,
      data_status: "clean",
      source_quality_status: "enriched",
      import_confidence: "high",
      public_visibility_tier: "standard",
      is_hidden: false,
      is_low_level: false,
      duplicate_status: lower(master.duplicate_status) === "possible_duplicate" ? "unique" : master.duplicate_status,
    };
    const { result, update } = buildPublishabilityUpdate(normalized, { allowApproval: true });
    if (!result.isSearchable) {
      retained += 1;
      reasonCounts.canonical_master_publishability_blocked = (reasonCounts.canonical_master_publishability_blocked || 0) + 1;
      continue;
    }

    recovered += 1;
    if (!dryRun) {
      const { error: updateError } = await supabaseAdmin.from("locations").update({
        ...update,
        data_status: "clean",
        source_quality_status: "enriched",
        import_confidence: "high",
        public_visibility_tier: "standard",
        is_hidden: false,
        is_low_level: false,
        low_level_reason: null,
        low_level_source: SOURCE,
        updated_at: new Date().toISOString(),
      }).eq("id", master.id);
      if (updateError) errors.push(`${master.name || master.id}: ${updateError.message}`);
    }
  }

  return {
    scanned: masters?.length || 0,
    recovered,
    retained,
    reasonCounts,
    dryRun,
    googleApiCalls: 0,
    errors,
  };
}
