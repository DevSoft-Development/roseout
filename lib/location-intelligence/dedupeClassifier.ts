import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

const DEFAULT_BATCH_LIMIT = 25;
const MAX_BATCH_LIMIT = 50;

const candidateProjection = [
  "id",
  "google_place_id",
  "location_key",
  "normalized_name",
  "normalized_address",
  "normalized_phone",
  "quality_status",
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

export type DedupeCandidate = {
  id: string;
  google_place_id?: string | null;
  location_key?: string | null;
  normalized_name?: string | null;
  normalized_address?: string | null;
  normalized_phone?: string | null;
  quality_status?: string | null;
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

export type DedupeSignalSet = {
  hasGooglePlaceId: boolean;
  pendingReview: boolean;
  sameGooglePlaceId: boolean;
  sameLocationKey: boolean;
  sameNormalizedNameAddress: boolean;
  sharedNormalizedPhone: boolean;
};

export type DedupeDecision =
  | "auto_unique"
  | "review_pending"
  | "review_exact_collision"
  | "review_shared_phone"
  | "review_missing_google_place_id";

export type DedupeVerification = {
  decision: DedupeDecision;
  signals: DedupeSignalSet;
  matchLocationId: string | null;
};

type ReviewSourceStatus = "unknown" | "unique";

type ReviewRouteResult = {
  routed: boolean;
  reviewQueued: boolean;
};

export function classifyDedupeSignals(signals: DedupeSignalSet): DedupeDecision {
  if (!signals.hasGooglePlaceId) return "review_missing_google_place_id";
  if (signals.pendingReview) return "review_pending";
  if (signals.sameGooglePlaceId || signals.sameLocationKey || signals.sameNormalizedNameAddress) {
    return "review_exact_collision";
  }
  if (signals.sharedNormalizedPhone) return "review_shared_phone";
  return "auto_unique";
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function requestedLimit(value?: number) {
  const parsed = Number.isFinite(value) ? Math.trunc(value as number) : DEFAULT_BATCH_LIMIT;
  return Math.max(1, Math.min(MAX_BATCH_LIMIT, parsed));
}

function candidateBlocked(row: DedupeCandidate) {
  return Boolean(
    row.deleted_at
      || row.is_demo === true
      || row.training_only === true
      || row.quality_status !== "publish_ready"
      || row.is_searchable === true
      || row.is_hidden === true
      || row.active === false
      || row.is_low_level === true
      || row.duplicate_of
      || clean(row.duplicate_status).toLowerCase() !== "unknown",
  );
}

async function readCandidates(limit: number) {
  const result = await supabaseAdmin
    .from("locations")
    .select(candidateProjection)
    .eq("quality_status", "publish_ready")
    .eq("is_searchable", false)
    .eq("duplicate_status", "unknown")
    .eq("is_hidden", false)
    .eq("active", true)
    .eq("is_low_level", false)
    .is("deleted_at", null)
    .is("duplicate_of", null)
    .order("id", { ascending: true })
    .limit(limit);

  if (result.error) throw new Error(`Dedupe candidate read failed: ${result.error.message}`);
  return (result.data ?? []) as unknown as DedupeCandidate[];
}

async function hasPendingReview(locationId: string) {
  const result = await supabaseAdmin
    .from("location_duplicate_review")
    .select("id")
    .eq("status", "pending")
    .or(`location_a_id.eq.${locationId},location_b_id.eq.${locationId}`)
    .limit(1);
  if (result.error) throw new Error(`Dedupe review read failed: ${result.error.message}`);
  return Boolean(result.data?.length);
}

async function pairWasExplicitlyNotDuplicate(locationId: string, matchLocationId: string) {
  const result = await supabaseAdmin
    .from("location_duplicate_review")
    .select("id")
    .eq("status", "not_duplicate")
    .or(
      `and(location_a_id.eq.${locationId},location_b_id.eq.${matchLocationId}),and(location_a_id.eq.${matchLocationId},location_b_id.eq.${locationId})`,
    )
    .limit(1);
  if (result.error) throw new Error(`Dedupe prior-decision read failed: ${result.error.message}`);
  return Boolean(result.data?.length);
}

async function firstActionableCollision(candidate: DedupeCandidate, rows: Array<Record<string, unknown>>) {
  for (const row of rows) {
    const matchLocationId = clean(row.id);
    if (!matchLocationId || row.deleted_at || row.duplicate_of || clean(row.duplicate_status).toLowerCase() === "duplicate") {
      continue;
    }
    // Preserve explicit prior review decisions for this exact pair. This is
    // important for legitimate sub-venues or shared administrative phone
    // numbers (for example, multiple venues inside one larger attraction).
    // Only status=not_duplicate is suppressive; pending/merged decisions remain
    // actionable blockers, and other live collisions are still evaluated.
    if (await pairWasExplicitlyNotDuplicate(candidate.id, matchLocationId)) continue;
    return matchLocationId;
  }
  return null;
}

async function findLiveFieldCollision(
  candidate: DedupeCandidate,
  field: "google_place_id" | "location_key" | "normalized_phone",
  value: string,
) {
  const result = await supabaseAdmin
    .from("locations")
    .select("id,duplicate_status,duplicate_of,deleted_at")
    .eq(field, value)
    .neq("id", candidate.id)
    .limit(20);
  if (result.error) throw new Error(`Dedupe ${field} collision read failed: ${result.error.message}`);
  return firstActionableCollision(candidate, (result.data ?? []) as Array<Record<string, unknown>>);
}

async function findLiveNormalizedNameAddressCollision(candidate: DedupeCandidate) {
  const name = clean(candidate.normalized_name);
  const address = clean(candidate.normalized_address);
  if (!name || !address) return null;
  const result = await supabaseAdmin
    .from("locations")
    .select("id,duplicate_status,duplicate_of,deleted_at")
    .eq("normalized_name", name)
    .eq("normalized_address", address)
    .neq("id", candidate.id)
    .limit(20);
  if (result.error) throw new Error(`Dedupe normalized identity read failed: ${result.error.message}`);
  return firstActionableCollision(candidate, (result.data ?? []) as Array<Record<string, unknown>>);
}

export async function verifyConservativeUnique(candidate: DedupeCandidate): Promise<DedupeVerification> {
  const googlePlaceId = clean(candidate.google_place_id);
  const locationKey = clean(candidate.location_key);
  const normalizedPhone = clean(candidate.normalized_phone);

  const pendingReview = await hasPendingReview(candidate.id);
  const sameGooglePlaceIdId = googlePlaceId
    ? await findLiveFieldCollision(candidate, "google_place_id", googlePlaceId)
    : null;
  const sameLocationKeyId = locationKey
    ? await findLiveFieldCollision(candidate, "location_key", locationKey)
    : null;
  const sameNormalizedNameAddressId = await findLiveNormalizedNameAddressCollision(candidate);
  // Deliberately conservative: any shared normalized phone blocks auto-unique,
  // even when names differ, unless that exact pair was already reviewed and
  // explicitly decided not_duplicate. This avoids silently clearing chains,
  // shared booking desks, or reused contact numbers without review.
  const sharedNormalizedPhoneId = normalizedPhone
    ? await findLiveFieldCollision(candidate, "normalized_phone", normalizedPhone)
    : null;

  const signals: DedupeSignalSet = {
    hasGooglePlaceId: Boolean(googlePlaceId),
    pendingReview,
    sameGooglePlaceId: Boolean(sameGooglePlaceIdId),
    sameLocationKey: Boolean(sameLocationKeyId),
    sameNormalizedNameAddress: Boolean(sameNormalizedNameAddressId),
    sharedNormalizedPhone: Boolean(sharedNormalizedPhoneId),
  };
  const decision = classifyDedupeSignals(signals);
  const matchLocationId = sameGooglePlaceIdId
    || sameLocationKeyId
    || sameNormalizedNameAddressId
    || sharedNormalizedPhoneId
    || null;

  return { decision, signals, matchLocationId };
}

async function ensurePendingReview(candidate: DedupeCandidate, verification: DedupeVerification) {
  if (verification.signals.pendingReview || !verification.matchLocationId) return false;
  if (!["review_exact_collision", "review_shared_phone"].includes(verification.decision)) return false;

  const [locationAId, locationBId] = [candidate.id, verification.matchLocationId].sort();
  const existing = await supabaseAdmin
    .from("location_duplicate_review")
    .select("id,status")
    .eq("location_a_id", locationAId)
    .eq("location_b_id", locationBId)
    .maybeSingle();
  if (existing.error) throw new Error(`Dedupe review-pair read failed: ${existing.error.message}`);
  // Never reopen or overwrite a prior human/system decision. If a decided pair
  // still presents a conservative signal, leave the location unresolved for the
  // next policy layer rather than erasing that audit history.
  if (existing.data?.id) return existing.data.status === "pending";

  const exact = verification.decision === "review_exact_collision";
  const inserted = await supabaseAdmin
    .from("location_duplicate_review")
    .insert({
      location_a_id: locationAId,
      location_b_id: locationBId,
      duplicate_score: exact ? 100 : 70,
      match_reasons: [
        exact
          ? "location_intelligence_exact_identity_collision"
          : "location_intelligence_shared_phone_conservative",
      ],
      status: "pending",
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();
  if (inserted.error) throw new Error(`Dedupe review-pair insert failed: ${inserted.error.message}`);
  return Boolean(inserted.data?.id);
}

async function markPossibleDuplicate(
  candidate: DedupeCandidate,
  verification: DedupeVerification,
  expectedStatus: ReviewSourceStatus,
) {
  const now = new Date().toISOString();
  const exact = verification.decision === "review_exact_collision";
  const result = await supabaseAdmin
    .from("locations")
    .update({
      duplicate_status: "possible_duplicate",
      duplicate_score: exact ? 100 : 70,
      last_deduped_at: now,
      updated_at: now,
    })
    .eq("id", candidate.id)
    .eq("quality_status", "publish_ready")
    .eq("is_searchable", false)
    .eq("duplicate_status", expectedStatus)
    .eq("is_hidden", false)
    .eq("active", true)
    .eq("is_low_level", false)
    .is("deleted_at", null)
    .is("duplicate_of", null)
    .select("id")
    .maybeSingle();
  if (result.error) throw new Error(`Dedupe review-state update failed: ${result.error.message}`);
  return Boolean(result.data?.id);
}

async function routeCandidateToReview(
  candidate: DedupeCandidate,
  verification: DedupeVerification,
  expectedStatus: ReviewSourceStatus,
): Promise<ReviewRouteResult> {
  if (!["review_pending", "review_exact_collision", "review_shared_phone"].includes(verification.decision)) {
    return { routed: false, reviewQueued: false };
  }

  // A candidate may only leave the classifier/cleanup queue when review is
  // demonstrably actionable. Re-prove an existing pending review immediately
  // before the update; exact/shared-phone collisions must have a new or existing
  // pending pair. A generic missing-Place-ID signal is not enough.
  const reviewQueued = verification.decision === "review_pending"
    ? false
    : await ensurePendingReview(candidate, verification);
  const reviewReady = verification.decision === "review_pending"
    ? await hasPendingReview(candidate.id)
    : reviewQueued;
  if (!reviewReady) return { routed: false, reviewQueued };

  const routed = await markPossibleDuplicate(candidate, verification, expectedStatus);
  return { routed, reviewQueued };
}

export async function routeUniqueCandidateToReview(
  candidate: DedupeCandidate,
  verification: DedupeVerification,
) {
  const result = await routeCandidateToReview(candidate, verification, "unique");
  return result.routed;
}

async function routeUnknownCandidateToReview(
  candidate: DedupeCandidate,
  verification: DedupeVerification,
) {
  return routeCandidateToReview(candidate, verification, "unknown");
}

async function markUnique(candidate: DedupeCandidate) {
  const now = new Date().toISOString();
  const result = await supabaseAdmin
    .from("locations")
    .update({
      duplicate_status: "unique",
      duplicate_score: 0,
      last_deduped_at: now,
      updated_at: now,
    })
    .eq("id", candidate.id)
    .eq("quality_status", "publish_ready")
    .eq("is_searchable", false)
    .eq("duplicate_status", "unknown")
    .eq("is_hidden", false)
    .eq("active", true)
    .eq("is_low_level", false)
    .is("deleted_at", null)
    .is("duplicate_of", null)
    .select("id")
    .maybeSingle();
  if (result.error) throw new Error(`Dedupe unique update failed: ${result.error.message}`);
  return Boolean(result.data?.id);
}

export async function processConservativeDedupeClassifier(limitInput = DEFAULT_BATCH_LIMIT) {
  const limit = requestedLimit(limitInput);
  const candidates = await readCandidates(limit);
  const autoUnique: string[] = [];
  const review: Array<{
    locationId: string;
    decision: DedupeDecision;
    signals: DedupeSignalSet;
    matchLocationId: string | null;
    reviewQueued: boolean;
    reviewDispositioned: boolean;
  }> = [];
  const skipped: Array<{ locationId: string; reason: string }> = [];
  const failures: Array<{ locationId: string; error: string }> = [];

  for (const candidate of candidates) {
    try {
      if (candidateBlocked(candidate)) {
        skipped.push({ locationId: candidate.id, reason: "candidate_changed_before_classification" });
        continue;
      }

      const verified = await verifyConservativeUnique(candidate);
      if (verified.decision !== "auto_unique") {
        const routed = await routeUnknownCandidateToReview(candidate, verified);
        review.push({
          locationId: candidate.id,
          ...verified,
          reviewQueued: routed.reviewQueued,
          reviewDispositioned: routed.routed,
        });
        continue;
      }

      // Re-run the identity proof immediately before changing duplicate_status so
      // a concurrent import/review cannot be silently cleared as unique.
      const reverified = await verifyConservativeUnique(candidate);
      if (reverified.decision !== "auto_unique") {
        const routed = await routeUnknownCandidateToReview(candidate, reverified);
        review.push({
          locationId: candidate.id,
          ...reverified,
          reviewQueued: routed.reviewQueued,
          reviewDispositioned: routed.routed,
        });
        continue;
      }

      const changed = await markUnique(candidate);
      if (changed) autoUnique.push(candidate.id);
      else skipped.push({ locationId: candidate.id, reason: "guarded_unique_update_no_longer_matched" });
    } catch (error) {
      failures.push({
        locationId: candidate.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    ok: failures.length === 0,
    mode: "conservative_dedupe_classifier_v1",
    googleCallsPerformed: 0,
    destructiveMergesPerformed: 0,
    limit,
    selected: candidates.length,
    classified: candidates.length - failures.length,
    autoUnique: autoUnique.length,
    autoUniqueLocationIds: autoUnique,
    reviewRequired: review.length,
    reviewQueued: review.filter((item) => item.reviewQueued).length,
    reviewDispositioned: review.filter((item) => item.reviewDispositioned).length,
    review,
    skipped: skipped.length,
    skippedDetails: skipped,
    failed: failures.length,
    failures,
  };
}
