import { NextResponse } from "next/server";
import { renderBrandedEmail } from "@/lib/email/render";
import { sendRenderedEmail } from "@/lib/email/sender";
import { resolveEmailSender } from "@/lib/email/brand";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  hasSuccessfulSend,
  loadCampaign,
  nowIso,
  requireMarketingAdminApi,
  unsubscribeUrl,
  updateCampaignStatus,
} from "@/lib/marketing-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


type MarketingUserRow = {
  id: string;
  email?: string | null;
  full_name?: string | null;
  marketing_opt_in?: boolean | null;
};

type Recipient = {
  id?: string | null;
  user_id?: string | null;
  email?: string | null;
  full_name?: string | null;
  email_opt_in?: boolean | null;
  email_opted_out_at?: string | null;
};

function marketingHtml(subject: string, body: string, unsubscribeHref: string) {
  return renderBrandedEmail({
    department: "marketing",
    subject,
    preview: subject,
    heading: subject,
    intro: body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(),
    secondaryCta: { label: "Manage preferences or unsubscribe", url: unsubscribeHref },
    marketing: true,
  }).html;
}

async function loadEmailRecipients(): Promise<Recipient[]> {
  const [subscribersResult, usersResult] = await Promise.all([
    supabaseAdmin
      .from("marketing_subscribers")
      .select("id,user_id,email,full_name,email_opt_in,email_opted_out_at")
      .eq("email_opt_in", true)
      .is("email_opted_out_at", null)
      .not("email", "is", null)
      .limit(1000),
    supabaseAdmin
      .from("users")
      .select("id,email,full_name,marketing_opt_in")
      .eq("marketing_opt_in", true)
      .not("email", "is", null)
      .limit(1000),
  ]);

  const rows: Recipient[] = [
    ...(subscribersResult.data || []),
    ...((usersResult.data || []) as MarketingUserRow[]).map((user) => ({
      id: null,
      user_id: user.id,
      email: user.email,
      full_name: user.full_name,
      email_opt_in: Boolean(user.marketing_opt_in),
      email_opted_out_at: null,
    })),
  ];

  const seen = new Set<string>();
  return rows.filter((row) => {
    const email = row.email?.toLowerCase();
    if (!email || seen.has(email)) return false;
    seen.add(email);
    return row.email_opt_in !== false && !row.email_opted_out_at;
  });
}

export async function POST(req: Request) {
  const { error } = await requireMarketingAdminApi();
  if (error) return error;

  const body = await req.json();
  const campaignId = typeof body.campaign_id === "string" ? body.campaign_id : "";
  const confirmed = body.confirm === true;

  if (!campaignId) return NextResponse.json({ error: "campaign_id is required" }, { status: 400 });
  if (!confirmed) return NextResponse.json({ error: "Confirmation is required before sending a blast." }, { status: 409 });
  if (!process.env.RESEND_API_KEY) return NextResponse.json({ error: "RESEND_API_KEY is not configured." }, { status: 500 });
  if (await hasSuccessfulSend(campaignId, "email")) return NextResponse.json({ error: "This campaign already has successful email sends." }, { status: 409 });

  const { data: campaign, error: campaignError } = await loadCampaign(campaignId);
  if (campaignError) return NextResponse.json({ error: campaignError.message }, { status: 500 });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (!campaign.email_subject || !campaign.email_body) return NextResponse.json({ error: "Campaign is missing email subject or body." }, { status: 400 });

  const recipients = await loadEmailRecipients();
  if (!recipients.length) return NextResponse.json({ error: "No opted-in email recipients found." }, { status: 400 });

  let sent = 0;
  let failed = 0;
  const logs = [];

  for (const recipient of recipients) {
    const attemptedAt = nowIso();
    const recipientEmail = recipient.email!;
    try {
      const html = marketingHtml(campaign.email_subject, campaign.email_body, unsubscribeUrl(recipient.id, recipientEmail));
      const result = await sendRenderedEmail({
        to: recipientEmail,
        department: "marketing",
        replyTo: resolveEmailSender("marketing").replyTo,
        rendered: { subject: campaign.email_subject, preview: campaign.email_subject, html, text: campaign.email_body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(), department: "marketing" as any },
        templateKey: "marketing_campaign",
      });

      sent += 1;
      logs.push({
        campaign_id: campaignId,
        subscriber_id: recipient.id || null,
        user_id: recipient.user_id || null,
        channel: "email",
        provider: "resend",
        recipient_email: recipientEmail,
        status: "sent",
        provider_response: { id: result.id || null },
        attempted_at: attemptedAt,
        sent_at: nowIso(),
      });
    } catch (sendError: unknown) {
      failed += 1;
      logs.push({
        campaign_id: campaignId,
        subscriber_id: recipient.id || null,
        user_id: recipient.user_id || null,
        channel: "email",
        provider: "resend",
        recipient_email: recipientEmail,
        status: "failed",
        error_message: sendError instanceof Error ? sendError.message : "Email send failed",
        attempted_at: attemptedAt,
      });
    }
  }

  if (logs.length) await supabaseAdmin.from("marketing_send_logs").insert(logs);
  await updateCampaignStatus(campaignId, failed && !sent ? "failed" : "sent", { sent_at: nowIso() });

  return NextResponse.json({ success: failed === 0, sent, failed, attempted: recipients.length });
}
