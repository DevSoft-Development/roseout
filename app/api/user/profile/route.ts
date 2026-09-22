import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeZip } from "@/lib/geo/geo-area";

function cleanString(value: unknown, max = 160) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanPhone(value: unknown) {
  const raw = cleanString(value, 40);
  if (!raw) return null;
  const normalized = raw.replace(/[^+\d]/g, "");
  return normalized.length >= 7 && normalized.length <= 20 ? normalized : null;
}

export async function PATCH(req: Request) {
  const session = await createClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const firstName = cleanString(body.first_name ?? body.preferred_name, 80);
  const zip = normalizeZip(body.home_zip_code ?? body.zip_code);
  const month = Number(body.birth_month ?? body.birthday_month);
  const phone = cleanPhone(body.phone_e164 ?? body.phone ?? body.mobile_number);
  const smsConsent = Boolean(body.sms_consent ?? body.sms_opt_in);

  if (!firstName) return NextResponse.json({ success: false, error: "First name is required." }, { status: 400 });
  if (!zip) return NextResponse.json({ success: false, error: "A valid 5-digit ZIP code is required." }, { status: 400 });
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ success: false, error: "Birth month must be between 1 and 12." }, { status: 400 });
  }
  if ((body.phone_e164 || body.phone || body.mobile_number) && !phone) {
    return NextResponse.json({ success: false, error: "Enter a valid phone number or leave it blank." }, { status: 400 });
  }
  if (smsConsent && !phone) {
    return NextResponse.json({ success: false, error: "A phone number is required to enable text messages." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const payload = {
    user_id: user.id,
    first_name: firstName,
    home_zip_code: zip,
    birth_month: month,
    phone_e164: phone,
    sms_consent: smsConsent,
    sms_consent_at: smsConsent ? now : null,
    sms_consent_source: smsConsent ? "user_dashboard" : null,
    sms_consent_text: smsConsent
      ? "I agree to receive SMS messages from TheOutHaven about my account, saved plans, OUTing reminders, reservations, and optional offers."
      : null,
    updated_at: now,
  };

  const { data, error } = await supabaseAdmin
    .from("consumer_profiles")
    .upsert(payload, { onConflict: "user_id" })
    .select("first_name,home_zip_code,home_neighborhood,home_borough,home_city,home_county,home_state,home_market,birth_month,phone_e164,sms_consent,personalization_enabled")
    .single();

  if (error) return NextResponse.json({ success: false, error: "Could not update your profile." }, { status: 400 });
  return NextResponse.json({ success: true, profile: data });
}
