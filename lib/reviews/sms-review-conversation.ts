import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizePhone, sendConciergeSms, TELNYX_CHANNEL_NUMBERS } from "@/lib/sms/telnyx";
import { generateReviewToken } from "@/lib/tokens/secure-token";
import { analyzeReview } from "@/lib/reviewAi";
import { trackEvent } from "@/lib/analytics/trackEvent";

const CHANNEL_NUMBER = TELNYX_CHANNEL_NUMBERS.concierge;
const ACTIVE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const REVIEW_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type LocationContext = {
  id: string;
  name: string;
  location_type: string;
};

type ConversationContext = {
  customer_name?: string | null;
  source: "outing" | "internal_reservation";
  verification_source: string;
  verification_level: "self_confirmed" | "system_verified";
  locations: LocationContext[];
  ratings?: Record<string, number>;
  reviews?: Record<string, string>;
  platform_rating?: number | null;
  platform_feedback?: string | null;
};

type ConversationRow = {
  id: string;
  phone_e164: string;
  channel_number: string;
  outing_id: string | null;
  reservation_id: string | null;
  user_id: string | null;
  status: string;
  stage: string;
  current_location_id: string | null;
  location_queue: string[] | null;
  context: ConversationContext | null;
  expires_at: string;
};

function firstName(value?: string | null) {
  const clean = String(value || "").trim();
  return clean ? clean.split(/\s+/)[0] : "";
}

function locationName(row: Record<string, unknown>) {
  return String(row.name || row.business_name || row.restaurant_name || row.activity_name || "your stop");
}

function uniqueIds(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

async function loadLocations(ids: string[]): Promise<LocationContext[]> {
  if (!ids.length) return [];
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("id,name,business_name,restaurant_name,activity_name,location_type")
    .in("id", ids);
  if (error) throw error;
  const byId = new Map((data || []).map((row: any) => [String(row.id), row]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    if (!row) return [];
    return [{ id, name: locationName(row), location_type: String(row.location_type || "restaurant") }];
  });
}

function contextOf(row: ConversationRow): ConversationContext {
  const value = row.context;
  if (value && typeof value === "object" && Array.isArray(value.locations)) return value;
  return {
    source: row.reservation_id ? "internal_reservation" : "outing",
    verification_source: row.reservation_id ? "internal_reservation" : "sms_self_confirmed",
    verification_level: row.reservation_id ? "system_verified" : "self_confirmed",
    locations: [],
  };
}

function currentLocation(row: ConversationRow) {
  const context = contextOf(row);
  return context.locations.find((location) => location.id === row.current_location_id) || context.locations[0] || null;
}

function nextLocation(row: ConversationRow) {
  const queue = Array.isArray(row.location_queue) ? row.location_queue : [];
  if (!row.current_location_id) return queue[0] || null;
  const index = queue.indexOf(row.current_location_id);
  return index >= 0 ? queue[index + 1] || null : queue[0] || null;
}

function parseAttendance(text: string) {
  const value = text.trim().toLowerCase().replace(/[.!?]+$/g, "");
  if (/^(yes|y|yeah|yep|yea|sure|i did|we did|i went|we went|went|made it|we made it)\b/.test(value)) return true;
  if (/^(no|n|nope|nah|didn.t|did not|couldn.t|could not|never made it|we didn.t|we did not)\b/.test(value)) return false;
  return null;
}

function parseRating(text: string) {
  const value = text.trim().toLowerCase();
  const match = value.match(/(?:^|\D)([1-5])(?:\D|$)/);
  if (match) return Number(match[1]);
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
  for (const [word, rating] of Object.entries(words)) {
    if (new RegExp(`\\b${word}\\b`, "i").test(value)) return rating;
  }
  return null;
}

async function sendReviewSms(phone: string, body: string) {
  const result = await sendConciergeSms({ to: phone, body });
  await supabaseAdmin.from("sms_logs").insert({
    customer_phone: phone,
    message_type: "outgoing_concierge_review",
    message_body: body,
    provider: "telnyx",
    provider_message_id: result.id,
    status: result.status || "queued",
    sent_at: new Date().toISOString(),
  });
  return result;
}

async function existingActive(phone: string) {
  const { data, error } = await supabaseAdmin
    .from("sms_review_conversations")
    .select("*")
    .eq("phone_e164", phone)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  return data as ConversationRow | null;
}

async function createConversation(input: {
  phone: string;
  outingId?: string | null;
  reservationId?: string | null;
  userId?: string | null;
  customerName?: string | null;
  locations: LocationContext[];
  attendanceVerified: boolean;
}) {
  const phone = normalizePhone(input.phone);
  if (!phone || !input.locations.length) return { ok: true, sent: false, skipped: true, reason: "missing_phone_or_locations" };

  const active = await existingActive(phone);
  if (active) {
    const sameSource = input.outingId ? active.outing_id === input.outingId : active.reservation_id === input.reservationId;
    return sameSource
      ? { ok: true, sent: false, alreadyActive: true, fulfilled: true, conversationId: active.id }
      : { ok: true, sent: false, skipped: true, reason: "another_review_conversation_active" };
  }

  const verificationSource = input.attendanceVerified ? "internal_reservation" : (input.userId ? "user_sms_self_confirmed" : "guest_sms_self_confirmed");
  const context: ConversationContext = {
    customer_name: input.customerName || null,
    source: input.attendanceVerified ? "internal_reservation" : "outing",
    verification_source: verificationSource,
    verification_level: input.attendanceVerified ? "system_verified" : "self_confirmed",
    locations: input.locations,
    ratings: {},
    reviews: {},
  };
  const stage = input.attendanceVerified ? "location_rating" : "attendance";
  const first = input.locations[0];
  const expiresAt = new Date(Date.now() + ACTIVE_TTL_MS).toISOString();
  const { data: created, error } = await supabaseAdmin
    .from("sms_review_conversations")
    .insert({
      phone_e164: phone,
      channel_number: CHANNEL_NUMBER,
      outing_id: input.outingId || null,
      reservation_id: input.reservationId || null,
      user_id: input.userId || null,
      status: "active",
      stage,
      current_location_id: first.id,
      location_queue: input.locations.map((location) => location.id),
      context,
      expires_at: expiresAt,
    })
    .select("*")
    .single();
  if (error) throw error;

  const name = firstName(input.customerName);
  const hello = name ? `Hey ${name} —` : "Hey —";
  const message = input.attendanceVerified
    ? `${hello} hope you had a good time at ${first.name}. How would you rate ${first.name} from 1–5?`
    : input.locations.length > 1
      ? `${hello} did you end up going to your TheOutHaven plan — ${input.locations.map((location) => location.name).join(" + ")}? Reply YES or NO.`
      : `${hello} did you end up going to ${first.name}? Reply YES or NO.`;

  try {
    await sendReviewSms(phone, message);
    await supabaseAdmin.from("sms_review_conversations").update({ last_outbound_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", created.id);
    return { ok: true, sent: true, fulfilled: true, conversationId: created.id };
  } catch (error) {
    await supabaseAdmin.from("sms_review_conversations").update({ status: "cancelled", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", created.id);
    throw error;
  }
}

async function accountSmsContact(userId: string | null) {
  if (!userId) return { phone: null as string | null, allowed: false };
  const [{ data: user }, { data: profile }] = await Promise.all([
    supabaseAdmin.from("users").select("phone").eq("id", userId).maybeSingle(),
    supabaseAdmin.from("user_profiles").select("sms_opt_in").eq("user_id", userId).maybeSingle(),
  ]);
  return { phone: profile?.sms_opt_in ? normalizePhone(user?.phone) : null, allowed: Boolean(profile?.sms_opt_in && user?.phone) };
}

export async function startOutingSmsReviewConversation(outingId: string) {
  const { data: outing, error } = await supabaseAdmin
    .from("outings")
    .select("id,user_id,guest_phone,guest_name,sms_opt_in,location_id,restaurant_location_id,activity_location_id")
    .eq("id", outingId)
    .maybeSingle();
  if (error || !outing) throw new Error(error?.message || "Outing not found");
  const account = await accountSmsContact(outing.user_id || null);
  const phone = outing.user_id ? account.phone : (outing.sms_opt_in ? normalizePhone(outing.guest_phone) : null);
  if (!phone) return { ok: true, sent: false, skipped: true, reason: "sms_not_available" };
  const locationIds = uniqueIds([outing.restaurant_location_id, outing.activity_location_id, outing.location_id]);
  const locations = await loadLocations(locationIds);
  return createConversation({
    phone,
    outingId: outing.id,
    userId: outing.user_id || null,
    customerName: outing.guest_name || null,
    locations,
    attendanceVerified: false,
  });
}

export async function startReservationSmsReviewConversation(reservationId: string) {
  const { data: reservation, error } = await supabaseAdmin
    .from("location_reservations")
    .select("id,location_id,status,seated_at,completed_at,customer_name,customer_phone,user_id")
    .eq("id", reservationId)
    .maybeSingle();
  if (error || !reservation) throw new Error(error?.message || "Reservation not found");
  const verified = ["seated", "completed"].includes(String(reservation.status || "")) || Boolean(reservation.seated_at || reservation.completed_at);
  if (!verified) return { ok: true, sent: false, skipped: true, reason: "attendance_not_verified" };
  const phone = normalizePhone(reservation.customer_phone);
  if (!phone) return { ok: true, sent: false, skipped: true, reason: "sms_not_available" };
  const locations = await loadLocations([String(reservation.location_id)]);
  return createConversation({
    phone,
    reservationId: reservation.id,
    userId: reservation.user_id || null,
    customerName: reservation.customer_name || null,
    locations,
    attendanceVerified: true,
  });
}

async function ensureEligibility(row: ConversationRow, locationId: string) {
  const context = contextOf(row);
  let query = supabaseAdmin.from("location_review_eligibility").select("*").eq("location_id", locationId);
  if (row.outing_id) query = query.eq("outing_id", row.outing_id);
  else query = query.eq("reservation_id", row.reservation_id);
  const { data: existing, error: existingError } = await query.maybeSingle();
  if (existingError) throw existingError;
  if (existing) return existing;

  const token = generateReviewToken();
  const sourceRecord = row.outing_id
    ? await supabaseAdmin.from("outings").select("guest_session_id,guest_email,guest_name").eq("id", row.outing_id).maybeSingle()
    : { data: null as any };
  const { data, error } = await supabaseAdmin
    .from("location_review_eligibility")
    .insert({
      location_id: locationId,
      user_id: row.user_id || null,
      outing_id: row.outing_id || null,
      reservation_id: row.reservation_id || null,
      guest_session_id: sourceRecord.data?.guest_session_id || null,
      guest_email: sourceRecord.data?.guest_email || null,
      source: context.verification_source,
      status: "eligible",
      review_token: token,
      review_token_expires_at: new Date(Date.now() + REVIEW_TTL_MS).toISOString(),
      metadata: {
        created_from: "sms_review_conversation",
        conversation_id: row.id,
        verification_level: context.verification_level,
        submission_channel: "sms",
      },
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function createLocationReview(row: ConversationRow, location: LocationContext, rating: number, reviewText: string) {
  const eligibility = await ensureEligibility(row, location.id);
  const existingQuery = supabaseAdmin.from("location_reviews").select("id,status").eq("location_id", location.id).limit(1);
  if (row.outing_id) existingQuery.eq("outing_id", row.outing_id);
  else existingQuery.eq("reservation_id", row.reservation_id);
  const { data: existing, error: existingError } = await existingQuery.maybeSingle();
  if (existingError) throw existingError;
  if (existing) return existing;

  const context = contextOf(row);
  const ai = await analyzeReview(reviewText);
  const safeKeywords = Array.isArray(ai.keywords) ? ai.keywords : [];
  const safeScoreBoost = Math.min(10, Math.max(-10, Number(ai.score_boost || 0)));
  const submittedAt = new Date().toISOString();
  const isActivity = location.location_type === "activity";
  const { data: review, error } = await supabaseAdmin
    .from("location_reviews")
    .insert({
      location_id: location.id,
      location_type: isActivity ? "activity" : "restaurant",
      activity_id: isActivity ? location.id : null,
      restaurant_id: isActivity ? null : location.id,
      customer_name: context.customer_name || "TheOutHaven Guest",
      rating,
      review_text: reviewText,
      body: reviewText,
      user_id: row.user_id || null,
      outing_id: row.outing_id || null,
      reservation_id: row.reservation_id || null,
      guest_session_id: eligibility.guest_session_id || null,
      guest_email: eligibility.guest_email || null,
      guest_name: context.customer_name || null,
      verified_visit: true,
      is_verified_visit: context.verification_level === "system_verified",
      verification_source: context.verification_source,
      verified_at: submittedAt,
      review_token: eligibility.review_token,
      review_token_expires_at: eligibility.review_token_expires_at,
      review_token_used_at: submittedAt,
      status: "pending",
      ai_keywords: safeKeywords,
      ai_sentiment: ai.sentiment || "neutral",
      ai_score_boost: safeScoreBoost,
      vibe: ai.vibe || "casual",
      noise_level: ai.noise_level || "moderate",
      date_night: Boolean(ai.date_night),
      group_friendly: Boolean(ai.group_friendly),
      family_friendly: Boolean(ai.family_friendly),
      occasion_fit: Array.isArray(ai.occasion_fit) ? ai.occasion_fit : [],
      service_quality: ai.service_quality || "mixed",
      food_quality: ai.food_quality || "mixed",
      ambiance_quality: ai.ambiance_quality || "mixed",
      price_feeling: ai.price_feeling || "fair",
      wait_time: ai.wait_time || "unknown",
      reservation_recommended: Boolean(ai.reservation_recommended),
      best_for: Array.isArray(ai.best_for) ? ai.best_for : [],
      avoid_if: Array.isArray(ai.avoid_if) ? ai.avoid_if : [],
      metadata: {
        submission_channel: "sms",
        sms_conversation_id: row.id,
        verification_level: context.verification_level,
      },
    })
    .select("id,status")
    .single();
  if (error) throw error;

  await supabaseAdmin
    .from("location_review_eligibility")
    .update({ status: "reviewed", review_id: review.id, reviewed_at: submittedAt })
    .eq("id", eligibility.id);
  await trackEvent({
    event_name: "verified_review_submitted",
    user_id: row.user_id,
    outing_id: row.outing_id,
    location_id: location.id,
    metadata: {
      source: context.verification_source,
      submission_channel: "sms",
      verification_level: context.verification_level,
      reservation_id: row.reservation_id,
    },
  });
  return review;
}

async function updateConversation(row: ConversationRow, patch: Record<string, unknown>) {
  const { data, error } = await supabaseAdmin
    .from("sms_review_conversations")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("status", "active")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return (data || row) as ConversationRow;
}

async function sendAndTouch(row: ConversationRow, body: string) {
  await sendReviewSms(row.phone_e164, body);
  await updateConversation(row, { last_outbound_at: new Date().toISOString() });
}

async function moveToPlatformRating(row: ConversationRow) {
  await updateConversation(row, { stage: "platform_rating", current_location_id: null });
  await sendAndTouch(row, "Last one — how did TheOutHaven do helping you plan or book the outing? Rate us from 1–5.");
}

async function finishPlatformFeedback(row: ConversationRow, feedback: string | null) {
  const context = contextOf(row);
  const submittedAt = new Date().toISOString();
  const nextContext: ConversationContext = { ...context, platform_feedback: feedback };
  let eligibilityQuery = supabaseAdmin.from("location_review_eligibility").select("id,metadata");
  if (row.outing_id) eligibilityQuery = eligibilityQuery.eq("outing_id", row.outing_id);
  else eligibilityQuery = eligibilityQuery.eq("reservation_id", row.reservation_id);
  const { data: eligibilities } = await eligibilityQuery;
  await Promise.all((eligibilities || []).map((eligibility: any) => {
    const metadata = eligibility.metadata && typeof eligibility.metadata === "object" ? eligibility.metadata : {};
    return supabaseAdmin.from("location_review_eligibility").update({
      metadata: {
        ...metadata,
        theouthaven_experience: {
          rating: nextContext.platform_rating || null,
          feedback,
          submitted_at: submittedAt,
          submission_channel: "sms",
        },
      },
    }).eq("id", eligibility.id);
  }));
  await supabaseAdmin.from("sms_review_conversations").update({
    context: nextContext,
    stage: "complete",
    status: "completed",
    completed_at: submittedAt,
    last_outbound_at: submittedAt,
    updated_at: submittedAt,
  }).eq("id", row.id).eq("status", "active");
  await sendReviewSms(row.phone_e164, "Thanks — you’re all set. Your location review will show on TheOutHaven after moderation. Really appreciate the feedback.");
}

export async function processSmsReviewReply(input: { from: string; body: string; providerMessageId?: string | null; eventId?: string | null }) {
  const phone = normalizePhone(input.from);
  if (!phone) return { handled: false };
  const { data, error } = await supabaseAdmin
    .from("sms_review_conversations")
    .select("*")
    .eq("phone_e164", phone)
    .eq("channel_number", CHANNEL_NUMBER)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  if (!data) return { handled: false };
  let row = data as ConversationRow;

  if (new Date(row.expires_at).getTime() < Date.now()) {
    await supabaseAdmin.from("sms_review_conversations").update({ status: "expired", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", row.id);
    return { handled: false, expired: true };
  }

  const rawText = String(input.body || "").trim();
  if (!rawText) return { handled: true, action: "empty_reply" };
  await Promise.all([
    supabaseAdmin.from("sms_logs").insert({
      reservation_id: row.reservation_id || null,
      customer_phone: phone,
      message_type: "incoming_concierge_review",
      message_body: rawText,
      provider: "telnyx",
      provider_message_id: input.providerMessageId || null,
      status: "received",
      created_at: new Date().toISOString(),
    }),
    updateConversation(row, { last_inbound_at: new Date().toISOString() }),
  ]);

  const context = contextOf(row);
  const current = currentLocation(row);

  if (row.stage === "attendance") {
    const attendance = parseAttendance(rawText);
    if (attendance === null) {
      await sendAndTouch(row, "Just reply YES if you went, or NO if you didn’t make it.");
      return { handled: true, action: "attendance_clarification" };
    }
    if (!attendance) {
      if (row.outing_id) {
        await supabaseAdmin.from("outings").update({
          attendance_declined_at: new Date().toISOString(),
          attendance_declined_source: row.user_id ? "user_sms" : "guest_sms",
          status: "cancelled",
        }).eq("id", row.outing_id);
      }
      await supabaseAdmin.from("sms_review_conversations").update({ status: "completed", stage: "complete", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", row.id);
      await sendReviewSms(phone, "Got it — thanks for letting me know. Hope we can help you plan the next one.");
      return { handled: true, action: "attendance_declined" };
    }

    if (row.outing_id) {
      await supabaseAdmin.from("outings").update({
        attendance_confirmed_at: new Date().toISOString(),
        attendance_confirmed_source: row.user_id ? "user_sms" : "guest_sms",
        likely_visit_at: new Date().toISOString(),
        status: "completed",
        visit_verification_level: "likely_visited",
        visit_verification_source: row.user_id ? "user_sms_self_confirmed" : "guest_sms_self_confirmed",
      }).eq("id", row.outing_id);
    }
    for (const location of context.locations) await ensureEligibility(row, location.id);
    row = await updateConversation(row, { stage: "location_rating" });
    if (current) await sendAndTouch(row, `Nice — how would you rate ${current.name} from 1–5?`);
    return { handled: true, action: "attendance_confirmed" };
  }

  if (row.stage === "location_rating") {
    if (!current) {
      await moveToPlatformRating(row);
      return { handled: true, action: "platform_rating_started" };
    }
    const rating = parseRating(rawText);
    if (!rating) {
      await sendAndTouch(row, `Send a number from 1–5 for ${current.name}.`);
      return { handled: true, action: "rating_clarification" };
    }
    const nextContext: ConversationContext = {
      ...context,
      ratings: { ...(context.ratings || {}), [current.id]: rating },
    };
    row = await updateConversation(row, { stage: "location_text", context: nextContext });
    await sendAndTouch(row, `What stood out about ${current.name} — food, service, vibe, anything you’d change? A sentence or two is perfect. Reply SKIP if you only want to leave the rating.`);
    return { handled: true, action: "location_rating_recorded" };
  }

  if (row.stage === "location_text") {
    if (!current) {
      await moveToPlatformRating(row);
      return { handled: true, action: "platform_rating_started" };
    }
    const rating = Number(context.ratings?.[current.id] || 0);
    const skip = /^skip$/i.test(rawText);
    if (!skip && rawText.length < 10) {
      await sendAndTouch(row, "A little more detail would help — even one short sentence. Or reply SKIP to move on.");
      return { handled: true, action: "review_text_clarification" };
    }
    if (!skip && rating) await createLocationReview(row, current, rating, rawText.slice(0, 4000));
    const nextContext: ConversationContext = {
      ...context,
      reviews: { ...(context.reviews || {}), [current.id]: skip ? "" : rawText.slice(0, 4000) },
    };
    const nextId = nextLocation(row);
    if (nextId) {
      const next = nextContext.locations.find((location) => location.id === nextId) || null;
      row = await updateConversation(row, { stage: "location_rating", current_location_id: nextId, context: nextContext });
      if (next) await sendAndTouch(row, `And how was ${next.name}? Rate it from 1–5.`);
      return { handled: true, action: "next_location_started" };
    }
    row = await updateConversation(row, { context: nextContext });
    await moveToPlatformRating(row);
    return { handled: true, action: "locations_complete" };
  }

  if (row.stage === "platform_rating") {
    const rating = parseRating(rawText);
    if (!rating) {
      await sendAndTouch(row, "Send a number from 1–5 for your TheOutHaven experience.");
      return { handled: true, action: "platform_rating_clarification" };
    }
    const nextContext: ConversationContext = { ...context, platform_rating: rating };
    row = await updateConversation(row, { stage: "platform_text", context: nextContext });
    await sendAndTouch(row, "Anything we could’ve done better with the search, plan, reminders, or booking? Reply with feedback, or SKIP if you’re all set.");
    return { handled: true, action: "platform_rating_recorded" };
  }

  if (row.stage === "platform_text") {
    const feedback = /^skip$/i.test(rawText) ? null : rawText.slice(0, 2000);
    await finishPlatformFeedback(row, feedback);
    return { handled: true, action: "review_conversation_completed" };
  }

  return { handled: false };
}

export async function cancelSmsReviewConversation(phoneValue: string) {
  const phone = normalizePhone(phoneValue);
  if (!phone) return;
  await supabaseAdmin.from("sms_review_conversations").update({
    status: "cancelled",
    stage: "complete",
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("phone_e164", phone).eq("status", "active");
}
