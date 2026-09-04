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

type DedupeCandidate = {
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

async function hasLiveFieldCollision(
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
  return (result.data ?? []).some((row) => (
    !row.deleted_at
      && !row.duplicate_of
      && clean(row.duplicate_status).toLowerCase() !== "duplicate"
  ));
}

async function hasLiveNormalizedNameAddressCollision(candidate: DedupeCandidate) {
  const name = clean(candidate.normalized_name);
  const address = clean(candidate.normalized_address);
  if (!name || !address) return false;
  const result = await supabaseAdmin
    .from("locations")
    .select("id,duplicate_status,duplicate_of,deleted_at")
    .eq("normalized_name", name)
    .eq("normalized_address", address)
    .neq("id", candidate.id)
    .limit(20);
  if (result.error) throw new Error(`Dedupe normalized identity read failed: ${result.error.message}`);
  return (result.data ?? []).some((row) => (
    !row.deleted_at
      && !row.duplicate_of
      && clean(row.duplicate_status).toLowerCase() !== "duplicate"
  ));
}

export async function verifyConservativeUnique(candidate: DedupeCandidate): Promise<{
  decision: DedupeDecision;
  signals: DedupeSignalSet;
}> {
  const googlePlaceId = clean(candidate.google_place_id);
  const locationKey = clean(candidate.location_key);
  const normalizedPhone = clean(candidate.normalized_phone);

  const pendingReview = await hasPendingReview(candidate.id);
  const sameGooglePlaceId = googlePlaceId
    ? await hasLiveFieldCollision(candidate, "google_place_id", googlePlaceId)
    : false;
  const sameLocationKey = locationKey
    ? await hasLiveFieldCollision(candidate, "location_key", locationKey)
    : false;
  const sameNormalizedNameAddress = await hasLiveNormalizedNameAddressCollision(candidate);
  // Deliberately conservative: any shared normalized phone blocks auto-unique,
  // even when names differ. This avoids silently clearing chains, shared booking
  // desks, or reused contact numbers without review.
  const sharedNormalizedPhone = normalizedPhone
    ? await hasLiveFieldCollision(candidate, "normalized_phone", normalizedPhone)
    : false;

  const signals: DedupeSignalSet = {
    hasGooglePlaceId: Boolean(googlePlaceId),
    pendingReview,
    sameGooglePlaceId,
    sameLocationKey,
    sameNormalizedNameAddress,
    sharedNormalizedPhone,
  };

  return { decision: classifyDedupeSignals(signals), signals };
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
  const review: Array<{ locationId: string; decision: DedupeDecision; signals: DedupeSignalSet }> = [];
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
        review.push({ locationId: candidate.id, ...verified });
        continue;
      }

      // Re-run the identity proof immediately before changing duplicate_status so
      // a concurrent import/review cannot be silently cleared as unique.
      const reverified = await verifyConservativeUnique(candidate);
      if (reverified.decision !== "auto_unique") {
        review.push({ locationId: candidate.id, ...reverified });
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
    review,
    skipped: skipped.length,
    skippedDetails: skipped,
    failed: failures.length,
    failures,
  };
}
