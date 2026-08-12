import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireLocationPermission } from "@/lib/auth/locationOwnerAccess";
import { MIRROR_DEMO_KEY } from "@/lib/demo/demo-center";

function toBoolean(value: unknown) {
  return value === true || value === "1" || value === "true";
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Not signed in" }, { status: 401 });
  }

  const guard = await requireLocationPermission({
    userId: user.id,
    userEmail: user.email ?? null,
    locationId: body.locationId,
    adminLocationId: body.adminLocationId,
    demoLocationId: body.demoLocationId,
    sourceId: body.sourceId,
    type: body.type,
    demo: toBoolean(body.demo),
    fromDemoCenter: toBoolean(body.fromDemoCenter),
    allowDemoPreview: true,
    permission: "marketing.edit",
  });

  if (guard.error || !guard.access?.canonicalLocationId) {
    return NextResponse.json(
      { message: "You do not have access to this location." },
      { status: guard.error?.status || 403 },
    );
  }

  const locationId = guard.access.canonicalLocationId;
  const location = guard.access.location || {};
  const isDemo =
    (location as any).demo_key === MIRROR_DEMO_KEY ||
    (location as any).is_demo === true;

  if (
    isDemo &&
    ((location as any).demo_key !== MIRROR_DEMO_KEY ||
      (location as any).is_demo !== true ||
      (location as any).is_hidden !== true ||
      (location as any).is_searchable === true)
  ) {
    return NextResponse.json(
      { message: "The demo fixture failed its safety contract." },
      { status: 403 },
    );
  }

  const name = String(body.name || "Campaign draft").trim().slice(0, 120);
  const subject = String(body.subject || "").trim().slice(0, 160);
  const content = String(body.body || body.content || "").trim().slice(0, 5000);
  const channel = String(body.channel || "email").toLowerCase();

  if (!name || !content) {
    return NextResponse.json(
      { message: "Campaign name and message are required." },
      { status: 400 },
    );
  }

  if (!["email", "sms"].includes(channel)) {
    return NextResponse.json(
      { message: "Campaign channel must be email or sms." },
      { status: 400 },
    );
  }

  const { data: campaign, error } = await supabaseAdmin
    .from("location_messaging_campaigns")
    .insert({
      location_id: locationId,
      created_by: user.id,
      campaign_type: isDemo ? "demo_mirror" : "location_marketing",
      channel,
      status: "draft",
      name,
      subject: channel === "email" ? subject || null : null,
      body_rendered: content,
      audience_filter: isDemo
        ? { demo_only: true, never_send: true }
        : body.audienceFilter || {},
      recipient_count: 0,
      requires_admin_approval: channel === "sms",
      sms_credits_estimated: 0,
      metadata: isDemo
        ? {
            demo: true,
            demo_key: MIRROR_DEMO_KEY,
            never_send: true,
            source: "internal_full_location_mirror",
          }
        : { source: "business_dashboard" },
    })
    .select("id,status,channel,name,created_at")
    .single();

  if (error) {
    return NextResponse.json(
      { message: "Campaign draft could not be saved." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    campaign,
    demo: isDemo,
    message: isDemo
      ? "Demo campaign draft saved. It cannot send to recipients."
      : "Campaign draft saved.",
  });
}
