import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function cleanContact(body: any) {
  const guest_email = typeof body.guestEmail === "string" ? body.guestEmail.trim().toLowerCase() : undefined;
  const guest_name = typeof body.guestName === "string" ? body.guestName.trim() : undefined;
  const guest_phone = typeof body.guestPhone === "string" ? body.guestPhone.replace(/[^+\d]/g, "") : undefined;
  return { guest_email, guest_name, guest_phone };
}

async function load(token: string) {
  return supabaseAdmin
    .from("outings")
    .select("id,status,location_id,source_location_id,location_type,source_query,guest_email,guest_phone,guest_name,email_opt_in,sms_opt_in,planned_for,timezone,outing_date_context,outing_time_confidence,reminders_enabled,next_morning_followup_enabled,next_morning_followup_date,attendance_confirmed_at,attendance_declined_at,plan_access_token,plan_access_token_expires_at,locations:location_id(id,name,restaurant_name,activity_name,address,neighborhood,borough,rating,main_image,image_url,external_reservation_url,website,phone)")
    .eq("plan_access_token", token)
    .maybeSingle();
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data, error } = await load(token);
  if (error || !data) return NextResponse.json({ ok: false, error: "plan_not_found" }, { status: 404 });
  if (data.plan_access_token_expires_at && new Date(data.plan_access_token_expires_at).getTime() < Date.now()) {
    return NextResponse.json({ ok: false, error: "plan_token_expired" }, { status: 410 });
  }
  return NextResponse.json({ ok: true, outing: data });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data } = await load(token);
  if (!data) return NextResponse.json({ ok: false, error: "plan_not_found" }, { status: 404 });
  if (data.plan_access_token_expires_at && new Date(data.plan_access_token_expires_at).getTime() < Date.now()) return NextResponse.json({ ok: false, error: "plan_token_expired" }, { status: 410 });
  const body = await req.json();
  const patch: Record<string, unknown> = {};
  const contacts = cleanContact(body);
  for (const [key, value] of Object.entries(contacts)) if (value) patch[key] = value;
  if (typeof body.emailOptIn === "boolean") patch.email_opt_in = Boolean(body.emailOptIn) && Boolean(patch.guest_email || data.guest_email);
  if (typeof body.smsOptIn === "boolean") patch.sms_opt_in = Boolean(body.smsOptIn) && Boolean(patch.guest_phone || data.guest_phone);
  const confidence = body.outingTimeConfidence === "exact" || body.outingTimeConfidence === "date_only" || body.outingTimeConfidence === "none" ? body.outingTimeConfidence : data.outing_time_confidence || "none";
  if (confidence === "exact") {
    if (typeof body.plannedFor !== "string" || Number.isNaN(Date.parse(body.plannedFor))) {
      return NextResponse.json({ ok: false, error: "invalid_planned_for", message: "Choose a valid date and time." }, { status: 400 });
    }
    patch.planned_for = body.plannedFor;
    patch.outing_time_confidence = "exact";
    patch.reminders_enabled = Boolean(body.remindersEnabled);
  } else {
    patch.planned_for = null;
    patch.reminders_enabled = false;
    patch.outing_time_confidence = confidence === "date_only" ? "date_only" : "none";
  }
  if (typeof body.outingDateContext === "string" || body.outingDateContext === null) patch.outing_date_context = body.outingDateContext;
  if (typeof body.timezone === "string") patch.timezone = body.timezone;
  if (typeof body.nextMorningFollowupEnabled === "boolean") patch.next_morning_followup_enabled = body.nextMorningFollowupEnabled;
  if (typeof body.nextMorningFollowupDate === "string" || body.nextMorningFollowupDate === null) patch.next_morning_followup_date = body.nextMorningFollowupDate;
  const wantsFollowup = body.nextMorningFollowupEnabled === true;
  const effectiveEmail = String(patch.guest_email || data.guest_email || "").trim();
  const effectiveEmailOptIn = typeof patch.email_opt_in === "boolean" ? patch.email_opt_in : data.email_opt_in;
  if (wantsFollowup && (!effectiveEmail || !effectiveEmailOptIn)) {
    return NextResponse.json({ ok: false, error: "contact_required_for_followup", message: "Add an email so we can send your follow-up." }, { status: 400 });
  }
  if (body.smsOptIn === true && !(patch.guest_phone || data.guest_phone)) {
    return NextResponse.json({ ok: false, error: "phone_required_for_sms", message: "Add a phone number and SMS opt-in to receive text reminders." }, { status: 400 });
  }
  if (wantsFollowup && !patch.next_morning_followup_date && !data.next_morning_followup_date) {
    return NextResponse.json({ ok: false, error: "followup_date_required", message: "A follow-up date is required." }, { status: 400 });
  }
  if (body.externalBookingClicked) patch.reservation_clicked_at = new Date().toISOString();
  if (body.cancel === true) patch.status = "cancelled";

  const { data: updated, error } = await supabaseAdmin.from("outings").update(patch).eq("plan_access_token", token).select("*").single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, outing: updated });
}
