import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireTurnstile } from "@/lib/security/turnstile";
import { trackGrowthProEvent } from "@/lib/growth-pro/analytics";
import { createLocationNotificationEvent } from "@/lib/growth-pro/notifications";
import { sendGrowthProEmail } from "@/lib/growth-pro/email";
import {
  DEMO_VIP_EMAIL,
  requireSafeDemoPublicWrite,
} from "@/lib/demo/demo-public-write";
import { demoMetadata } from "@/lib/demo/demo-center";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const check = await requireTurnstile({
    request,
    token: body.turnstileToken,
    action: "vip_signup",
  });
  if (!check.success) {
    return NextResponse.json({ message: check.error }, { status: check.status });
  }

  const locationId = String(body.locationId || "");
  if (!locationId) {
    return NextResponse.json(
      { message: "Please choose a location before submitting." },
      { status: 400 },
    );
  }

  let demoWrite;
  try {
    demoWrite = await requireSafeDemoPublicWrite(locationId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("FORBIDDEN") ? 403 : 409;
    return NextResponse.json(
      { message: "This hidden demo can only be changed by approved staff." },
      { status },
    );
  }

  const { data: loc } = await supabaseAdmin
    .from("locations")
    .select("name,owner_email,claimed_by_email")
    .eq("id", locationId)
    .maybeSingle();

  const customerEmail = demoWrite.isDemo ? DEMO_VIP_EMAIL : body.email;
  const customerPhone = demoWrite.isDemo ? null : body.phone;
  const source = demoWrite.isDemo ? "internal_demo_mirror" : body.source || "public_growth_pro";

  const { data: signup, error: signupError } = await supabaseAdmin
    .from("location_vip_signups")
    .insert({
      location_id: locationId,
      name: demoWrite.isDemo ? body.name || "Demo VIP Guest" : body.name,
      email: customerEmail,
      phone: customerPhone,
      birthday_month: body.birthdayMonth,
      interests: body.interests || [],
      source,
      email_consent: Boolean(body.emailConsent || customerEmail),
      sms_consent: demoWrite.isDemo ? false : Boolean(body.smsConsent),
      consent_text: demoWrite.isDemo
        ? "Internal TheOutHaven Lounge demo VIP signup. No real customer contact."
        : "Customer joined this location’s VIP list only.",
      consent_ip_hash: check.ipHash,
      consent_user_agent: request.headers.get("user-agent"),
      consent_at: new Date().toISOString(),
      ...(demoWrite.isDemo ? { metadata: demoMetadata } : {}),
    })
    .select("id")
    .single();

  if (signupError) {
    return NextResponse.json(
      { message: "VIP signup could not be saved." },
      { status: 500 },
    );
  }

  await trackGrowthProEvent(locationId, "vip_signup", {
    demo: demoWrite.isDemo,
  });
  await createLocationNotificationEvent({
    locationId,
    eventType: "vip_signup_created",
    title: demoWrite.isDemo ? "Demo VIP signup" : "New VIP signup",
    message: demoWrite.isDemo
      ? "An approved staff member ran the TheOutHaven Lounge VIP signup flow."
      : "A customer joined your VIP list.",
    priority: "normal",
    metadata: {
      signupId: signup?.id,
      customerEmail,
      demo: demoWrite.isDemo,
    },
    businessEmail: demoWrite.isDemo
      ? undefined
      : loc?.owner_email || loc?.claimed_by_email,
    templateKey: "location_vip_signup_created",
  });
  await sendGrowthProEmail(customerEmail, "user_vip_signup_confirmation", {
    locationName: loc?.name || "this location",
  });

  return NextResponse.json({
    message: demoWrite.isDemo
      ? "Demo VIP signup completed through the production VIP flow."
      : "Thanks — you joined this location’s VIP list. If you shared an email, confirmation is on the way.",
    demo: demoWrite.isDemo,
    signupId: signup?.id,
  });
}
