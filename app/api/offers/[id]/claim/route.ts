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
import { demoMetadata } from "@/lib/demo/demo-center";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const check = await requireTurnstile({
    request,
    token: body.turnstileToken,
    action: "offer_claim",
  });
  if (!check.success) {
    return NextResponse.json({ message: check.error }, { status: check.status });
  }

  let locationId = String(body.locationId || "");
  let offer: any = null;
  if (id !== "demo") {
    const { data } = await supabaseAdmin
      .from("location_offers")
      .select("id,location_id,title,is_active,start_date,end_date")
      .eq("id", id)
      .maybeSingle();
    offer = data;
    locationId = String(data?.location_id || locationId);
  }

  if (!locationId) {
    return NextResponse.json(
      { message: "Please choose an offer before submitting." },
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

  if (id !== "demo" && !offer?.id) {
    return NextResponse.json({ message: "Offer not found." }, { status: 404 });
  }
  if (id !== "demo" && offer?.is_active === false) {
    return NextResponse.json({ message: "This offer is not active." }, { status: 409 });
  }

  const { data: loc } = await supabaseAdmin
    .from("locations")
    .select("name,owner_email,claimed_by_email")
    .eq("id", locationId)
    .maybeSingle();

  const customerEmail = demoWrite.isDemo ? DEMO_CUSTOMER_EMAIL : body.email;
  const customerPhone = demoWrite.isDemo ? null : body.phone;
  const claimMetadata = demoWrite.isDemo
    ? { ...demoMetadata, source: "internal_demo_mirror" }
    : { source: "public_growth_pro" };

  const { data: claim, error: claimError } = await supabaseAdmin
    .from("location_offer_claims")
    .insert({
      offer_id: id === "demo" ? "00000000-0000-0000-0000-000000000000" : id,
      location_id: locationId,
      customer_name: demoWrite.isDemo
        ? body.name || "Demo Offer Guest"
        : body.name,
      customer_email: customerEmail,
      customer_phone: customerPhone,
      status: "claimed",
      metadata: claimMetadata,
    })
    .select("id")
    .single();

  if (claimError) {
    return NextResponse.json(
      { message: "Offer claim could not be saved." },
      { status: 500 },
    );
  }

  await trackGrowthProEvent(locationId, "offer_claim", {
    offerId: id,
    demo: demoWrite.isDemo,
  });
  await createLocationNotificationEvent({
    locationId,
    eventType: "offer_claim_created",
    title: demoWrite.isDemo ? "Demo offer claimed" : "Offer claimed",
    message: demoWrite.isDemo
      ? "An approved staff member ran the TheOutHaven Lounge offer-claim flow."
      : "A customer claimed an offer.",
    priority: "normal",
    metadata: {
      claimId: claim?.id,
      offerTitle: offer?.title,
      customerEmail,
      demo: demoWrite.isDemo,
    },
    businessEmail: demoWrite.isDemo
      ? undefined
      : loc?.owner_email || loc?.claimed_by_email,
    templateKey: "location_offer_claim_created",
  });
  await sendGrowthProEmail(customerEmail, "user_offer_claim_confirmation", {
    locationName: loc?.name || "this location",
    offerTitle: offer?.title || "your offer",
  });

  return NextResponse.json({
    message: demoWrite.isDemo
      ? "Demo offer claim completed through the production offer flow."
      : "Offer claimed. If you shared an email, confirmation is on the way.",
    demo: demoWrite.isDemo,
    claimId: claim?.id,
  });
}
