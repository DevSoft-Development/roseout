import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendRawBrandedEmail } from "@/lib/email/sender";
import { sendConciergeSms } from "@/lib/sms/telnyx";
import { buildShortLinkUrl } from "@/lib/outings/short-links";

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

  const shortCode = typeof outing.metadata?.short_code === "string" ? outing.metadata.short_code : null;
  const planUrl = shortCode
    ? buildShortLinkUrl(shortCode)
    : absolute(outing.plan_access_token ? `/outings/guest/${outing.plan_access_token}` : `/outings/${outing.id}`);
  const confirmUrl = absolute(outing.confirm_token ? `/outings/confirm/${outing.confirm_token}` : outing.plan_access_token ? `/outings/guest/${outing.plan_access_token}` : `/outings/${outing.id}`);
  const email = outing.user_id ? null : outing.guest_email;
  const phone = outing.user_id ? null : outing.guest_phone;
  const { subject, body } = content(type);
  const sent: string[] = [];

  if (email && outing.email_opt_in) {
    await sendRawBrandedEmail({ to: email, subject, heading: subject, body, cta: { label: "View my plan", url: planUrl } });
    sent.push("email");
  }

  if (phone && outing.sms_opt_in) {
    const smsBody = type === "next_morning_followup" || type === "review_request"
      ? `TheOutHaven Concierge\nHow did your outing go? Let us know here: ${confirmUrl}\nReply STOP to opt out.`
      : `TheOutHaven Concierge\n${body}\nView your plan: ${planUrl}\nReply STOP to opt out.`;
    await sendConciergeSms({ to: phone, body: smsBody });
    sent.push("sms");
  }

  return { ok: true, sent };
}
