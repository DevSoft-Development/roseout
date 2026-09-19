import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

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
  const firstName = cleanString(body.preferred_name, 80);
  const city = cleanString(body.city, 120);
  const month = Number(body.birthday_month);
  const phone = cleanPhone(body.phone ?? body.mobile_number);
  const smsOptIn = Boolean(body.sms_opt_in);

  if (!firstName) return NextResponse.json({ success: false, error: "First name is required." }, { status: 400 });
  if (!city) return NextResponse.json({ success: false, error: "City is required." }, { status: 400 });
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ success: false, error: "Birth month must be between 1 and 12." }, { status: 400 });
  }
  if ((body.phone || body.mobile_number) && !phone) {
    return NextResponse.json({ success: false, error: "Enter a valid phone number or leave it blank." }, { status: 400 });
  }
  if (smsOptIn && !phone) {
    return NextResponse.json({ success: false, error: "A phone number is required to enable text messages." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const payload = {
    user_id: user.id,
    preferred_name: firstName,
    city,
    birthday_month: month,
    mobile_number: phone,
    sms_opt_in: smsOptIn,
    sms_opt_in_at: smsOptIn ? now : null,
    sms_opt_in_source: smsOptIn ? "user_dashboard" : null,
    sms_opt_in_phone: smsOptIn ? phone : null,
    updated_at: now,
  };

  const { data, error } = await supabaseAdmin
    .from("user_profiles")
    .upsert(payload, { onConflict: "user_id" })
    .select("preferred_name,city,birthday_month,mobile_number,sms_opt_in")
    .single();

  if (error) return NextResponse.json({ success: false, error: "Could not update your profile." }, { status: 400 });
  return NextResponse.json({ success: true, profile: data });
}
