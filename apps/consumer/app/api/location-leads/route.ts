import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireTurnstile } from "@/lib/security/turnstile";
import { trackGrowthProEvent } from "@/lib/growth-pro/analytics";
import { createLocationNotificationEvent } from "@/lib/growth-pro/notifications";
import { sendGrowthProEmail } from "@/lib/growth-pro/email";
import {
  DEMO_CUSTOMER_EMAIL,
  requireSafeDemoPublicWrite,
} from "@/lib/demo/demo-public-write";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const check = await requireTurnstile({
    request,
    token: body.turnstileToken,
    action: "event_lead",
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

  let demoContext;
  try {
    demoContext = await requireSafeDemoPublicWrite(locationId);
  } catch {
    return NextResponse.json(
      { message: "This demo action is available only to approved staff." },
      { status: 403 },
    );
  }

  const { data: loc } = await supabaseAdmin
    .from("locations")
    .select("name,owner_email,claimed_by_email")
    .eq("id", locationId)
    .maybeSingle();

  const customerEmail = demoContext.isDemo
    ? DEMO_CUSTOMER_EMAIL
    : body.email;
  const customerName = demoContext.isDemo
    ? "Demo Event Guest"
    : body.name;
  const customerPhone = demoContext.isDemo ? "212-555-0199" : body.phone;

  const { data: lead, error } = await supabaseAdmin
    .from("location_leads")
    .insert({
      location_id: locationId,
      lead_type: body.leadType || "private_event",
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhone,
      occasion: body.occasion,
      guest_count: body.guestCount,
      notes: body.notes,
      source: demoContext.isDemo ? "demo_center" : "public_growth_pro",
      status: "new",
      metadata: demoContext.isDemo
        ? {
            demo: true,
            demo_key: "real_location_mirror_demo",
            never_contact: true,
          }
        : {},
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json(
      { message: "We could not save this event request." },
      { status: 500 },
    );
  }

  await createLocationNotificationEvent({
    locationId,
    eventType: "private_event_lead_created",
    title: demoContext.isDemo ? "Demo event lead" : "New event lead",
    message: demoContext.isDemo
      ? "A demo event lead was created for TheOutHaven Lounge."
      : "A customer requested private event or group package information.",
    priority: demoContext.isDemo ? "normal" : "high",
    metadata: {
      leadId: lead?.id,
      customerEmail,
      guestCount: body.guestCount,
      demo: demoContext.isDemo,
    },
    businessEmail: demoContext.isDemo
      ? undefined
      : loc?.owner_email || loc?.claimed_by_email,
    templateKey: "location_private_event_lead_created",
  });

  await sendGrowthProEmail(customerEmail, "user_event_lead_confirmation", {
    locationName: loc?.name || "this location",
  });
  await trackGrowthProEvent(locationId, "event_lead_submitted", {
    demo: demoContext.isDemo,
  });

  return NextResponse.json({
    message: demoContext.isDemo
      ? "Demo event request created through the production lead flow."
      : "Thanks — your event request was sent. If you shared an email, confirmation is on the way.",
  });
}
