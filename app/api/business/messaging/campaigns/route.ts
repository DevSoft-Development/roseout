import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireLocationPermission } from "@/lib/auth/locationOwnerAccess";
import { MIRROR_DEMO_KEY } from "@/lib/demo/demo-center";

function toBoolean(value: unknown) {
  return value === true || value === "1" || value === "true";
}

function first(value: unknown) {
  return Array.isArray(value) ? value[0] : value;
}

async function resolveAccess(input: Record<string, any>, permission: "marketing.view" | "marketing.edit") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ message: "Not signed in" }, { status: 401 }) };

  const guard = await requireLocationPermission({
    userId: user.id,
    userEmail: user.email ?? null,
    locationId: String(first(input.locationId) || ""),
    adminLocationId: first(input.adminLocationId) as string | undefined,
    demoLocationId: first(input.demoLocationId) as string | undefined,
    sourceId: first(input.sourceId) as string | undefined,
    type: first(input.type) as string | undefined,
    demo: toBoolean(first(input.demo)),
    fromDemoCenter: toBoolean(first(input.fromDemoCenter)),
    allowDemoPreview: true,
    permission,
  });

  if (guard.error || !guard.access?.canonicalLocationId) {
    return {
      error: NextResponse.json(
        { message: "You do not have access to this location." },
        { status: guard.error?.status || 403 },
      ),
    };
  }

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
    return {
      error: NextResponse.json(
        { message: "The demo fixture failed its safety contract." },
        { status: 403 },
      ),
    };
  }

  return { user, locationId: guard.access.canonicalLocationId, isDemo };
}

function paramsObject(url: URL) {
  return Object.fromEntries(url.searchParams.entries());
}

export async function GET(request: Request) {
  const input = paramsObject(new URL(request.url));
  const access = await resolveAccess(input, "marketing.view");
  if (access.error) return access.error;

  const { data, error } = await supabaseAdmin
    .from("location_messaging_campaigns")
    .select("id,location_id,campaign_type,channel,status,name,subject,body_rendered,audience_filter,recipient_count,scheduled_for,sent_at,approved_at,rejected_at,rejected_reason,requires_admin_approval,sms_credits_estimated,sms_credits_used,created_at,updated_at,metadata")
    .eq("location_id", access.locationId!)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ message: "Campaigns could not be loaded." }, { status: 500 });
  }

  return NextResponse.json({ campaigns: data || [], demo: access.isDemo, locationId: access.locationId });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const access = await resolveAccess(body, "marketing.edit");
  if (access.error) return access.error;

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
      location_id: access.locationId,
      created_by: access.user!.id,
      campaign_type: access.isDemo ? "demo_mirror" : "location_marketing",
      channel,
      status: "draft",
      name,
      subject: channel === "email" ? subject || null : null,
      body_rendered: content,
      audience_filter: access.isDemo
        ? { demo_only: true, never_send: true }
        : body.audienceFilter || {},
      recipient_count: 0,
      requires_admin_approval: channel === "sms",
      sms_credits_estimated: 0,
      metadata: access.isDemo
        ? {
            demo: true,
            demo_key: MIRROR_DEMO_KEY,
            never_send: true,
            source: "internal_full_location_mirror",
          }
        : { source: "business_dashboard" },
    })
    .select("*")
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
    demo: access.isDemo,
    message: access.isDemo
      ? "Demo campaign draft saved. It cannot send to recipients."
      : "Campaign draft saved.",
  });
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}));
  const access = await resolveAccess(body, "marketing.edit");
  if (access.error) return access.error;

  const campaignId = String(body.campaignId || "");
  if (!campaignId) {
    return NextResponse.json({ message: "Campaign id is required." }, { status: 400 });
  }

  const { data: existing } = await supabaseAdmin
    .from("location_messaging_campaigns")
    .select("*")
    .eq("id", campaignId)
    .eq("location_id", access.locationId!)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ message: "Campaign was not found." }, { status: 404 });
  }

  const action = String(body.action || "update");
  const updates: Record<string, any> = { updated_at: new Date().toISOString() };

  if (action === "update") {
    if (body.name != null) updates.name = String(body.name).trim().slice(0, 120);
    if (body.subject != null) updates.subject = String(body.subject).trim().slice(0, 160) || null;
    if (body.body != null || body.content != null) {
      updates.body_rendered = String(body.body ?? body.content).trim().slice(0, 5000);
    }
    if (body.channel && ["email", "sms"].includes(String(body.channel).toLowerCase())) {
      updates.channel = String(body.channel).toLowerCase();
      updates.requires_admin_approval = String(body.channel).toLowerCase() === "sms";
    }
  } else if (action === "request_approval") {
    updates.status = "pending_approval";
    updates.requires_admin_approval = true;
  } else if (action === "approve") {
    updates.status = "approved";
    updates.approved_by = access.user!.id;
    updates.approved_at = new Date().toISOString();
    updates.rejected_by = null;
    updates.rejected_at = null;
    updates.rejected_reason = null;
  } else if (action === "reject") {
    updates.status = "rejected";
    updates.rejected_by = access.user!.id;
    updates.rejected_at = new Date().toISOString();
    updates.rejected_reason = String(body.reason || "Rejected in campaign review").slice(0, 500);
  } else if (action === "return_to_draft") {
    updates.status = "draft";
    updates.approved_by = null;
    updates.approved_at = null;
    updates.rejected_by = null;
    updates.rejected_at = null;
    updates.rejected_reason = null;
  } else {
    return NextResponse.json({ message: "Unsupported campaign action." }, { status: 400 });
  }

  if (access.isDemo) {
    updates.recipient_count = 0;
    updates.scheduled_for = null;
    updates.sent_at = null;
    updates.sms_credits_estimated = 0;
    updates.sms_credits_used = 0;
    updates.audience_filter = { demo_only: true, never_send: true };
    updates.metadata = {
      ...(existing.metadata || {}),
      demo: true,
      demo_key: MIRROR_DEMO_KEY,
      never_send: true,
      simulated_approval_state: true,
      source: "internal_full_location_mirror",
    };
  }

  const { data, error } = await supabaseAdmin
    .from("location_messaging_campaigns")
    .update(updates)
    .eq("id", campaignId)
    .eq("location_id", access.locationId!)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ message: "Campaign could not be updated." }, { status: 500 });
  }

  return NextResponse.json({ success: true, campaign: data, demo: access.isDemo });
}

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => ({}));
  const access = await resolveAccess(body, "marketing.edit");
  if (access.error) return access.error;

  const campaignId = String(body.campaignId || "");
  if (!campaignId) {
    return NextResponse.json({ message: "Campaign id is required." }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("location_messaging_campaigns")
    .delete()
    .eq("id", campaignId)
    .eq("location_id", access.locationId!);

  if (error) {
    return NextResponse.json({ message: "Campaign could not be deleted." }, { status: 500 });
  }
  return NextResponse.json({ success: true, message: "Campaign deleted." });
}
