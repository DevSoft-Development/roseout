import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  requireLocationPermission,
  type LocationPermission,
} from "@/lib/auth/locationOwnerAccess";
import { MIRROR_DEMO_KEY, SAFE_DEMO_EMAILS } from "@/lib/demo/demo-center";
import { getInternalDemoLocationAccess } from "@/lib/demo/internal-demo-location-access";

function toBoolean(value: unknown) {
  return value === true || value === "1" || value === "true";
}

function first(value: unknown) {
  return Array.isArray(value) ? value[0] : value;
}

async function auth(input: Record<string, any>, permission: LocationPermission) {
  const demoAccess = await getInternalDemoLocationAccess(input);
  if (demoAccess) {
    return {
      access: {
        canonicalLocationId: demoAccess.locationId,
        location: demoAccess.location,
      },
      locationId: demoAccess.locationId,
      isDemo: true,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ message: "Not signed in" }, { status: 401 }) };
  }

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

  return {
    access: guard.access,
    locationId: guard.access.canonicalLocationId,
    isDemo,
  };
}

function paramsObject(url: URL) {
  return Object.fromEntries(url.searchParams.entries());
}

function safeDemoRecipient(email: string) {
  const normalized = email.trim().toLowerCase();
  return normalized === "admin@theouthaven.com" || SAFE_DEMO_EMAILS.has(normalized);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const input = paramsObject(url);
  if (!input.locationId) {
    return NextResponse.json(
      { message: "Choose a location to view notifications.", notifications: [] },
      { status: 400 },
    );
  }

  const guard = await auth(input, "location.view");
  if (guard.error) return guard.error;
  const locationId = guard.locationId!;

  const [events, recipients, prefs, deliveries] = await Promise.all([
    supabaseAdmin
      .from("location_notification_events")
      .select("id,event_type,title,message,priority,status,read_at,archived_at,created_at,metadata")
      .eq("location_id", locationId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabaseAdmin
      .from("location_notification_recipients")
      .select("id,name,email,phone,role,is_primary,is_active,receives_all,created_at,updated_at,metadata")
      .eq("location_id", locationId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabaseAdmin
      .from("location_notification_preferences")
      .select("*")
      .eq("location_id", locationId)
      .order("event_type", { ascending: true })
      .limit(100),
    supabaseAdmin
      .from("location_notification_deliveries")
      .select("*")
      .eq("location_id", locationId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return NextResponse.json({
    message: "Notifications loaded.",
    demo: guard.isDemo,
    locationId,
    notifications: events.data || [],
    recipients: recipients.data || [],
    preferences: prefs.data || [],
    deliveries: deliveries.data || [],
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const guard = await auth(body, "location.edit");
  if (guard.error) return guard.error;
  const locationId = guard.locationId!;
  const action = String(body.action || "");

  if (action === "create_recipient") {
    const email = String(body.email || "").trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ message: "Recipient email is required." }, { status: 400 });
    }
    if (guard.isDemo && !safeDemoRecipient(email)) {
      return NextResponse.json(
        { message: "Demo notification recipients must use a safe TheOutHaven demo/admin email." },
        { status: 400 },
      );
    }

    const { data, error } = await supabaseAdmin
      .from("location_notification_recipients")
      .insert({
        location_id: locationId,
        name: String(body.name || "Notification recipient").trim().slice(0, 120),
        email,
        phone: guard.isDemo ? null : String(body.phone || "").trim() || null,
        role: String(body.role || "owner").trim().slice(0, 60),
        is_primary: Boolean(body.isPrimary),
        is_active: body.isActive !== false,
        receives_all: Boolean(body.receivesAll),
        metadata: guard.isDemo
          ? { demo: true, demo_key: MIRROR_DEMO_KEY, never_sms: true }
          : { source: "business_notification_settings" },
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ message: "Notification recipient could not be saved." }, { status: 500 });
    }
    return NextResponse.json({ success: true, recipient: data, demo: guard.isDemo });
  }

  if (action === "upsert_preference") {
    const eventType = String(body.eventType || "").trim();
    if (!eventType) {
      return NextResponse.json({ message: "Event type is required." }, { status: 400 });
    }
    const payload = {
      location_id: locationId,
      event_type: eventType,
      email_enabled: body.emailEnabled !== false,
      dashboard_enabled: body.dashboardEnabled !== false,
      sms_enabled: guard.isDemo ? false : Boolean(body.smsEnabled),
      digest_only: Boolean(body.digestOnly),
      recipient_role_filter: Array.isArray(body.recipientRoleFilter)
        ? body.recipientRoleFilter
        : [],
      metadata: guard.isDemo
        ? { demo: true, demo_key: MIRROR_DEMO_KEY, never_sms: true }
        : { source: "business_notification_settings" },
      updated_at: new Date().toISOString(),
    };

    const existing = await supabaseAdmin
      .from("location_notification_preferences")
      .select("id")
      .eq("location_id", locationId)
      .eq("event_type", eventType)
      .maybeSingle();

    const result = existing.data?.id
      ? await supabaseAdmin
          .from("location_notification_preferences")
          .update(payload)
          .eq("id", existing.data.id)
          .eq("location_id", locationId)
          .select("*")
          .single()
      : await supabaseAdmin
          .from("location_notification_preferences")
          .insert(payload)
          .select("*")
          .single();

    if (result.error) {
      return NextResponse.json({ message: "Notification preference could not be saved." }, { status: 500 });
    }
    return NextResponse.json({ success: true, preference: result.data, demo: guard.isDemo });
  }

  return NextResponse.json({ message: "Unsupported notification action." }, { status: 400 });
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  const guard = await auth(body, "location.edit");
  if (guard.error) return guard.error;
  const locationId = guard.locationId!;
  const action = String(body.action || "mark_read");

  if (["mark_read", "archive"].includes(action)) {
    const id = String(body.notificationId || "");
    if (!id) {
      return NextResponse.json({ message: "Missing notification details." }, { status: 400 });
    }
    const updates: any =
      action === "archive"
        ? { archived_at: new Date().toISOString() }
        : { read_at: new Date().toISOString(), status: "read" };
    await supabaseAdmin
      .from("location_notification_events")
      .update(updates)
      .eq("id", id)
      .eq("location_id", locationId);
    return NextResponse.json({
      message: action === "archive" ? "Notification archived." : "Notification marked read.",
    });
  }

  if (action === "update_recipient") {
    const id = String(body.recipientId || "");
    const email = String(body.email || "").trim().toLowerCase();
    if (!id || !email) {
      return NextResponse.json({ message: "Recipient id and email are required." }, { status: 400 });
    }
    if (guard.isDemo && !safeDemoRecipient(email)) {
      return NextResponse.json(
        { message: "Demo notification recipients must use a safe TheOutHaven demo/admin email." },
        { status: 400 },
      );
    }
    const { data, error } = await supabaseAdmin
      .from("location_notification_recipients")
      .update({
        name: String(body.name || "Notification recipient").trim().slice(0, 120),
        email,
        phone: guard.isDemo ? null : String(body.phone || "").trim() || null,
        role: String(body.role || "owner").trim().slice(0, 60),
        is_primary: Boolean(body.isPrimary),
        is_active: body.isActive !== false,
        receives_all: Boolean(body.receivesAll),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("location_id", locationId)
      .select("*")
      .single();
    if (error) {
      return NextResponse.json({ message: "Notification recipient could not be updated." }, { status: 500 });
    }
    return NextResponse.json({ success: true, recipient: data, demo: guard.isDemo });
  }

  return NextResponse.json({ message: "Unsupported notification action." }, { status: 400 });
}

export async function DELETE(req: Request) {
  const body = await req.json().catch(() => ({}));
  const guard = await auth(body, "location.edit");
  if (guard.error) return guard.error;
  const locationId = guard.locationId!;
  const recipientId = String(body.recipientId || "");
  if (!recipientId) {
    return NextResponse.json({ message: "Recipient id is required." }, { status: 400 });
  }
  const { error } = await supabaseAdmin
    .from("location_notification_recipients")
    .delete()
    .eq("id", recipientId)
    .eq("location_id", locationId);
  if (error) {
    return NextResponse.json({ message: "Notification recipient could not be removed." }, { status: 500 });
  }
  return NextResponse.json({ success: true, message: "Notification recipient removed." });
}
