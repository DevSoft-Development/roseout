import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

type VisitVerificationInput = {
  locationId: string;
  outingId?: string | null;
  reservationId?: string | null;
  userId?: string | null;
  guestSessionId?: string | null;
  verificationType: string;
  verificationStatus: string;
  verificationSource: string;
  verifiedBy?: string | null;
  metadata?: Record<string, unknown>;
  allowUnkeyed?: boolean;
};

function mergeMetadata(existing: unknown, incoming?: Record<string, unknown>) {
  const current = existing && typeof existing === "object" && !Array.isArray(existing)
    ? existing as Record<string, unknown>
    : {};
  return { ...current, ...(incoming || {}) };
}

export async function ensureCanonicalVisitVerification(input: VisitVerificationInput) {
  let query = supabaseAdmin
    .from("outing_visit_verifications")
    .select("*")
    .eq("location_id", input.locationId);
  let keyed = true;

  if (input.reservationId) {
    query = query.eq("reservation_id", input.reservationId);
  } else if (input.outingId) {
    query = query.eq("outing_id", input.outingId);
  } else if (input.guestSessionId) {
    query = query.eq("guest_session_id", input.guestSessionId);
  } else if (input.allowUnkeyed) {
    keyed = false;
  } else {
    throw new Error("A reservationId, outingId, or guestSessionId is required for canonical visit verification.");
  }

  const existingResult = keyed ? await query.maybeSingle() : { data: null, error: null };
  const existing = existingResult.data;
  if (existingResult.error) throw existingResult.error;

  if (existing) {
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("outing_visit_verifications")
      .update({
        user_id: input.userId || existing.user_id || null,
        guest_session_id: input.guestSessionId || existing.guest_session_id || null,
        verification_type: input.verificationType || existing.verification_type || null,
        verification_status: input.verificationStatus || existing.verification_status || null,
        verification_source: input.verificationSource || existing.verification_source || null,
        verified_by: input.verifiedBy || existing.verified_by || null,
        metadata: mergeMetadata(existing.metadata, input.metadata),
      })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (updateError) throw updateError;
    return updated;
  }

  const { data: created, error: createError } = await supabaseAdmin
    .from("outing_visit_verifications")
    .insert({
      outing_id: input.outingId || null,
      reservation_id: input.reservationId || null,
      location_id: input.locationId,
      user_id: input.userId || null,
      guest_session_id: input.guestSessionId || null,
      verification_type: input.verificationType,
      verification_status: input.verificationStatus,
      verification_source: input.verificationSource,
      verified_by: input.verifiedBy || null,
      metadata: input.metadata || {},
    })
    .select("*")
    .single();
  if (createError) throw createError;
  return created;
}

export async function linkReviewToCanonicalVisit(visitId: string | null | undefined, reviewId: string) {
  if (!visitId) return;
  const { error } = await supabaseAdmin
    .from("outing_visit_verifications")
    .update({ review_id: reviewId })
    .eq("id", visitId);
  if (error) throw error;
}
