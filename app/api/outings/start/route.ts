import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isUuid as isTrackUuid, trackEvent } from "@/lib/analytics/trackEvent";
import { generateConfirmToken, generatePlanAccessToken, createSecureToken } from "@/lib/tokens/secure-token";
import { sendRenderedEmail } from "@/lib/email/sender";
import { renderOutingPlanEmail } from "@/lib/email/templates/outingPlanEmail";

const CONTACT_METHODS = new Set(["external_reservation", "phone", "email", "text"]);
const CONFIDENCE = new Set(["none", "date_only", "exact", "vague", "explicit"]);

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isUuid(value: string | null): boolean {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value);
}

function normalizeEmail(value: unknown) {
  const email = asString(value)?.toLowerCase() ?? null;
  return email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null;
}

function normalizePhone(value: unknown) {
  const phone = asString(value);
  if (!phone) return null;
  const cleaned = phone.replace(/[^+\d]/g, "");
  return cleaned.length >= 7 ? cleaned : null;
}

function addDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function determineNextMorningFollowup(input: {
  plannedFor?: string | null;
  outingDateContext?: string | null;
  outingTimeConfidence?: string | null;
  timezone?: string | null;
}) {
  const context = String(input.outingDateContext || "").toLowerCase();

  if (input.plannedFor && (input.outingTimeConfidence === "exact" || input.outingTimeConfidence === "explicit")) {
    return true;
  }

  if (context.includes("tonight") || context.includes("today")) {
    return true;
  }

  return false;
}

function calculateNextMorningFollowupDate(input: {
  plannedFor?: string | null;
  outingDateContext?: string | null;
  timezone?: string | null;
}) {
  const base = input.plannedFor ? new Date(input.plannedFor) : new Date();

  if (Number.isNaN(base.getTime())) {
    return null;
  }

  const nextMorning = new Date(base);
  nextMorning.setDate(nextMorning.getDate() + 1);
  nextMorning.setHours(10, 0, 0, 0);

  return nextMorning.toISOString();
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const sourceLocationId = asString(payload?.source_location_id) ?? asString(payload?.sourceLocationId);
    const restaurantLocationId = asString(payload?.restaurantLocationId);
    const activityLocationId = asString(payload?.activityLocationId);
    const locationId = asString(payload?.location_id) ?? asString(payload?.locationId) ?? restaurantLocationId ?? activityLocationId;
    const reservationUrl = asString(payload?.external_reservation_url) ?? asString(payload?.externalReservationUrl);
    const phoneNumber = asString(payload?.phone_number) ?? asString(payload?.phoneNumber);
    const requestedContactMethod = asString(payload?.contact_method) ?? asString(payload?.contactMethod);
    const contactMethod =
      requestedContactMethod ??
      (payload?.external_reservation_url ? "external_reservation" :
       payload?.phone_number || payload?.phoneNumber ? "phone" :
       payload?.guestEmail ? "email" :
       payload?.guestPhone ? "text" :
       "external_reservation");
    const selectedLocationId = sourceLocationId ?? locationId;
    const planTitle = asString(payload?.planTitle);
    const sourceQuery = asString(payload?.sourceQuery);
    const clientSessionId = asString(payload?.session_id) ?? asString(payload?.sessionId);
    const anonymousId = asString(payload?.anonymous_id) ?? asString(payload?.anonymousId);

    if (!selectedLocationId) {
      return NextResponse.json({ ok: false, error: "missing_location_id", message: "A location id is required." }, { status: 400 });
    }
    if (contactMethod && !CONTACT_METHODS.has(contactMethod)) {
      return NextResponse.json({ ok: false, error: "invalid_contact_method", message: "Choose email, text, call, or reservation before saving your outing." }, { status: 400 });
    }

    const outingTimeConfidence = CONFIDENCE.has(asString(payload?.outingTimeConfidence) || "") ? asString(payload?.outingTimeConfidence) as "none" | "date_only" | "exact" | "vague" | "explicit" : "none";
    const timezone = asString(payload?.timezone) ?? "America/New_York";
    const outingDateContext = asString(payload?.outingDateContext);
    const outingTiming = payload?.outingTiming && typeof payload.outingTiming === "object" ? payload.outingTiming : {};
    const outingDateTimeText = asString(outingTiming?.outingDateTimeText) ?? asString(payload?.outingDateTimeText);
    let plannedFor = asString(payload?.plannedFor);
    if (plannedFor && Number.isNaN(Date.parse(plannedFor))) {
      return NextResponse.json({ ok: false, error: "invalid_planned_for", message: "plannedFor must be a valid date/time." }, { status: 400 });
    }
    if (outingTimeConfidence !== "exact" && outingTimeConfidence !== "explicit") plannedFor = null;

    let remindersEnabled = Boolean(payload?.remindersEnabled) && Boolean(plannedFor);
    if (Boolean(payload?.remindersEnabled) && !plannedFor) remindersEnabled = false;

    const shouldEnableNextMorningFollowup = determineNextMorningFollowup({
      plannedFor,
      outingDateContext,
      outingTimeConfidence,
      timezone,
    });
    const nextMorningFollowupDate = shouldEnableNextMorningFollowup
      ? calculateNextMorningFollowupDate({ plannedFor, outingDateContext, timezone })
      : null;

    const guestEmail = normalizeEmail(payload?.guestEmail);
    const guestPhone = normalizePhone(payload?.guestPhone);
    const guestName = asString(payload?.guestName);
    const emailOptIn = Boolean(payload?.emailOptIn);
    const smsOptIn = Boolean(payload?.smsOptIn);
    if (contactMethod === "email" && !guestEmail) {
      return NextResponse.json({ ok: false, error: "email_required", message: "Add a valid email so we can send your outing plan." }, { status: 400 });
    }
    if (contactMethod === "text" && !guestPhone) {
      return NextResponse.json({ ok: false, error: "phone_required", message: "Add a valid phone number so we can text your outing plan." }, { status: 400 });
    }
    if (smsOptIn && !guestPhone) {
      return NextResponse.json({ ok: false, error: "phone_required_for_sms", message: "Add a phone number and SMS opt-in to receive text reminders." }, { status: 400 });
    }
    if (emailOptIn && !guestEmail) {
      return NextResponse.json({ ok: false, error: "email_required_for_save", message: "Add a valid email so we can save and email your outing plan." }, { status: 400 });
    }

    const supabase = await createClient();
    let canonicalLocationId: string | null = null;
    if (isUuid(locationId)) {
      const { data: locationExists } = await supabase.from("locations").select("id").eq("id", locationId).maybeSingle();
      canonicalLocationId = locationExists?.id ?? null;
    }

    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id ?? null;
    const isGuest = !userId;

    if (shouldEnableNextMorningFollowup && isGuest && !guestEmail && !guestPhone) {
      return NextResponse.json({ ok: false, error: "contact_required_for_followup", message: "Add an email or phone number so we can send your follow-up." }, { status: 400 });
    }

    const existingGuestSession = req.cookies.get("theouthaven_guest_session")?.value || null;
    const guestSessionId = isGuest ? existingGuestSession ?? `guest_${createSecureToken(24)}` : null;
    const planAccessToken = isGuest ? generatePlanAccessToken() : null;
    const confirmToken = remindersEnabled || shouldEnableNextMorningFollowup ? generateConfirmToken() : null;

    await trackEvent({
      event_name: "plan_save_started",
      event_type: "save",
      user_id: userId,
      anonymous_id: anonymousId,
      session_id: clientSessionId,
      location_id: locationId,
      source_location_id: sourceLocationId ?? locationId,
      query: sourceQuery,
      page_path: asString(payload?.page_path),
      source: asString(payload?.source) ?? "plan_page",
      conversion_step: "viewed_plan",
      metadata: { plan_title: planTitle, restaurant_location_id: restaurantLocationId, activity_location_id: activityLocationId },
    });

    const insertPayload = {
      user_id: userId,
      source_location_id: sourceLocationId ?? locationId,
      location_id: canonicalLocationId,
      location_type: asString(payload?.location_type),
      status: "saved",
      reservation_type: asString(payload?.reservation_type) ?? "external",
      external_reservation_url: reservationUrl,
      phone_number: phoneNumber,
      contact_method: contactMethod,
      reservation_clicked_at: contactMethod === "external_reservation" ? new Date().toISOString() : null,
      call_clicked_at: contactMethod === "phone" ? new Date().toISOString() : null,
      source: asString(payload?.source) ?? "plan_page",
      source_search_id: asString(payload?.sourceSearchId),
      source_query: sourceQuery,
      plan_title: planTitle,
      restaurant_location_id: isTrackUuid(restaurantLocationId) ? restaurantLocationId : null,
      activity_location_id: isTrackUuid(activityLocationId) ? activityLocationId : null,
      saved_at: new Date().toISOString(),
      created_by_type: isGuest ? "guest" : "user",
      guest_session_id: guestSessionId,
      guest_email: isGuest ? guestEmail : null,
      guest_phone: isGuest ? guestPhone : null,
      guest_name: isGuest ? guestName : null,
      email_opt_in: isGuest ? emailOptIn : true,
      sms_opt_in: isGuest ? smsOptIn : false,
      plan_access_token: planAccessToken,
      plan_access_token_expires_at: isGuest ? addDays(60) : null,
      confirm_token: confirmToken,
      confirm_token_expires_at: confirmToken ? addDays(30) : null,
      planned_for: plannedFor,
      timezone,
      outing_date_context: outingDateContext,
      outing_time_confidence: outingTimeConfidence,
      reminders_enabled: remindersEnabled,
      next_morning_followup_enabled: shouldEnableNextMorningFollowup,
      next_morning_followup_date: nextMorningFollowupDate,
      visit_verification_level: "planned",
    };

    const { data, error } = await supabase.from("outings").insert(insertPayload).select("*").single();

    if (error) {
      console.error("THEOUTHAVEN_OUTING_TRACKING_FAILED", { error, location_id: selectedLocationId, insertPayload });
      await trackEvent({
        event_name: "plan_save_failed",
        event_type: "save",
        user_id: userId,
        anonymous_id: anonymousId,
        session_id: clientSessionId,
        location_id: locationId,
        source_location_id: sourceLocationId ?? locationId,
        query: sourceQuery,
        page_path: asString(payload?.page_path),
        source: asString(payload?.source) ?? "plan_page",
        metadata: { error_code: error.code, error_message: error.message, plan_title: planTitle },
      });
      return NextResponse.json({ ok: false, error: "outing_create_failed", message: "We could not save your outing yet. Please check your contact info and try again." }, { status: 500 });
    }

    const outingId = data.id;
    const planUrl = isGuest ? `/outings/guest/${planAccessToken}` : `/outings/${outingId}`;
    let emailStatus: "sent" | "skipped" | "error" = "skipped";
    if (contactMethod === "email" && guestEmail) {
      try {
        const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://theouthaven.com").replace(/\/$/, "");
        const absolutePlanUrl = `${siteUrl}${planUrl.startsWith("/") ? planUrl : `/${planUrl}`}`;
        const selectedLocations = payload?.selectedLocations || {};
        const rendered = renderOutingPlanEmail({
          planTitle,
          planUrl: absolutePlanUrl,
          restaurant: selectedLocations?.restaurant || null,
          activity: selectedLocations?.activity || null,
          plannedFor,
          timezone,
          outingDateContext,
          outingDateTimeText,
        });
        const emailResult = await sendRenderedEmail({ to: guestEmail, rendered, department: "plans", templateKey: "outing_plan" });
        emailStatus = emailResult.status;
        if (emailResult.status === "error") console.error("OUTING_PLAN_EMAIL_FAILED", emailResult.error);
      } catch (emailError) {
        emailStatus = "error";
        console.error("OUTING_PLAN_EMAIL_FAILED", emailError);
      }
    }

    const saveEventMetadata = { outing_timing: outingTiming, outing_date_time_text: outingDateTimeText, plan_title: planTitle, restaurant_location_id: restaurantLocationId, activity_location_id: activityLocationId, selected_locations: payload?.selectedLocations ?? payload?.planLocations ?? null, contact_method: contactMethod, created_by_type: isGuest ? "guest" : "user", guest_session_id: guestSessionId, outing_time_confidence: outingTimeConfidence, outing_date_context: outingDateContext, planned_for: plannedFor, reminders_enabled: remindersEnabled, next_morning_followup_enabled: shouldEnableNextMorningFollowup, next_morning_followup_date: nextMorningFollowupDate };

    await Promise.allSettled([
      trackEvent({ event_name: isGuest ? "guest_plan_saved" : "plan_saved", event_type: "save", conversion_step: "saved_plan", user_id: userId, anonymous_id: anonymousId, session_id: clientSessionId, location_id: locationId, source_location_id: sourceLocationId ?? locationId, outing_id: outingId, query: sourceQuery, page_path: asString(payload?.page_path), source: asString(payload?.source) ?? "plan_page", metadata: saveEventMetadata }),
      trackEvent({ event_name: isGuest ? "guest_plan_created" : "outing_plan_created", event_type: "save", conversion_step: "saved_plan", user_id: userId, anonymous_id: anonymousId, session_id: clientSessionId, location_id: locationId, source_location_id: sourceLocationId ?? locationId, outing_id: outingId, query: sourceQuery, page_path: asString(payload?.page_path), source: asString(payload?.source) ?? "plan_page", metadata: saveEventMetadata }),
      outingTimeConfidence === "date_only" ? trackEvent({ event_name: "outing_date_context_detected", outing_id: outingId, user_id: userId, location_id: locationId, metadata: { guest_session_id: guestSessionId, source_query: sourceQuery, outing_date_context: outingDateContext } }) : Promise.resolve(),
      (outingTimeConfidence === "exact" || outingTimeConfidence === "explicit") ? trackEvent({ event_name: "outing_exact_time_detected", outing_id: outingId, user_id: userId, location_id: locationId, metadata: { guest_session_id: guestSessionId, planned_for: plannedFor } }) : Promise.resolve(),
    ]);

    const response = NextResponse.json({ ok: true, outing: data, outing_id: outingId, planUrl, emailStatus });
    if (guestSessionId && !existingGuestSession) {
      response.cookies.set("theouthaven_guest_session", guestSessionId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 60 });
    }
    return response;
  } catch (error) {
    console.error("OUTING_START_INVALID_REQUEST", error);
    return NextResponse.json({ ok: false, error: "invalid_request", message: "Invalid request payload." }, { status: 400 });
  }
}
