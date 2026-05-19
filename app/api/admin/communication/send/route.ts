import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { sendSupportEmail } from "@/lib/email/sendSupportEmail";
import { sendSms } from "@/lib/sms/sendSms";
import { SUPPORT_EMAIL_FROM } from "@/lib/support/ticketing";

export async function POST(request: Request) {
  const { error, supabase, adminUser } = await requireAdminApiRole(["superuser", "admin", "editor"]);
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
    created_by: adminUser?.id || null,
  });

  return Response.json({ ok: true, providerMessageId: providerId });
}
