import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { MIRROR_DEMO_KEY, getMirrorDemoLocation } from "@/lib/demo/demo-center";
import { getInternalDemoViewer } from "@/lib/demo/internal-demo-access";

const DEMO_CONTEXT = {
  demo: true,
  fromDemoCenter: true,
  type: "restaurant",
};

function isSafeMirror(location: any) {
  return Boolean(
    location?.id &&
      location.demo_key === MIRROR_DEMO_KEY &&
      location.is_demo === true &&
      location.is_hidden === true &&
      location.is_searchable !== true &&
      location.demo_visible_publicly !== true &&
      location.publish_ready !== true,
  );
}

async function readJson(response: Response) {
  return response.json().catch(() => ({}));
}

export async function POST(request: Request) {
  const viewer = await getInternalDemoViewer();
  if (!viewer) {
    return NextResponse.json({ message: "Approved internal access is required." }, { status: 403 });
  }

  const location = await getMirrorDemoLocation();
  if (!isSafeMirror(location)) {
    return NextResponse.json({ message: "The Lounge fixture failed its safety contract." }, { status: 409 });
  }

  const locationId = String(location!.id);
  const origin = new URL(request.url).origin;
  const cookie = request.headers.get("cookie") || "";
  const headers = {
    "content-type": "application/json",
    cookie,
    "user-agent": "TheOutHaven-Lounge-E2E-Smoke/1.0",
  };
  const context = {
    ...DEMO_CONTEXT,
    locationId,
    adminLocationId: locationId,
    demoLocationId: locationId,
  };

  const results: Record<string, any> = {};

  const campaignResponse = await fetch(`${origin}/api/business/messaging/campaigns`, {
    method: "POST",
    headers,
    cache: "no-store",
    body: JSON.stringify({
      ...context,
      name: `Lounge E2E smoke ${new Date().toISOString()}`,
      subject: "Internal demo smoke test",
      body: "Internal TheOutHaven Lounge smoke-test draft. This campaign must never send.",
      channel: "email",
    }),
  });
  const campaign = await readJson(campaignResponse);
  if (!campaignResponse.ok || !campaign?.campaign?.id) {
    return NextResponse.json(
      { message: "Messaging production-path smoke failed.", detail: campaign },
      { status: 502 },
    );
  }
  results.messaging = {
    ok: true,
    id: campaign.campaign.id,
    status: campaign.campaign.status,
    recipientCount: campaign.campaign.recipient_count,
    neverSend: campaign.campaign.metadata?.never_send === true,
  };

  const { data: existingRecipient } = await supabaseAdmin
    .from("location_notification_recipients")
    .select("id")
    .eq("location_id", locationId)
    .eq("email", "admin@theouthaven.com")
    .maybeSingle();

  let recipientResponse: Response;
  if (existingRecipient?.id) {
    recipientResponse = await fetch(`${origin}/api/business/notifications`, {
      method: "PATCH",
      headers,
      cache: "no-store",
      body: JSON.stringify({
        ...context,
        action: "update_recipient",
        recipientId: existingRecipient.id,
        name: "TheOutHaven Demo Admin",
        email: "admin@theouthaven.com",
        role: "admin",
        isPrimary: true,
        isActive: true,
        receivesAll: true,
      }),
    });
  } else {
    recipientResponse = await fetch(`${origin}/api/business/notifications`, {
      method: "POST",
      headers,
      cache: "no-store",
      body: JSON.stringify({
        ...context,
        action: "create_recipient",
        name: "TheOutHaven Demo Admin",
        email: "admin@theouthaven.com",
        role: "admin",
        isPrimary: true,
        isActive: true,
        receivesAll: true,
      }),
    });
  }
  const recipient = await readJson(recipientResponse);
  if (!recipientResponse.ok) {
    return NextResponse.json(
      { message: "Notification-recipient production-path smoke failed.", detail: recipient },
      { status: 502 },
    );
  }
  const { data: verifiedRecipient } = await supabaseAdmin
    .from("location_notification_recipients")
    .select("id,email,phone,metadata")
    .eq("location_id", locationId)
    .eq("email", "admin@theouthaven.com")
    .maybeSingle();
  if (!verifiedRecipient?.id || verifiedRecipient.phone) {
    return NextResponse.json(
      { message: "Notification-recipient safety verification failed." },
      { status: 502 },
    );
  }
  results.notifications = {
    ok: true,
    id: verifiedRecipient.id,
    email: verifiedRecipient.email,
    smsBlocked: verifiedRecipient.phone == null,
  };

  const checkInResponse = await fetch(`${origin}/api/feedback`, {
    method: "POST",
    headers,
    cache: "no-store",
    body: JSON.stringify({
      ...context,
      action: "guest_check_in",
      name: "Demo Check-in Guest",
      email: "demo-customer@theouthaven.com",
      notes: "Internal Lounge production-path smoke test.",
    }),
  });
  const checkIn = await readJson(checkInResponse);
  if (!checkInResponse.ok) {
    return NextResponse.json(
      { message: "Check-in production-path smoke failed.", detail: checkIn },
      { status: 502 },
    );
  }
  const { data: verification } = await supabaseAdmin
    .from("outing_visit_verifications")
    .select("id,verification_type,verification_status,verification_source,metadata")
    .eq("location_id", locationId)
    .eq("verification_type", "guest_check_in")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!verification?.id) {
    return NextResponse.json(
      { message: "Check-in write verification failed." },
      { status: 502 },
    );
  }
  results.checkIn = { ok: true, id: verification.id, status: verification.verification_status };

  const { data: activeOffer } = await supabaseAdmin
    .from("location_offers")
    .select("id,title")
    .eq("location_id", locationId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!activeOffer?.id) {
    return NextResponse.json(
      { message: "No active Lounge offer is available for the production-path smoke test." },
      { status: 409 },
    );
  }

  const offerResponse = await fetch(`${origin}/api/offers/${activeOffer.id}/claim`, {
    method: "POST",
    headers,
    cache: "no-store",
    body: JSON.stringify({
      ...context,
      name: "Demo Offer Guest",
      email: "demo-customer@theouthaven.com",
    }),
  });
  const offer = await readJson(offerResponse);
  if (!offerResponse.ok || !offer?.claimId) {
    return NextResponse.json(
      { message: "Offer-claim production-path smoke failed.", detail: offer },
      { status: 502 },
    );
  }
  results.offerClaim = { ok: true, id: offer.claimId, offerId: activeOffer.id };

  const { data: qr } = await supabaseAdmin
    .from("location_qr_codes")
    .select("id,code,qr_type")
    .eq("location_id", locationId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!qr?.id || !qr.code) {
    return NextResponse.json(
      { message: "No active Lounge QR code is available for the production-path smoke test." },
      { status: 409 },
    );
  }

  const qrResponse = await fetch(`${origin}/q/${encodeURIComponent(qr.code)}`, {
    method: "GET",
    headers: {
      cookie,
      "user-agent": "TheOutHaven-Lounge-E2E-Smoke/1.0",
      referer: `${origin}/internal/demo/theouthaven-lounge`,
    },
    redirect: "manual",
    cache: "no-store",
  });
  if (qrResponse.status < 300 || qrResponse.status >= 400) {
    return NextResponse.json(
      { message: "QR production-path smoke did not return the expected redirect." },
      { status: 502 },
    );
  }
  const { data: scan } = await supabaseAdmin
    .from("location_qr_scan_events")
    .select("id,qr_code_id,location_id,qr_type")
    .eq("location_id", locationId)
    .eq("qr_code_id", qr.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!scan?.id) {
    return NextResponse.json(
      { message: "QR scan write verification failed." },
      { status: 502 },
    );
  }
  results.qrScan = { ok: true, id: scan.id, qrCodeId: qr.id, type: scan.qr_type };

  const allPassed = Object.values(results).every((value: any) => value?.ok === true);
  return NextResponse.json({
    success: allPassed,
    locationId,
    demoKey: MIRROR_DEMO_KEY,
    safe: true,
    results,
  });
}
