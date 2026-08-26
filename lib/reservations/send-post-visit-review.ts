import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendRawBrandedEmail } from "@/lib/email/sender";
import { generateReviewToken } from "@/lib/tokens/secure-token";
import { ensureShortLink } from "@/lib/short-links/service";
import { startInternalReservationReviewConsent } from "@/lib/reviews/internal-reservation-review-consent";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://theouthaven.com").replace(/\/$/, "");

function addDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function locationName(row: Record<string, unknown> | null | undefined) {
  return String(row?.name || row?.business_name || row?.restaurant_name || row?.activity_name || "your visit");
}

export async function sendReservationPostVisitReview(reservationId: string) {
  const { data: reservation, error } = await supabaseAdmin
    .from("location_reservations")
    .select("id,location_id,status,seated_at,completed_at,customer_name,customer_email,customer_phone,user_id,reservation_date,reservation_time")
    .eq("id", reservationId)
    .maybeSingle();

  if (error || !reservation) throw new Error(error?.message || "Reservation not found");
  if (!["seated", "completed"].includes(String(reservation.status || "")) && !reservation.seated_at && !reservation.completed_at) {
    return { ok: true, skipped: true, reason: "attendance_not_verified" };
  }

  const { data: location } = await supabaseAdmin
    .from("locations")
    .select("id,name,business_name,restaurant_name,activity_name")
    .eq("id", reservation.location_id)
    .maybeSingle();

  let { data: eligibility, error: eligibilityError } = await supabaseAdmin
    .from("location_review_eligibility")
    .select("*")
    .eq("reservation_id", reservation.id)
    .maybeSingle();

  if (eligibilityError) throw eligibilityError;
  if (eligibility?.status === "reviewed") return { ok: true, skipped: true, reason: "already_reviewed" };

  if (!eligibility) {
    const token = generateReviewToken();
    const { data: created, error: createError } = await supabaseAdmin
      .from("location_review_eligibility")
      .insert({
        location_id: reservation.location_id,
        user_id: reservation.user_id || null,
        reservation_id: reservation.id,
        guest_email: reservation.customer_email || null,
        source: "internal_reservation",
        status: "eligible",
        review_token: token,
        review_token_expires_at: addDays(30),
        metadata: {
          created_from: "verified_internal_reservation",
          reservation_status: reservation.status,
          seated_at: reservation.seated_at || null,
          completed_at: reservation.completed_at || null,
        },
      })
      .select("*")
      .single();
    if (createError) throw createError;
    eligibility = created;
  }

  const metadata = eligibility.metadata && typeof eligibility.metadata === "object" ? eligibility.metadata as Record<string, unknown> : {};
  if (metadata.followup_sent_at) return { ok: true, skipped: true, reason: "already_sent" };

  const longUrl = `${SITE_URL}/reviews/verified/${encodeURIComponent(eligibility.review_token)}`;
  const shortLink = await ensureShortLink(supabaseAdmin, {
    destinationUrl: longUrl,
    linkType: "review_request",
    entityType: "reservation",
    entityId: reservation.id,
    title: `Review ${locationName(location as Record<string, unknown> | null)}`,
    metadata: { source: "internal_reservation_post_visit" },
  });

  const name = locationName(location as Record<string, unknown> | null);
  const sent: string[] = [];

  if (reservation.customer_email) {
    await sendRawBrandedEmail({
      to: reservation.customer_email,
      subject: `How was your visit to ${name}?`,
      heading: "How did everything go?",
      body: `Thanks for booking with TheOutHaven. Since your visit was marked seated, you can go straight to your review. Rate ${name} and tell us how the TheOutHaven experience worked for you.`,
      cta: { label: "Review my visit", url: shortLink.shortUrl },
    });
    sent.push("email");
  }

  if (reservation.customer_phone) {
    const conversation = await startInternalReservationReviewConsent(reservation.id);
    if (conversation.sent || conversation.fulfilled) sent.push("sms");
  }

  if (!sent.length) return { ok: true, skipped: true, reason: "no_available_followup_channel" };

  await supabaseAdmin
    .from("location_review_eligibility")
    .update({
      metadata: {
        ...metadata,
        followup_sent_at: new Date().toISOString(),
        followup_channels: sent,
        followup_short_url: shortLink.shortUrl,
        sms_review_mode: sent.includes("sms") ? "conversational_0411_with_consent" : null,
      },
    })
    .eq("id", eligibility.id);

  return { ok: true, sent, reviewUrl: shortLink.shortUrl, eligibilityId: eligibility.id };
}
