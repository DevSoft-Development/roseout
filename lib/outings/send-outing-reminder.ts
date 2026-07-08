import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendRawBrandedEmail } from "@/lib/email/sender";
import { sendSms } from "@/lib/sms/sendSms";

export type OutingReminderType = "two_hour" | "thirty_minute" | "next_morning_followup" | "review_request";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://theouthaven.com";

function absolute(path: string) {
  return `${SITE_URL.replace(/\/$/, "")}${path}`;
}

function content(type: OutingReminderType) {
  if (type === "two_hour") return { subject: "Your TheOutHaven outing is coming up", body: "Your plan is coming up soon. View your plan, get directions, or update booking details." };
  if (type === "thirty_minute") return { subject: "Heading out soon?", body: "Here’s your outing plan and directions." };
  return { subject: "How did your outing go?", body: "Hope your TheOutHaven plan went well. How did everything go?" };
}

export async function sendOutingReminder(outingId: string, type: OutingReminderType) {
  const { data: outing, error } = await supabaseAdmin.from("outings").select("*").eq("id", outingId).maybeSingle();
  if (error || !outing) throw new Error(error?.message || "Outing not found");

  const planPath = outing.plan_access_token ? `/outings/guest/${outing.plan_access_token}` : `/outings/${outing.id}`;
  const confirmPath = outing.confirm_token ? `/outings/confirm/${outing.confirm_token}` : planPath;
  const email = outing.user_id ? null : outing.guest_email;
  const phone = outing.user_id ? null : outing.guest_phone;
  const { subject, body } = content(type);
  const sent: string[] = [];

  if (email && outing.email_opt_in) {
    await sendRawBrandedEmail({ to: email, subject, heading: subject, body, cta: { label: "View my plan", url: absolute(planPath) } });
    sent.push("email");
  }

  if (phone && outing.sms_opt_in && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER) {
    await sendSms({ to: phone, body: `How did your TheOutHaven outing go? Let us know here: ${absolute(confirmPath)}` });
    sent.push("sms");
  }

  return { ok: true, sent };
}
