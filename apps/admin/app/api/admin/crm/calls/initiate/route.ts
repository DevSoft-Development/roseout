import { NextResponse } from "next/server";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { CRM_WRITE_ROLES } from "@/lib/crm/permissions";
import { normalizePhoneForDial } from "@/lib/integrations/three-cx";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const actor = await requireAdminRole(CRM_WRITE_ROLES);
    const input = await request.json().catch(() => ({}));
    const locationId = String(input?.locationId || "").trim();
    if (!locationId) {
      return NextResponse.json({ error: "locationId is required." }, { status: 400 });
    }

    const db = getAdminDatabaseClient();
    const { data: location, error } = await db
      .from("locations")
      .select("id,name,phone")
      .eq("id", locationId)
      .maybeSingle();
    if (error) throw error;
    if (!location) return NextResponse.json({ error: "Location not found." }, { status: 404 });

    const dialPhone = normalizePhoneForDial(location.phone);
    if (!dialPhone) {
      return NextResponse.json({ error: "This location does not have a callable phone number." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const summary = `3CX outbound call started · to: ${dialPhone}`;
    const { data: activity, error: activityError } = await db
      .from("crm_activities")
      .insert({
        location_id: location.id,
        actor_user_id: actor.user_id,
        activity_type: "phone_call",
        direction: "outbound",
        channel: "phone",
        summary,
        occurred_at: now,
        source_system: "3cx",
        source_table: "admin_crm_call",
        visibility: "internal",
        is_system_generated: false,
        metadata: { state: "initiated", dialPhone },
      })
      .select("id")
      .single();
    if (activityError) throw activityError;

    const { error: logError } = await db.from("communication_logs").insert({
      channel: "phone",
      direction: "outbound",
      to_address: String(location.phone || ""),
      recipient_type: "location",
      recipient_id: location.id,
      subject: "3CX outbound call",
      body: summary,
      status: "initiated",
      metadata: {
        source_system: "crm_3cx",
        source_table: "crm_activities",
        crm_activity_id: activity.id,
        call_state: "initiated",
      },
      created_by: actor.user_id,
    });
    if (logError) console.warn("crm_3cx_communication_log_failed", logError.message);

    return NextResponse.json({ success: true, activityId: activity.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to record call activity." },
      { status: 403 },
    );
  }
}
