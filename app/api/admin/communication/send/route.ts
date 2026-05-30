import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { sendSupportEmail } from "@/lib/email/sendSupportEmail";
import { sendSms } from "@/lib/sms/sendSms";
import { SUPPORT_EMAIL_FROM } from "@/lib/support/ticketing";
import { logEvent } from "@/lib/monitoring";

export async function POST(request: Request) {
  const { error, supabase, adminUser } = await requireAdminApiRole(["superadmin", "admin", "editor"]);
  if (error) return error;
  const body = await request.json();

  const channel = body.channel === "sms" ? "sms" : "email";
  let providerId: string | null = null;
  try {
    if (channel === "email") {
      const result = await sendSupportEmail({ to: body.to, subject: body.subject || "TheOutHaven Support", body: body.body });
      providerId = result.id;
    } else {
      const result = await sendSms({ to: body.to, body: body.body });
      providerId = result.id;
    }
  } catch (sendError) {
    await logEvent("failed_email_sms", { channel, to: body.to, error: sendError instanceof Error ? sendError.message : "send failed" });
    return Response.json({ error: sendError instanceof Error ? sendError.message : "Failed to send message" }, { status: 400 });
  }

  await supabase.from("communication_logs").insert({
    channel,
    direction: "outbound",
    from_address: channel === "email" ? SUPPORT_EMAIL_FROM : process.env.TWILIO_FROM_NUMBER || null,
    to_address: body.to,
    recipient_type: body.recipientType || null,
    recipient_id: body.recipientId || null,
    subject: body.subject || null,
    body: body.body,
    status: "sent",
    provider_message_id: providerId,
    metadata: {},
    created_by: adminUser?.user_id || null,
  });

  if (body.recipientType === "location" && body.recipientId) {
    const { error: locationLogError } = await supabase.from("business_communication_logs").insert({
      location_id: body.recipientId,
      channel,
      direction: "outbound",
      to_address: body.to,
      subject: body.subject || null,
      body: body.body,
      delivery_status: "sent",
      provider_message_id: providerId,
      created_by: adminUser?.user_id || null,
    });
    if (locationLogError) {
      await logEvent("admin_activity", { adminId: adminUser?.user_id || null, action: "business_communication_log_failed", error: locationLogError.message });
    }
  }

  await logEvent("admin_activity", { adminId: adminUser?.user_id || null, action: "send_communication", channel, to: body.to });

  return Response.json({ ok: true, providerMessageId: providerId });
}
