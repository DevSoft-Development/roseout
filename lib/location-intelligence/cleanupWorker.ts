import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { refreshLocationSearchProfile } from "@/lib/search/profile/profileRepository";
import {
  routeUniqueCandidateToReview,
  verifyConservativeUnique,
} from "@/lib/location-intelligence/dedupeClassifier";

const DEFAULT_BATCH_LIMIT = 10;
const MAX_BATCH_LIMIT = 10;
const PRE_PUBLISH_SUPPRESSED_REVIEW_REASON = "hidden_inactive_eligibility_conflict";

const candidateProjection = [
  "id",
  "name",
  "restaurant_name",
  "activity_name",
  "address",
  "formatted_address",
  "latitude",
  "longitude",
  "google_place_id",
  "location_key",
  "normalized_name",
  "normalized_address",
  "normalized_phone",
  "quality_status",
  "publish_ready",
  "is_searchable",
  "is_hidden",
  "active",
  "deleted_at",
  "is_demo",
  "training_only",
  "is_low_level",
  "duplicate_status",
  "duplicate_of",
  "is_claimed",
  "claimed",
  "owner_user_id",
  "claim_status",
].join(",");

type CleanupCandidate = {
  id: string;
  name?: string | null;
  restaurant_name?: string | null;
  activity_name?: string | null;
  address?: string | null;
  formatted_address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  google_place_id?: string | null;
  location_key?: string | null;
  normalized_name?: string | null;
  normalized_address?: string | null;
  normalized_phone?: string | null;
  quality_status?: string | null;
  publish_ready?: boolean | null;
  is_searchable?: boolean | null;
  is_hidden?: boolean | null;
  active?: boolean | null;
  deleted_at?: string | null;
  is_demo?: boolean | null;
  training_only?: boolean | null;
  is_low_level?: boolean | null;
  duplicate_status?: string | null;
  duplicate_of?: string | null;
  is_claimed?: boolean | null;
  claimed?: boolean | null;
  owner_user_id?: string | null;
  claim_status?: string | null;
};

export type CleanupSkip = {
  locationId: string;
  reason: string;
};

export type CleanupFailure = {
  locationId: string;
  error: string;
};

function present(value: unknown) {
  return typeof value === "string" ? Boolean(value.trim()) : value !== null && value !== undefined;
}

export function publishReadyCleanupBlockers(row: CleanupCandidate) {
  const blockers: string[] = [];
  if (row.deleted_at) blockers.push("deleted");
  if (row.is_demo === true) blockers.push("demo");
  if (row.training_only === true) blockers.push("training_only");
  if (row.quality_status !== "publish_ready") blockers.push("quality_not_publish_ready");
  if (row.is_searchable === true) blockers.push("already_searchable");
  if (row.is_hidden === true) blockers.push("hidden");
  if (row.active === false) blockers.push("inactive");
  if (row.is_low_level === true) blockers.push("low_level");
  if ((row.duplicate_status || "").toLowerCase() !== "unique") blockers.push("dedupe_not_unique");
  if (row.duplicate_of) blockers.push("duplicate_of_set");
  if (!present(row.name || row.restaurant_name || row.activity_name)) blockers.push("missing_name");
  if (!present(row.address || row.formatted_address)) blockers.push("missing_address");
  if (row.latitude === null || row.latitude === undefined || row.longitude === null || row.longitude === undefined) {
    blockers.push("missing_coordinates");
  }
  return blockers;
}

function isClaimed(row: CleanupCandidate) {
  return Boolean(
    row.is_claimed
      || row.claimed
      || row.owner_user_id
      || row.claim_status === "approved",
  );
}

function batchLimit(value?: number) {
  const parsed = Number.isFinite(value) ? Math.trunc(value as number) : DEFAULT_BATCH_LIMIT;
  return Math.max(1, Math.min(MAX_BATCH_LIMIT, parsed));
}

function actionableProfileReviewReasons(profile: { needs_review?: boolean | null; review_reasons?: unknown } | null | undefined) {
  if (profile?.needs_review !== true) return [];
  const reasons = Array.isArray(profile.review_reasons)
    ? profile.review_reasons.filter((reason): reason is string => typeof reason === "string" && Boolean(reason.trim()))
    : [];

  // Search Profile validation normally treats source.searchable=false as an
  // eligibility conflict. During this worker, that is the exact stale state we
  // are repairing. Hidden/inactive/low-level/deleted states are independently
  // checked from the live location row before and after profile generation, so
  // this one reason is safe to suppress only in this guarded pre-publish flow.
  if (reasons.length > 0 && reasons.every((reason) => reason === PRE_PUBLISH_SUPPRESSED_REVIEW_REASON)) {
    return [];
  }
  return reasons.length > 0 ? reasons : ["search_profile_needs_review"];
}

async function readCanaryCandidates(limit: number) {
  const result = await supabaseAdmin
    .from("locations")
    .select(candidateProjection)
    .eq("quality_status", "publish_ready")
    .eq("is_searchable", false)
    .eq("duplicate_status", "unique")
    .eq("is_hidden", false)
    .eq("active", true)
    .eq("is_low_level", false)
    .is("deleted_at", null)
    .is("duplicate_of", null)
    .order("id", { ascending: true })
    .limit(limit);

  if (result.error) throw new Error(`Cleanup candidate read failed: ${result.error.message}`);
  return (result.data ?? []) as unknown as CleanupCandidate[];
}

async function readCandidate(locationId: string) {
  const result = await supabaseAdmin
    .from("locations")
    .select(candidateProjection)
    .eq("id", locationId)
    .maybeSingle();
  if (result.error) throw new Error(`Cleanup recheck failed: ${result.error.message}`);
  return result.data as unknown as CleanupCandidate | null;
}

async function remainingCanaryCandidates() {
  const result = await supabaseAdmin
    .from("locations")
    .select("id", { count: "exact", head: true })
    .eq("quality_status", "publish_ready")
    .eq("is_searchable", false)
    .eq("duplicate_status", "unique")
    .eq("is_hidden", false)
    .eq("active", true)
    .eq("is_low_level", false)
    .is("deleted_at", null)
    .is("duplicate_of", null);

  if (result.error) throw new Error(`Cleanup remaining-count failed: ${result.error.message}`);
  return result.count ?? 0;
}

async function markProfileReviewRequired(locationId: string) {
  const now = new Date().toISOString();
  const result = await supabaseAdmin
    .from("locations")
    .update({
      quality_status: "needs_review",
      data_status: "needs_review",
      publish_ready: false,
      is_searchable: false,
      updated_at: now,
    })
    .eq("id", locationId)
    .eq("quality_status", "publish_ready")
    .eq("is_searchable", false)
    .eq("duplicate_status", "unique")
    .eq("is_hidden", false)
    .eq("active", true)
    .eq("is_low_level", false)
    .is("deleted_at", null)
    .is("duplicate_of", null)
    .select("id")
    .maybeSingle();

  if (result.error) throw new Error(`Cleanup profile-review disposition failed: ${result.error.message}`);
  return Boolean(result.data?.id);
}

async function publishCandidate(locationId: string) {
  const now = new Date().toISOString();
  const result = await supabaseAdmin
    .from("locations")
    .update({
      is_searchable: true,
      publish_ready: true,
      updated_at: now,
    })
    .eq("id", locationId)
    .eq("quality_status", "publish_ready")
    .eq("is_searchable", false)
    .eq("duplicate_status", "unique")
    .eq("is_hidden", false)
    .eq("active", true)
    .eq("is_low_level", false)
    .is("deleted_at", null)
    .is("duplicate_of", null)
    .select("id")
    .maybeSingle();

  if (result.error) throw new Error(`Cleanup publish failed: ${result.error.message}`);
  return Boolean(result.data?.id);
}

export async function processPublishReadyCleanupCanary(requestedLimit = DEFAULT_BATCH_LIMIT) {
  const limit = batchLimit(requestedLimit);
  const candidates = await readCanaryCandidates(limit);
  const published: string[] = [];
  const skipped: CleanupSkip[] = [];
  const failures: CleanupFailure[] = [];
  let dispositionedToReview = 0;

  for (const candidate of candidates) {
    try {
      const initialBlockers = publishReadyCleanupBlockers(candidate);
      if (initialBlockers.length) {
        skipped.push({ locationId: candidate.id, reason: initialBlockers.join(",") });
        continue;
      }

      const initialDedupe = await verifyConservativeUnique(candidate);
      if (initialDedupe.decision !== "auto_unique") {
        const routed = await routeUniqueCandidateToReview(candidate, initialDedupe);
        if (routed) dispositionedToReview += 1;
        skipped.push({
          locationId: candidate.id,
          reason: `dedupe_recheck:${initialDedupe.decision}${routed ? ":routed_to_review" : ""}`,
        });
        continue;
      }

      // Claimed locations are allowed to become searchable from owner truth, but this
      // canary never performs a Google refresh. The flag is retained in the outcome
      // so later enrichment stages can enforce the claimed-location provider policy.
      const claimed = isClaimed(candidate);

      const profile = await refreshLocationSearchProfile(
        candidate.id,
        "location_intelligence_cleanup_pre_publish",
      );

      const profileReviewReasons = actionableProfileReviewReasons(profile);
      if (profileReviewReasons.length > 0) {
        const dispositioned = await markProfileReviewRequired(candidate.id);
        if (dispositioned) dispositionedToReview += 1;
        skipped.push({
          locationId: candidate.id,
          reason: `search_profile_needs_review:${profileReviewReasons.join("|")}${dispositioned ? ":routed_to_review" : ""}`,
        });
        continue;
      }
      const exclusions = Array.isArray(profile?.exclusions) ? profile.exclusions : [];
      if (exclusions.includes("unsupported_non_outing")) {
        const dispositioned = await markProfileReviewRequired(candidate.id);
        if (dispositioned) dispositionedToReview += 1;
        skipped.push({
          locationId: candidate.id,
          reason: `unsupported_non_outing${dispositioned ? ":routed_to_review" : ""}`,
        });
        continue;
      }

      // Re-read immediately before the guarded update so a concurrent hide, close,
      // duplicate merge, or quality downgrade wins over this cleanup worker.
      const current = await readCandidate(candidate.id);
      if (!current) {
        skipped.push({ locationId: candidate.id, reason: "location_missing_on_recheck" });
        continue;
      }
      const recheckBlockers = publishReadyCleanupBlockers(current);
      if (recheckBlockers.length) {
        skipped.push({ locationId: candidate.id, reason: `recheck:${recheckBlockers.join(",")}` });
        continue;
      }

      const finalDedupe = await verifyConservativeUnique(current);
      if (finalDedupe.decision !== "auto_unique") {
        const routed = await routeUniqueCandidateToReview(current, finalDedupe);
        if (routed) dispositionedToReview += 1;
        skipped.push({
          locationId: candidate.id,
          reason: `final_dedupe_recheck:${finalDedupe.decision}${routed ? ":routed_to_review" : ""}`,
        });
        continue;
      }

      const didPublish = await publishCandidate(candidate.id);
      if (!didPublish) {
        skipped.push({ locationId: candidate.id, reason: "guarded_publish_no_longer_matched" });
        continue;
      }

      // The profile builder does not encode is_searchable in profile facets, so the
      // pre-publish rebuild is sufficient. No Google call is made by this worker.
      published.push(candidate.id);
      if (claimed) {
        console.info(JSON.stringify({
          event: "location_intelligence_cleanup_claimed_published",
          locationId: candidate.id,
          routineGoogleRefreshAllowed: false,
        }));
      }
    } catch (error) {
      failures.push({
        locationId: candidate.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const remaining = await remainingCanaryCandidates();
  return {
    ok: failures.length === 0,
    mode: "publish_ready_unique_canary",
    googleCallsPerformed: 0,
    limit,
    selected: candidates.length,
    processed: candidates.length,
    published: published.length,
    publishedLocationIds: published,
    dispositionedToReview,
    skipped,
    failed: failures.length,
    failures,
    remaining,
  };
}
