import { trackEvent } from "@/lib/analytics/trackEvent";
import { buildShortLinkUrl } from "@/lib/outings/short-links";
import { normalizePhone, sendConciergeSms } from "@/lib/sms/telnyx";
import { supabaseAdmin } from "@/lib/supabase-admin";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://theouthaven.com").replace(/\/$/, "");
const FOLLOWUP_DELAY_MS = 15 * 60 * 1000;
const PROMPT_TTL_MS = 48 * 60 * 60 * 1000;
const FRESH_ATTEMPT_MS = 24 * 60 * 60 * 1000;

export type ExternalBookingDecision = "confirmed" | "failed";

export type ExternalBookingLocation = {
  id: string;
  type: "restaurant" | "activity" | string;
  externalUrl: string;
};

type BookingRow = {
  id: string;
  outing_id: string;
  location_id: string;
  location_type: string | null;
  provider: string | null;
  status: string;
  started_at: string | null;
  confirmed_at: string | null;
  confirmation_source: string | null;
  failed_at: string | null;
  failure_source: string | null;
  followup_phone: string | null;
  followup_sent_at: string | null;
  last_prompt_at: string | null;
  metadata: Record<string, unknown> | null;
};

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value);
}

export function externalBookingProvider(value: string | URL | null | undefined) {
  if (!value) return "External provider";
  try {
    const url = value instanceof URL ? value : new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host.includes("opentable")) return "OpenTable";
    if (host.includes("resy")) return "Resy";
    if (host.includes("sevenrooms")) return "SevenRooms";
    if (host.includes("tock")) return "Tock";
    if (host.includes("yelp")) return "Yelp";
    if (host.includes("google")) return "Google";
    return host || "External provider";
  } catch {
    return "External provider";
  }
}

function yesNo(text: string) {
  const value = text.trim().toLowerCase().replace(/[.!?]+$/g, "");
  if (/^(yes|y|yeah|yep|yea|sure|booked|done|confirmed|got it|i did|we did|i booked|we booked)\b/.test(value)) return true;
  if (/^(no|n|nope|nah|not yet|couldn.t|could not|didn.t|did not|wasn.t able|was not able|failed)\b/.test(value)) return false;
  return null;
}

function wantsReplacement(text: string) {
  return /^(replace|swap|change|change it|find another|another one|different one)\b/i.test(text.trim());
}

function locationName(row: Record<string, unknown> | null | undefined) {
  return String(row?.name || row?.business_name || row?.restaurant_name || row?.activity_name || "that stop");
}

async function getLocation(locationId: string) {
  const { data } = await supabaseAdmin
    .from("locations")
    .select("id,name,business_name,restaurant_name,activity_name,location_type")
    .eq("id", locationId)
    .maybeSingle();
  return data as Record<string, unknown> | null;
}

async function getOuting(outingId: string) {
  const { data } = await supabaseAdmin
    .from("outings")
    .select("id,user_id,guest_session_id,plan_access_token,plan_title,metadata,external_booking_location_id")
    .eq("id", outingId)
    .maybeSingle();
  return data as Record<string, any> | null;
}

function planUrl(outing: Record<string, any> | null) {
  const shortCode = typeof outing?.metadata?.short_code === "string" ? outing.metadata.short_code : null;
  if (shortCode) return `${buildShortLinkUrl(shortCode)}?view=picks`;
  if (outing?.plan_access_token) return `${SITE_URL}/outings/guest/${encodeURIComponent(String(outing.plan_access_token))}`;
  return `${SITE_URL}/create`;
}

async function logOutgoing(phone: string, body: string, messageId: string | null, status: string, locationId?: string | null) {
  await supabaseAdmin.from("sms_logs").insert({
    location_id: isUuid(locationId) ? locationId : null,
    customer_phone: phone,
    message_type: "outgoing_concierge_external_booking",
    message_body: body,
    provider: "telnyx",
    provider_message_id: messageId,
    status: status || "queued",
    sent_at: new Date().toISOString(),
  });
}

async function sendBookingSms(phoneValue: string, body: string, locationId?: string | null) {
  const phone = normalizePhone(phoneValue);
  if (!phone) throw new Error("External booking follow-up phone is missing.");
  const result = await sendConciergeSms({ to: phone, body });
  await logOutgoing(phone, body, result.id, result.status, locationId);
  return result;
}

export async function recomputeExternalBookingSummary(outingId: string) {
  const { data, error } = await supabaseAdmin
    .from("outing_external_bookings")
    .select("id,status")
    .eq("outing_id", outingId);
  if (error) throw error;
  const rows = data || [];
  const required = rows.length;
  const confirmed = rows.filter((row) => row.status === "confirmed").length;
  const complete = required > 0 && confirmed === required;
  await supabaseAdmin.from("outings").update({
    external_bookings_required_count: required,
    external_bookings_confirmed_count: confirmed,
    external_bookings_complete: complete,
  }).eq("id", outingId);
  return { required, confirmed, complete };
}

export async function registerAvailableExternalBookings(input: {
  outingId: string;
  locations: ExternalBookingLocation[];
  followupPhone?: string | null;
}) {
  const phone = normalizePhone(input.followupPhone) || null;
  const rows = input.locations.filter((location) => isUuid(location.id) && Boolean(location.externalUrl)).map((location) => ({
    outing_id: input.outingId,
    location_id: location.id,
    location_type: location.type,
    provider: externalBookingProvider(location.externalUrl),
    status: "available",
    followup_phone: phone,
    metadata: { external_url_host: (() => { try { return new URL(location.externalUrl).hostname; } catch { return null; } })() },
    updated_at: new Date().toISOString(),
  }));
  if (rows.length) {
    const { error } = await supabaseAdmin.from("outing_external_bookings").upsert(rows, { onConflict: "outing_id,location_id", ignoreDuplicates: true });
    if (error) throw error;
  }
  return recomputeExternalBookingSummary(input.outingId);
}

export async function markExternalBookingStarted(input: {
  outingId: string;
  locationId: string;
  locationType?: string | null;
  provider?: string | null;
  followupPhone?: string | null;
  metadata?: Record<string, unknown>;
}) {
  if (!isUuid(input.outingId) || !isUuid(input.locationId)) return null;
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("outing_external_bookings")
    .select("*")
    .eq("outing_id", input.outingId)
    .eq("location_id", input.locationId)
    .maybeSingle();
  if (existingError) throw existingError;

  const now = new Date().toISOString();
  const phone = normalizePhone(input.followupPhone) || null;
  if (existing?.status === "confirmed") {
    await supabaseAdmin.from("outing_external_bookings").update({
      provider: input.provider || existing.provider,
      location_type: input.locationType || existing.location_type,
      followup_phone: phone || existing.followup_phone,
      metadata: { ...(existing.metadata || {}), ...(input.metadata || {}), clicked_after_confirmation_at: now },
      updated_at: now,
    }).eq("id", existing.id);
    return { booking: existing as BookingRow, summary: await recomputeExternalBookingSummary(input.outingId) };
  }

  const payload = {
    outing_id: input.outingId,
    location_id: input.locationId,
    location_type: input.locationType || existing?.location_type || null,
    provider: input.provider || existing?.provider || "External provider",
    status: "started",
    started_at: now,
    confirmed_at: null,
    confirmation_source: null,
    failed_at: null,
    failure_source: null,
    followup_phone: phone || existing?.followup_phone || null,
    followup_sent_at: null,
    last_prompt_at: null,
    metadata: { ...(existing?.metadata || {}), ...(input.metadata || {}) },
    updated_at: now,
  };
  const { data: booking, error } = await supabaseAdmin
    .from("outing_external_bookings")
    .upsert(payload, { onConflict: "outing_id,location_id" })
    .select("*")
    .single();
  if (error) throw error;
  return { booking: booking as BookingRow, summary: await recomputeExternalBookingSummary(input.outingId) };
}

export async function recordExternalBookingDecision(input: {
  outingId: string;
  locationId: string;
  decision: ExternalBookingDecision;
  source: string;
}) {
  const { data: booking, error } = await supabaseAdmin
    .from("outing_external_bookings")
    .select("*")
    .eq("outing_id", input.outingId)
    .eq("location_id", input.locationId)
    .maybeSingle();
  if (error) throw error;
  if (!booking) return { ok: false as const, error: "external_booking_not_found" };

  const now = new Date().toISOString();
  const patch = input.decision === "confirmed"
    ? {
        status: "confirmed",
        confirmed_at: now,
        confirmation_source: input.source,
        failed_at: null,
        failure_source: null,
        updated_at: now,
      }
    : {
        status: "failed",
        failed_at: now,
        failure_source: input.source,
        confirmed_at: null,
        confirmation_source: null,
        updated_at: now,
      };
  const { data: updated, error: updateError } = await supabaseAdmin
    .from("outing_external_bookings")
    .update(patch)
    .eq("id", booking.id)
    .select("*")
    .single();
  if (updateError) throw updateError;

  const outingPatch = input.decision === "confirmed"
    ? {
        external_booking_status: "confirmed",
        external_booking_location_id: input.locationId,
        external_booking_confirmed_at: now,
        external_booking_confirmation_source: input.source,
        external_booking_failed_at: null,
        external_booking_failure_source: null,
      }
    : {
        external_booking_status: "failed",
        external_booking_location_id: input.locationId,
        external_booking_failed_at: now,
        external_booking_failure_source: input.source,
        external_booking_confirmed_at: null,
        external_booking_confirmation_source: null,
      };
  await supabaseAdmin.from("outings").update(outingPatch).eq("id", input.outingId);
  const summary = await recomputeExternalBookingSummary(input.outingId);

  await trackEvent({
    event_name: input.decision === "confirmed" ? "external_reservation_confirmed" : "external_reservation_not_completed",
    event_type: input.decision === "confirmed" ? "conversion" : "booking_followup",
    conversion_step: input.decision === "confirmed" ? "external_booking_confirmed" : "external_booking_failed",
    outing_id: input.outingId,
    location_id: input.locationId,
    source: input.source,
    metadata: {
      provider: booking.provider,
      external_booking_status: input.decision,
      all_external_bookings_complete: summary.complete,
      confirmed_external_bookings: summary.confirmed,
      required_external_bookings: summary.required,
    },
  });

  return { ok: true as const, booking: updated as BookingRow, summary };
}

async function activePromptForPhone(phone: string) {
  const cutoff = new Date(Date.now() - PROMPT_TTL_MS).toISOString();
  const { data, error } = await supabaseAdmin
    .from("outing_external_bookings")
    .select("*")
    .eq("followup_phone", phone)
    .eq("status", "started")
    .not("followup_sent_at", "is", null)
    .gte("followup_sent_at", cutoff)
    .order("followup_sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as BookingRow | null;
}

async function recentFailedForPhone(phone: string) {
  const cutoff = new Date(Date.now() - PROMPT_TTL_MS).toISOString();
  const { data, error } = await supabaseAdmin
    .from("outing_external_bookings")
    .select("*")
    .eq("followup_phone", phone)
    .eq("status", "failed")
    .gte("failed_at", cutoff)
    .order("failed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as BookingRow | null;
}

export async function sendDueExternalBookingFollowups(limit = 100) {
  const now = new Date();
  const nowIso = now.toISOString();
  const promptExpiry = new Date(now.getTime() - PROMPT_TTL_MS).toISOString();
  const dueBefore = new Date(now.getTime() - FOLLOWUP_DELAY_MS).toISOString();
  const freshAfter = new Date(now.getTime() - FRESH_ATTEMPT_MS).toISOString();

  await Promise.all([
    supabaseAdmin.from("outing_external_bookings").update({ status: "abandoned", updated_at: nowIso }).eq("status", "started").not("followup_sent_at", "is", null).lt("followup_sent_at", promptExpiry),
    supabaseAdmin.from("outing_external_bookings").update({ status: "abandoned", updated_at: nowIso }).eq("status", "started").is("followup_sent_at", null).lt("started_at", promptExpiry),
  ]);

  const { data, error } = await supabaseAdmin
    .from("outing_external_bookings")
    .select("*")
    .eq("status", "started")
    .is("followup_sent_at", null)
    .not("followup_phone", "is", null)
    .lte("started_at", dueBefore)
    .gte("started_at", freshAfter)
    .order("started_at", { ascending: true })
    .limit(limit);
  if (error) throw error;

  const sent: string[] = [];
  const skipped: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];
  const phonesHandled = new Set<string>();

  for (const raw of data || []) {
    const booking = raw as BookingRow;
    const phone = normalizePhone(booking.followup_phone);
    if (!phone || phonesHandled.has(phone)) {
      skipped.push(booking.id);
      continue;
    }
    phonesHandled.add(phone);
    try {
      const alreadyWaiting = await activePromptForPhone(phone);
      if (alreadyWaiting) {
        skipped.push(booking.id);
        continue;
      }
      const location = await getLocation(booking.location_id);
      const name = locationName(location);
      const providerSuffix = booking.provider && booking.provider !== "External provider" ? ` through ${booking.provider}` : "";
      const body = `Hey — quick check: were you able to book ${name}${providerSuffix}? Reply YES or NO.`;
      await sendBookingSms(phone, body, booking.location_id);
      await supabaseAdmin.from("outing_external_bookings").update({
        followup_sent_at: nowIso,
        last_prompt_at: nowIso,
        updated_at: nowIso,
      }).eq("id", booking.id).eq("status", "started");
      await supabaseAdmin.from("outings").update({ external_booking_followup_sent_at: nowIso }).eq("id", booking.outing_id).eq("external_booking_location_id", booking.location_id);
      sent.push(booking.id);
    } catch (err) {
      failed.push({ id: booking.id, error: err instanceof Error ? err.message : "unknown_error" });
    }
  }

  return { sent, skipped, failed };
}

export async function processExternalBookingSmsReply(input: { from: string; body: string }) {
  const phone = normalizePhone(input.from);
  if (!phone) return { handled: false };
  const body = String(input.body || "").trim();
  if (!body) return { handled: false };

  const pending = await activePromptForPhone(phone);
  if (pending) {
    const answer = yesNo(body);
    const location = await getLocation(pending.location_id);
    const name = locationName(location);
    if (answer === null) {
      await sendBookingSms(phone, `Just reply YES if you booked ${name}, or NO if you weren’t able to book it.`, pending.location_id);
      return { handled: true, action: "external_booking_clarification" };
    }

    if (answer) {
      const result = await recordExternalBookingDecision({
        outingId: pending.outing_id,
        locationId: pending.location_id,
        decision: "confirmed",
        source: "concierge_sms",
      });
      const ready = result.ok && result.summary.complete;
      await sendBookingSms(
        phone,
        ready
          ? `Perfect — I marked ${name} as booked. Your external bookings for this outing are confirmed.`
          : `Perfect — I marked ${name} as booked. I’ll keep the rest of your outing as-is.`,
        pending.location_id,
      );
      return { handled: true, action: "external_booking_confirmed", ready };
    }

    await recordExternalBookingDecision({
      outingId: pending.outing_id,
      locationId: pending.location_id,
      decision: "failed",
      source: "concierge_sms",
    });
    await sendBookingSms(phone, `No problem — I won’t mark ${name} as booked. If you want to swap just that stop without rebuilding the whole outing, reply REPLACE.`, pending.location_id);
    return { handled: true, action: "external_booking_failed" };
  }

  if (wantsReplacement(body)) {
    const failed = await recentFailedForPhone(phone);
    if (!failed) return { handled: false };
    const [outing, location] = await Promise.all([getOuting(failed.outing_id), getLocation(failed.location_id)]);
    const name = locationName(location);
    const url = planUrl(outing);
    await sendBookingSms(phone, `Absolutely — keep the rest of your outing and replace just ${name}: ${url}`, failed.location_id);
    return { handled: true, action: "external_booking_replace_link_sent" };
  }

  return { handled: false };
}
