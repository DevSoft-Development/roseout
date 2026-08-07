import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { validateTwilioWebhook } from "@/lib/sms/twilio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(req: Request) {
  const formData = await req.formData();
  const params = Object.fromEntries(
    Array.from(formData.entries()).map(([key, value]) => [key, String(value)]),
  );

  const signature = req.headers.get("x-twilio-signature");
  if (!validateTwilioWebhook({ signature, url: req.url, params })) {
    return NextResponse.json({ error: "Invalid Twilio signature." }, { status: 403 });
  }

  const messageSid = asString(formData.get("MessageSid"));
  const messageStatus = asString(formData.get("MessageStatus")) || "unknown";
  const errorCode = asString(formData.get("ErrorCode"));
  const errorMessage = asString(formData.get("ErrorMessage"));

  if (!messageSid) {
    return NextResponse.json({ error: "MessageSid is required." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const update = {
    status: messageStatus,
    error_code: errorCode || null,
    error_message: errorMessage || null,
    status_updated_at: now,
    delivered_at: messageStatus === "delivered" ? now : null,
    failed_at: ["failed", "undelivered"].includes(messageStatus) ? now : null,
  };

  const { data: smsRows, error: smsError } = await supabaseAdmin
    .from("sms_logs")
    .update(update)
    .eq("provider_message_id", messageSid)
    .select("id");

  if (smsError) {
    console.error("Twilio status callback could not update sms_logs", {
      messageSid,
      messageStatus,
      error: smsError.message,
    });
    return NextResponse.json({ error: "Could not persist Twilio status." }, { status: 500 });
  }

  // Marketing sends predate sms_logs and store the Twilio SID in provider_response.
  // Keep their delivery state in sync when a matching row exists.
  const { error: marketingError } = await supabaseAdmin
    .from("marketing_send_logs")
    .update({
      status: messageStatus,
      error_message: errorMessage || (errorCode ? `Twilio error ${errorCode}` : null),
    })
    .contains("provider_response", { sid: messageSid });

  if (marketingError) {
    console.warn("Twilio status callback could not update marketing_send_logs", {
      messageSid,
      error: marketingError.message,
    });
  }

  return NextResponse.json({ success: true, matched: smsRows?.length || 0 });
}
