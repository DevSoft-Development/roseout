import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendRawBrandedEmail } from "@/lib/email/sender";
import { sendConciergeSms } from "@/lib/sms/telnyx";
import { buildShortLinkUrl } from "@/lib/outings/short-links";
import { ensureShortLink } from "@/lib/short-links/service";
import { startOutingSmsReviewConversation } from "@/lib/reviews/sms-review-conversation";

export type OutingReminderType = "two_hour" | "thirty_minute" | "next_morning_followup" | "review_request";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://theouthaven.com";

function absolute(path: string) {
  return `${SITE_URL.replace(/\/$/, "")}${path}`;
}

function content(type: OutingReminderType) {
  if (type === "two_hour") return { subject: "Your TheOutHaven outing is coming up", body: "Your plan is coming up soon. View your plan, get directions, or update booking details." };
  if (type === "thirty_minute") return { subject: "Heading out soon?", body: "Here’s your outing plan and directions." };
  return { subject: "How did your outing go?", body: "Did you make it to your outing? Tell us what happened and share your feedback about the places and TheOutHaven experience." };
}

async function accountContacts(userId: string | null) {
  if (!userId) return { email: null as string | null, phone: null as string | null, smsOptIn: false };
  const [{ data: user }, { data: profile }] = await Promise.all([
    supabaseAdmin.from("users").select("email,phone").eq("id", userId).maybeSingle(),
    supabaseAdmin.from("user_profiles").select("sms_opt_in").eq("user_id", userId).maybeSingle(),
  ]);
  return {
    email: user?.email || null,
    phone: profile?.sms_opt_in ? user?.phone || null : null,
    smsOptIn: Boolean(profile?.sms_opt_in),
  };
}

export async function sendOutingReminder(outingId: string, type: OutingReminderType) {
  const { data: outing, error } = await supabaseAdmin.from("outings").select("*").eq("id", outingId).maybeSingle();
  if (error || !outing) throw new Error(error?.message || "Outing not found");

  const shortCode = typeof outing.metadata?.short_code === "string" ? outing.metadata.short_code : null;
  const planUrl = shortCode
    ? buildShortLinkUrl(shortCode)
    : absolute(outing.plan_access_token ? `/outings/guest/${outing.plan_access_token}` : `/outings/${outing.id}`);

  const isPostVisit = type === "next_morning_followup" || type === "review_request";
  let confirmUrl = outing.confirm_token
    ? absolute(`/outings/confirm/${outing.confirm_token}`)
    : outing.plan_access_token
      ? absolute(`/outings/guest/${outing.plan_access_token}`)
      : absolute(`/outings/${outing.id}`);

  if (isPostVisit && outing.confirm_token) {
    const followupLink = await ensureShortLink(supabaseAdmin, {
      destinationUrl: confirmUrl,
      linkType: "review_request",
      entityType: "outing",
      entityId: outing.id,
      title: outing.plan_title ? `Follow up: ${outing.plan_title}` : "Outing follow-up",
      metadata: { source: "post_outing_followup" },
    });
    confirmUrl = followupLink.shortUrl;
  }

  const account = await accountContacts(outing.user_id || null);
  const email = outing.user_id ? account.email : outing.guest_email;
  const phone = outing.user_id ? account.phone : outing.guest_phone;
  const allowEmail = outing.user_id ? Boolean(email) : Boolean(email && outing.email_opt_in);
  const allowSms = outing.user_id ? Boolean(phone && account.smsOptIn) : Boolean(phone && outing.sms_opt_in);
  const { subject, body } = content(type);
  const sent: string[] = [];

  if (allowEmail && email) {
    await sendRawBrandedEmail({
      to: email,
      subject,
      heading: subject,
      body,
      cta: isPostVisit
        ? { label: "Tell us how it went", url: confirmUrl }
        : { label: "View my plan", url: planUrl },
    });
    sent.push("email");
  }

  if (allowSms && phone) {
    if (isPostVisit) {
      const conversation = await startOutingSmsReviewConversation(outing.id);
      const fulfilled = "fulfilled" in conversation && Boolean(conversation.fulfilled);
      if (conversation.sent || fulfilled) sent.push("sms");
    } else {
      await sendConciergeSms({
        to: phone,
        body: `TheOutHaven Concierge\n${body}\nView your plan: ${planUrl}\nIf you need directions or any information about your outing, just ask me here.\nReply STOP to opt out.`,
      });
      sent.push("sms");
    }
  }

  return { ok: true, sent, followupUrl: isPostVisit ? confirmUrl : null };
}