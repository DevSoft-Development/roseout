import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

const DEFAULT_BATCH_LIMIT = 50;
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
type FinalReviewStatus = "merged" | "ignored" | "not_duplicate";

type ReviewRouteResult = {
  routed: boolean;
  reviewQueued: boolean;
  priorDecisionConflict: boolean;
};

const decisionKeys = new Set<FinalReviewStatus>(["merged", "ignored", "not_duplicate"]);

function normalize(value?: string | null) {
  return String(value || "").trim();
}

function noSignals(): DedupeSignalSet {
  return {
    hasGooglePlaceId: false,
    pendingReview: false,
    sameGooglePlaceId: false,
    sameLocationKey: false,
    sameNormalizedNameAddress: false,
    sharedNormalizedPhone: false,
  };
}

function emptyVerification(decision: DedupeDecision): DedupeVerification {
  return { decision, signals: noSignals(), matchLocationId: null };
}

function requestedLimit(value?: number) {
  const parsed = Number.isFinite(value) ? Math.trunc(value as number) : DEFAULT_BATCH_LIMIT;
  return Math.max(1, Math.min(MAX_BATCH_LIMIT, parsed));
}

function isClaimed(candidate: DedupeCandidate) {
  return Boolean(
    candidate.is_claimed
      || candidate.claimed
      || candidate.owner_user_id
      || candidate.claim_status === "approved",
  );
}

async function pairDecision(locationId: string, matchLocationId: string) {
  const result = await supabaseAdmin
    .from("location_duplicate_review")
    .select("status")
    .or(`and(location_a_id.eq.${locationId},location_b_id.eq.${matchLocationId}),and(location_a_id.eq.${matchLocationId},location_b_id.eq.${locationId})`)
    .limit(1)
    .maybeSingle();
  if (result.error) throw new Error(`Duplicate review decision read failed: ${result.error.message}`);
  const status = normalize(result.data?.status) as FinalReviewStatus;
  return decisionKeys.has(status) ? status : null;
}

async function pairWasExplicitlyNotDuplicate(locationId: string, matchLocationId: string) {
  return (await pairDecision(locationId, matchLocationId)) === "not_duplicate";
}

async function firstActionableCollision(
  candidate: DedupeCandidate,
  ids: string[],
) {
  for (const matchLocationId of ids) {
    if (!matchLocationId || matchLocationId === candidate.id) continue;
    // Only status=not_duplicate is suppressive; pending/merged/ignored decisions
    // remain actionable collisions and are terminally dispositioned below.
    if (await pairWasExplicitlyNotDuplicate(candidate.id, matchLocationId)) continue;
    return matchLocationId;
  }
  return null;
}

async function hasPendingReview(locationId: string) {
  const result = await supabaseAdmin
    .from("location_duplicate_review")
    .select("id")
    .eq("status", "pending")
    .or(`location_a_id.eq.${locationId},location_b_id.eq.${locationId}`)
    .limit(1);
  if (result.error) throw new Error(`Pending duplicate review read failed: ${result.error.message}`);
  return Boolean(result.data?.length);
}

async function ensurePendingReview(candidate: DedupeCandidate, verification: DedupeVerification) {
  if (!verification.matchLocationId) return false;
  const priorDecision = await pairDecision(candidate.id, verification.matchLocationId);
  if (priorDecision === "not_duplicate") return false;
  if (priorDecision === "merged" || priorDecision === "ignored") {
    return false;
  }

  const [locationAId, locationBId] = [candidate.id, verification.matchLocationId].sort();
  const result = await supabaseAdmin
    .from("location_duplicate_review")
    .upsert(
      {
        location_a_id: locationAId,
        location_b_id: locationBId,
        status: "pending",
        reason: `location_intelligence_${verification.decision}`,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "location_a_id,location_b_id", ignoreDuplicates: true },
    );
  if (result.error) throw new Error(`Duplicate review queue failed: ${result.error.message}`);
  return true;
}

async function routeCandidateToReview(
  candidate: DedupeCandidate,
  verification: DedupeVerification,
  expectedStatus: ReviewSourceStatus,
): Promise<ReviewRouteResult> {
  let reviewQueued = false;
  let reviewReady = await hasPendingReview(candidate.id);
  let priorDecisionConflict = false;

  if (!reviewReady && verification.matchLocationId) {
    const priorDecision = await pairDecision(candidate.id, verification.matchLocationId);
    if (priorDecision === "merged" || priorDecision === "ignored") {
      // The pair cannot be reopened because the review table is unique per pair.
      // Preserve that audit decision and terminally quarantine this candidate.
      priorDecisionConflict = true;
      const now = new Date().toISOString();
      const result = await supabaseAdmin
        .from("locations")
        .update({
          duplicate_status: "possible_duplicate",
          duplicate_check_key: `location_intelligence_prior_${priorDecision}_collision`,
          is_searchable: false,
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
      if (result.error) throw new Error(`Dedupe prior-decision quarantine failed: ${result.error.message}`);
      return { routed: Boolean(result.data?.id), reviewQueued: false, priorDecisionConflict };
    }

    reviewQueued = await ensurePendingReview(candidate, verification);
    reviewReady = reviewQueued || await hasPendingReview(candidate.id);
  }
  if (!reviewReady) return { routed: false, reviewQueued, priorDecisionConflict: false };

  const now = new Date().toISOString();
  const result = await supabaseAdmin
    .from("locations")
    .update({
      duplicate_status: "possible_duplicate",
      duplicate_check_key: `location_intelligence_${verification.decision}`,
      is_searchable: false,
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
  if (result.error) throw new Error(`Dedupe review disposition failed: ${result.error.message}`);
  return { routed: Boolean(result.data?.id), reviewQueued, priorDecisionConflict: false };
}

export async function routeUnknownCandidateToReview(candidate: DedupeCandidate, verification: DedupeVerification) {
  return routeCandidateToReview(candidate, verification, "unknown");
}

export async function routeUniqueCandidateToReview(candidate: DedupeCandidate, verification: DedupeVerification) {
  return routeCandidateToReview(candidate, verification, "unique");
}

async function markUnique(candidate: DedupeCandidate) {
  const now = new Date().toISOString();
  const result = await supabaseAdmin
    .from("locations")
    .update({
      duplicate_status: "unique",
      duplicate_check_key: `location_intelligence_google_place:${normalize(candidate.google_place_id)}`,
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

export async function verifyConservativeUnique(candidate: DedupeCandidate): Promise<DedupeVerification> {
  const googlePlaceId = normalize(candidate.google_place_id);
  const signals: DedupeSignalSet = {
    hasGooglePlaceId: Boolean(googlePlaceId),
    pendingReview: false,
    sameGooglePlaceId: false,
    sameLocationKey: false,
    sameNormalizedNameAddress: false,
    sharedNormalizedPhone: false,
  };

  if (!googlePlaceId) {
    return { decision: "review_missing_google_place_id", signals, matchLocationId: null };
  }

  const pendingResult = await supabaseAdmin
    .from("location_duplicate_review")
    .select("id")
    .eq("status", "pending")
    .or(`location_a_id.eq.${candidate.id},location_b_id.eq.${candidate.id}`)
    .limit(1);
  if (pendingResult.error) throw new Error(`Pending duplicate review read failed: ${pendingResult.error.message}`);
  if (pendingResult.data?.length) {
    signals.pendingReview = true;
    return { decision: "review_pending", signals, matchLocationId: null };
  }

  const googleResult = await supabaseAdmin
    .from("locations")
    .select("id")
    .neq("id", candidate.id)
    .eq("google_place_id", googlePlaceId)
    .is("deleted_at", null)
    .order("id", { ascending: true })
    .limit(25);
  if (googleResult.error) throw new Error(`Google Place collision read failed: ${googleResult.error.message}`);
  const googleCollision = await firstActionableCollision(candidate, (googleResult.data ?? []).map((row) => String(row.id)));
  if (googleCollision) {
    signals.sameGooglePlaceId = true;
    return { decision: "review_exact_collision", signals, matchLocationId: googleCollision };
  }

  const locationKey = normalize(candidate.location_key);
  if (locationKey) {
    const keyResult = await supabaseAdmin
      .from("locations")
      .select("id")
      .neq("id", candidate.id)
      .eq("location_key", locationKey)
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .limit(25);
    if (keyResult.error) throw new Error(`Location-key collision read failed: ${keyResult.error.message}`);
    const keyCollision = await firstActionableCollision(candidate, (keyResult.data ?? []).map((row) => String(row.id)));
    if (keyCollision) {
      signals.sameLocationKey = true;
      return { decision: "review_exact_collision", signals, matchLocationId: keyCollision };
    }
  }

  const normalizedName = normalize(candidate.normalized_name);
  const normalizedAddress = normalize(candidate.normalized_address);
  if (normalizedName && normalizedAddress) {
    const nameAddressResult = await supabaseAdmin
      .from("locations")
      .select("id")
      .neq("id", candidate.id)
      .eq("normalized_name", normalizedName)
      .eq("normalized_address", normalizedAddress)
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .limit(25);
    if (nameAddressResult.error) throw new Error(`Name/address collision read failed: ${nameAddressResult.error.message}`);
    const nameAddressCollision = await firstActionableCollision(candidate, (nameAddressResult.data ?? []).map((row) => String(row.id)));
    if (nameAddressCollision) {
      signals.sameNormalizedNameAddress = true;
      return { decision: "review_exact_collision", signals, matchLocationId: nameAddressCollision };
    }
  }

  const normalizedPhone = normalize(candidate.normalized_phone);
  if (normalizedPhone) {
    const phoneResult = await supabaseAdmin
      .from("locations")
      .select("id")
      .neq("id", candidate.id)
      .eq("normalized_phone", normalizedPhone)
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .limit(25);
    if (phoneResult.error) throw new Error(`Phone collision read failed: ${phoneResult.error.message}`);
    const phoneCollision = await firstActionableCollision(candidate, (phoneResult.data ?? []).map((row) => String(row.id)));
    if (phoneCollision) {
      signals.sharedNormalizedPhone = true;
      return { decision: "review_shared_phone", signals, matchLocationId: phoneCollision };
    }
  }

  return { decision: "auto_unique", signals, matchLocationId: null };
}

export async function processConservativeDedupeClassifier(limitInput = DEFAULT_BATCH_LIMIT) {
  const limit = requestedLimit(limitInput);
  const candidates = await readCandidates(limit);
  const autoUnique: string[] = [];
  const review: Array<{
    locationId: string;
    decision: DedupeDecision;
    matchLocationId: string | null;
    signals: DedupeSignalSet;
    reviewQueued: boolean;
    reviewDispositioned: boolean;
    priorDecisionConflict: boolean;
  }> = [];
  const failures: Array<{ locationId: string; error: string }> = [];
  const skippedDetails: Array<{ locationId: string; reason: string }> = [];
  let reviewQueuedCount = 0;
  let reviewDispositionedCount = 0;
  let priorDecisionConflicts = 0;

  for (const candidate of candidates) {
    try {
      const verification = await verifyConservativeUnique(candidate);
      if (verification.decision !== "auto_unique") {
        const routed = await routeUnknownCandidateToReview(candidate, verification);
        if (routed.reviewQueued) reviewQueuedCount += 1;
        if (routed.routed) reviewDispositionedCount += 1;
        if (routed.priorDecisionConflict) priorDecisionConflicts += 1;
        review.push({
          locationId: candidate.id,
          decision: routed.priorDecisionConflict ? "review_exact_collision" : verification.decision,
          matchLocationId: verification.matchLocationId,
          signals: verification.signals,
          reviewQueued: routed.reviewQueued,
          reviewDispositioned: routed.routed,
          priorDecisionConflict: routed.priorDecisionConflict,
        });
        if (!routed.routed) skippedDetails.push({ locationId: candidate.id, reason: verification.decision });
        continue;
      }

      // Double verification immediately before the guarded status update ensures a
      // concurrent review/collision wins over this classifier.
      const reverified = await verifyConservativeUnique(candidate);
      if (reverified.decision !== "auto_unique") {
        const routed = await routeUnknownCandidateToReview(candidate, reverified);
        if (routed.reviewQueued) reviewQueuedCount += 1;
        if (routed.routed) reviewDispositionedCount += 1;
        if (routed.priorDecisionConflict) priorDecisionConflicts += 1;
        review.push({
          locationId: candidate.id,
          decision: routed.priorDecisionConflict ? "review_exact_collision" : reverified.decision,
          matchLocationId: reverified.matchLocationId,
          signals: reverified.signals,
          reviewQueued: routed.reviewQueued,
          reviewDispositioned: routed.routed,
          priorDecisionConflict: routed.priorDecisionConflict,
        });
        if (!routed.routed) skippedDetails.push({ locationId: candidate.id, reason: reverified.decision });
        continue;
      }

      const updated = await markUnique(candidate);
      if (!updated) {
        skippedDetails.push({ locationId: candidate.id, reason: "guarded_unique_update_no_longer_matched" });
        continue;
      }
      autoUnique.push(candidate.id);
      if (isClaimed(candidate)) {
        console.info(JSON.stringify({
          event: "location_intelligence_claimed_dedupe_classified",
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

  return {
    ok: failures.length === 0,
    mode: "conservative_dedupe_classifier_v1",
    googleCallsPerformed: 0,
    destructiveMergesPerformed: 0,
    limit,
    selected: candidates.length,
    classified: autoUnique.length + reviewDispositionedCount,
    autoUnique: autoUnique.length,
    autoUniqueLocationIds: autoUnique,
    reviewRequired: review.length,
    reviewQueued: reviewQueuedCount,
    reviewDispositioned: reviewDispositionedCount,
    priorDecisionConflicts,
    review,
    skipped: skippedDetails.length,
    skippedDetails,
    failed: failures.length,
    failures,
  };
}
