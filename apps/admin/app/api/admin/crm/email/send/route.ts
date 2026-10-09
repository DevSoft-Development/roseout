import { NextResponse } from "next/server";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { CRM_WRITE_ROLES } from "@/lib/crm/permissions";
import { sendRawBrandedEmail } from "@/lib/email/send";

export const dynamic = "force-dynamic";

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(request: Request) {
  try {
    const actor = await requireAdminRole(CRM_WRITE_ROLES);
    const body = await request.json().catch(() => ({}));
    const locationId = clean(body.locationId, 80);
    const subject = clean(body.subject, 300);
    const message = clean(body.body, 10000);
    if (!locationId || !subject || !message) {
      return NextResponse.json({ error: "Location, subject, and message are required." }, { status: 400 });
    }

    const db = getAdminDatabaseClient();
    const { data: location, error } = await db
      .from("locations")
      .select("id,name,owner_email")
      .eq("id", locationId)
      .maybeSingle();
    if (error) throw error;
    if (!location) return NextResponse.json({ error: "Location not found." }, { status: 404 });

    const to = String(location.owner_email || "").trim().toLowerCase();
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return NextResponse.json({ error: "This location does not have a valid owner email." }, { status: 400 });
    }

    const result = await sendRawBrandedEmail({
      to,
      subject,
      heading: subject,
      body: message,
      department: "account",
    });
    if (result.status !== "sent") {
      return NextResponse.json({ error: result.error || "Email delivery failed." }, { status: 502 });
    }

    const now = new Date().toISOString();
    const metadata = { source_system: "crm", source_table: "location_communications", channel: "email" };
    const [communicationLog, activity] = await Promise.all([
      db.from("communication_logs").insert({
        channel: "email",
        direction: "outbound",
        to_address: to,
        recipient_type: "location",
        recipient_id: location.id,
        subject,
        body: message,
        status: "sent",
        provider_message_id: result.id || null,
        created_by: actor.user_id,
        metadata,
      }),
      db.from("crm_activities").insert({
        location_id: location.id,
        actor_user_id: actor.user_id,
        activity_type: "email",
        direction: "outbound",
        channel: "email",
        subject,
        summary: `Email sent to ${location.name || "location"}: ${subject}`,
        body: message,
        occurred_at: now,
        source_system: "crm_communications",
        source_table: "communication_logs",
        visibility: "internal",
        is_system_generated: false,
        metadata: { to, providerMessageId: result.id || null },
      }),
    ]);

    if (communicationLog.error) throw communicationLog.error;
    if (activity.error) console.warn("crm_location_email_activity_log_failed", activity.error.message);

    return NextResponse.json({ success: true, providerMessageId: result.id || null, to });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to send email." }, { status: 403 });
  }
}
