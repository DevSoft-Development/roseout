import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireLocationPermission, type LocationPermission } from "@/lib/auth/locationOwnerAccess";

async function auth(locationId: string, permission: LocationPermission) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: NextResponse.json({ message: "Not signed in" }, { status: 401 }) };

  const guard = await requireLocationPermission({
    userId: user.id,
    userEmail: user.email ?? null,
    locationId,
    permission,
  });

  if (guard.error) {
    return {
      error: NextResponse.json(
        { message: "You do not have access to this location." },
        { status: guard.error.status },
      ),
    };
  }

  return { access: guard.access };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const locationId = url.searchParams.get("locationId") || "";
  if (!locationId) return NextResponse.json({ message: "Choose a location to view notifications.", notifications: [] }, { status: 400 });

  const guard = await auth(locationId, "location.view");
  if (guard.error) return guard.error;

  const [events, recipients, prefs, deliveries] = await Promise.all([
    supabaseAdmin.from("location_notification_events").select("id,event_type,title,message,priority,read_at,archived_at,created_at,metadata").eq("location_id", locationId).order("created_at", { ascending: false }).limit(50),
    supabaseAdmin.from("location_notification_recipients").select("id,name,email,phone,role,active,created_at").eq("location_id", locationId).order("created_at", { ascending: false }).limit(50),
    supabaseAdmin.from("location_notification_preferences").select("*").eq("location_id", locationId).limit(50),
    supabaseAdmin.from("location_notification_deliveries").select("*").eq("location_id", locationId).order("created_at", { ascending: false }).limit(50),
  ]);

  return NextResponse.json({ message: "Notifications loaded.", notifications: events.data || [], recipients: recipients.data || [], preferences: prefs.data || [], deliveries: deliveries.data || [] });
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  const locationId = String(body.locationId || "");
  const id = String(body.notificationId || "");
  if (!locationId || !id) return NextResponse.json({ message: "Missing notification details." }, { status: 400 });

  const guard = await auth(locationId, "location.edit");
  if (guard.error) return guard.error;

  const updates: any = {};
  if (body.action === "archive") updates.archived_at = new Date().toISOString();
  else updates.read_at = new Date().toISOString();

  await supabaseAdmin.from("location_notification_events").update(updates).eq("id", id).eq("location_id", locationId);
  return NextResponse.json({ message: body.action === "archive" ? "Notification archived." : "Notification marked read." });
}
