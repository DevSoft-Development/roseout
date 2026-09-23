import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireTurnstile } from "@/lib/security/turnstile";
import { trackGrowthProEvent } from "@/lib/growth-pro/analytics";
import { createLocationNotificationEvent } from "@/lib/growth-pro/notifications";
import { sendGrowthProEmail } from "@/lib/growth-pro/email";
import { recordLeadEvent } from "@/lib/leads/commercial";
import {
  DEMO_CUSTOMER_EMAIL,
  requireSafeDemoPublicWrite,
} from "@/lib/demo/demo-public-write";

function clean(value: unknown, max = 4000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function uuid(value: unknown) {
  const raw = clean(value, 64);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw) ? raw : null;
}

function attribution(value: unknown) {
  const raw = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const channel = clean(raw.channel_class, 40).toLowerCase();
  return {
    searchId: uuid(raw.search_id),
    sessionId: clean(raw.session_id, 160) || null,
    anonymousId: clean(raw.anonymous_id, 160) || null,
    promotionCampaignId: uuid(raw.promotion_campaign_id),
    channelClass: ["organic", "sponsored", "owned", "unknown"].includes(channel) ? channel : "unknown",
    context: {
      source: clean(raw.source, 120) || null,
      medium: clean(raw.medium, 120) || null,
      campaign: clean(raw.campaign, 160) || null,
    },
  };
}

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

  const locationId = clean(body.locationId, 64);
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
    : clean(body.email, 254).toLowerCase();
  const customerName = demoContext.isDemo
    ? "Demo Event Guest"
    : clean(body.name, 160);
  const customerPhone = demoContext.isDemo ? "212-555-0199" : clean(body.phone, 60);
  const leadType = ["private_event", "catering"].includes(clean(body.leadType, 40))
    ? clean(body.leadType, 40)
    : "private_event";
  const capturedAttribution = attribution(body.attribution);

  if (!customerName || !customerEmail || !customerEmail.includes("@")) {
    return NextResponse.json({ message: "Name and a valid email are required." }, { status: 400 });
  }

  const { data: lead, error } = await supabaseAdmin
    .from("location_leads")
    .insert({
      location_id: locationId,
      lead_type: leadType,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhone || null,
      occasion: clean(body.occasion, 160) || null,
      event_date: clean(body.eventDate, 20) || null,
      event_time: clean(body.eventTime, 40) || null,
      guest_count: Number.isFinite(Number(body.guestCount)) && Number(body.guestCount) > 0 ? Math.round(Number(body.guestCount)) : null,
      budget_range: clean(body.budgetRange, 120) || null,
      food_needs: clean(body.foodNeeds, 2000) || null,
      drink_needs: clean(body.drinkNeeds, 2000) || null,
      private_room_needed: body.privateRoomNeeded === true,
      package_interest: clean(body.packageInterest, 240) || null,
      notes: clean(body.notes, 6000) || null,
      source: demoContext.isDemo ? "demo_center" : "public_growth_pro",
      status: "new",
      commercial_stage: "lead",
      attribution_search_id: capturedAttribution.searchId,
      attribution_session_id: capturedAttribution.sessionId,
      attribution_anonymous_id: capturedAttribution.anonymousId,
      attribution_promotion_campaign_id: capturedAttribution.promotionCampaignId,
      attribution_channel_class: capturedAttribution.channelClass,
      attribution_context: {
        ...capturedAttribution.context,
        captured_at: new Date().toISOString(),
        source_surface: "public_event_lead",
      },
      metadata: demoContext.isDemo
        ? {
            demo: true,
            demo_key: "real_location_mirror_demo",
            never_contact: true,
          }
        : {
            intake_version: 2,
          },
    })
    .select("id,location_id,lead_type")
    .single();

  if (error || !lead) {
    return NextResponse.json(
      { message: "We could not save this event request." },
      { status: 500 },
    );
  }

  await recordLeadEvent({
    leadId: lead.id,
    locationId,
    eventType: "lead_created",
    actor: { type: "customer", email: customerEmail },
    toStage: "lead",
    metadata: {
      lead_type: leadType,
      source: demoContext.isDemo ? "demo_center" : "public_growth_pro",
      channel_class: capturedAttribution.channelClass,
    },
  });

  await createLocationNotificationEvent({
    locationId,
    eventType: leadType === "catering" ? "catering_lead_created" : "private_event_lead_created",
    title: demoContext.isDemo ? "Demo event lead" : leadType === "catering" ? "New catering lead" : "New private event lead",
    message: demoContext.isDemo
      ? "A demo event lead was created for TheOutHaven Lounge."
      : leadType === "catering"
        ? "A customer requested catering information."
        : "A customer requested private event or group package information.",
    priority: demoContext.isDemo ? "normal" : "high",
    metadata: {
      leadId: lead.id,
      customerEmail,
      guestCount: body.guestCount,
      leadType,
      demo: demoContext.isDemo,
    },
    businessEmail: demoContext.isDemo
      ? undefined
      : loc?.owner_email || loc?.claimed_by_email,
    templateKey: "location_private_event_lead_created",
  });

  await sendGrowthProEmail(customerEmail, "user_event_lead_confirmation", {
    subject: leadType === "catering" ? "Your catering request was received" : "Your private event request was received",
    heading: leadType === "catering" ? "Catering request received" : "Private event request received",
    intro: "The venue received your request and can now prepare a proposal, agreement, and secure payment schedule in TheOutHaven.",
    locationName: loc?.name || "this location",
  });
  await trackGrowthProEvent(locationId, leadType === "catering" ? "catering_lead_submitted" : "event_lead_submitted", {
    demo: demoContext.isDemo,
    lead_id: lead.id,
    channel_class: capturedAttribution.channelClass,
  });

  return NextResponse.json({
    leadId: lead.id,
    message: demoContext.isDemo
      ? "Demo event request created through the production lead flow."
      : "Thanks — your request was sent. Confirmation is on the way.",
  });
}
