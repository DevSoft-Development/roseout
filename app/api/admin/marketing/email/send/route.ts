import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { enqueuePlatformJobs, platformJobGatewayConfigured, type PlatformJob } from "@/lib/aws/platform-jobs";
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

type DeliveryMode = "resend" | "hybrid" | "ses";

function getDeliveryMode(): DeliveryMode {
  const value = String(process.env.EMAIL_DELIVERY_MODE || "resend").trim().toLowerCase();
  if (value === "hybrid" || value === "ses") return value;
  return "resend";
}

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

async function hasQueuedOrSentSesEmail(campaignId: string) {
  const { count, error } = await supabaseAdmin
    .from("marketing_send_logs")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("channel", "email")
    .eq("provider", "ses")
    .in("status", ["pending", "sent", "opened", "clicked"]);
  if (error) throw new Error(error.message);
  return Number(count || 0) > 0;
}

function marketingIdempotencyKey(campaignId: string, email: string) {
  const digest = createHash("sha256")
    .update(`${campaignId}:${email.trim().toLowerCase()}`)
    .digest("hex");
  return `marketing:${digest}`;
}

async function queueSesCampaign(params: {
  campaignId: string;
  subject: string;
  body: string;
  recipients: Recipient[];
}) {
  if (!platformJobGatewayConfigured()) throw new Error("aws_platform_job_gateway_not_configured");
  if (await hasQueuedOrSentSesEmail(params.campaignId)) {
    throw new Error("campaign_email_already_queued_or_sent");
  }

  const sender = resolveEmailSender("marketing");
  const attemptedAt = nowIso();
  const pendingRows = params.recipients.map((recipient) => ({
    campaign_id: params.campaignId,
    subscriber_id: recipient.id || null,
    user_id: recipient.user_id || null,
    channel: "email",
    provider: "ses",
    recipient_email: recipient.email!,
    status: "pending",
    attempted_at: attemptedAt,
    provider_response: {},
    metadata: {
      delivery_mode: "aws_queue",
      idempotency_key: marketingIdempotencyKey(params.campaignId, recipient.email!),
    },
  }));

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("marketing_send_logs")
    .insert(pendingRows)
    .select("id,recipient_email,metadata");
  if (insertError) throw new Error(insertError.message);

  const jobs: PlatformJob[] = (inserted || []).map((row) => {
    const recipientEmail = String(row.recipient_email || "").trim();
    const idempotencyKey = String((row.metadata as Record<string, unknown> | null)?.idempotency_key || marketingIdempotencyKey(params.campaignId, recipientEmail));
    const html = marketingHtml(params.subject, params.body, unsubscribeUrl(
      params.recipients.find((recipient) => recipient.email?.toLowerCase() === recipientEmail.toLowerCase())?.id,
      recipientEmail,
    ));
    return {
      jobType: "email.send",
      idempotencyKey,
      payload: {
        from: sender.from,
        to: recipientEmail,
        replyTo: sender.replyTo,
        subject: params.subject,
        html,
        text: params.body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(),
        tags: {
          channel: "marketing",
          campaign: params.campaignId,
        },
        tracking: {
          marketingSendLogId: row.id,
          campaignId: params.campaignId,
        },
      },
    };
  });

  try {
    const queued = await enqueuePlatformJobs(jobs);
    const failedKeys = new Set(queued.results.filter((item) => !item.accepted).map((item) => item.idempotencyKey));
    const failedIds = (inserted || [])
      .filter((row) => failedKeys.has(String((row.metadata as Record<string, unknown> | null)?.idempotency_key || "")))
      .map((row) => row.id);
    if (failedIds.length) {
      await supabaseAdmin
        .from("marketing_send_logs")
        .update({ status: "failed", error_message: "aws_queue_enqueue_failed" })
        .in("id", failedIds);
    }
    return { queued: queued.accepted, failed: queued.failed, attempted: jobs.length };
  } catch (error) {
    const ids = (inserted || []).map((row) => row.id);
    if (ids.length) {
      await supabaseAdmin
        .from("marketing_send_logs")
        .update({
          status: "failed",
          error_message: error instanceof Error ? error.message.slice(0, 500) : "aws_queue_enqueue_failed",
        })
        .in("id", ids);
    }
    throw error;
  }
}

export async function POST(req: Request) {
  const { error } = await requireMarketingAdminApi();
  if (error) return error;

  const body = await req.json();
  const campaignId = typeof body.campaign_id === "string" ? body.campaign_id : "";
  const confirmed = body.confirm === true;
  const deliveryMode = getDeliveryMode();

  if (!campaignId) return NextResponse.json({ error: "campaign_id is required" }, { status: 400 });
  if (!confirmed) return NextResponse.json({ error: "Confirmation is required before sending a blast." }, { status: 409 });
  if (deliveryMode === "resend" && !process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "RESEND_API_KEY is not configured." }, { status: 500 });
  }
  if (await hasSuccessfulSend(campaignId, "email")) {
    return NextResponse.json({ error: "This campaign already has successful email sends." }, { status: 409 });
  }

  const { data: campaign, error: campaignError } = await loadCampaign(campaignId);
  if (campaignError) return NextResponse.json({ error: campaignError.message }, { status: 500 });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (!campaign.email_subject || !campaign.email_body) {
    return NextResponse.json({ error: "Campaign is missing email subject or body." }, { status: 400 });
  }

  const recipients = await loadEmailRecipients();
  if (!recipients.length) return NextResponse.json({ error: "No opted-in email recipients found." }, { status: 400 });

  if (deliveryMode !== "resend") {
    try {
      const result = await queueSesCampaign({
        campaignId,
        subject: campaign.email_subject,
        body: campaign.email_body,
        recipients,
      });
      await updateCampaignStatus(campaignId, result.queued > 0 ? "scheduled" : "failed");
      return NextResponse.json({
        success: result.failed === 0,
        provider: "ses",
        delivery_mode: deliveryMode,
        queued: result.queued,
        failed: result.failed,
        attempted: result.attempted,
      });
    } catch (queueError) {
      const message = queueError instanceof Error ? queueError.message : "Unable to queue campaign email.";
      if (message === "campaign_email_already_queued_or_sent") {
        return NextResponse.json({ error: "This campaign already has queued or delivered SES email." }, { status: 409 });
      }
      console.error("SES marketing campaign enqueue failed", { campaignId, error: message });
      await updateCampaignStatus(campaignId, "failed");
      return NextResponse.json({ error: "Unable to queue this campaign for email delivery." }, { status: 502 });
    }
  }

  let sent = 0;
  let failed = 0;
  const logs: Array<Record<string, unknown>> = [];

  for (const recipient of recipients) {
    const attemptedAt = nowIso();
    const recipientEmail = recipient.email!;
    try {
      const html = marketingHtml(campaign.email_subject, campaign.email_body, unsubscribeUrl(recipient.id, recipientEmail));
      const result = await sendRenderedEmail({
        to: recipientEmail,
        department: "marketing",
        replyTo: resolveEmailSender("marketing").replyTo,
        rendered: {
          subject: campaign.email_subject,
          preview: campaign.email_subject,
          html,
          text: campaign.email_body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(),
          department: "marketing",
        },
        templateKey: "marketing_campaign",
      });

      if (result.status === "sent") {
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
      } else {
        failed += 1;
        logs.push({
          campaign_id: campaignId,
          subscriber_id: recipient.id || null,
          user_id: recipient.user_id || null,
          channel: "email",
          provider: "resend",
          recipient_email: recipientEmail,
          status: "failed",
          error_message: result.error || "Email provider did not accept the message.",
          attempted_at: attemptedAt,
        });
      }
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
  await updateCampaignStatus(campaignId, failed && !sent ? "failed" : "sent", sent ? { sent_at: nowIso() } : {});

  return NextResponse.json({
    success: failed === 0,
    provider: "resend",
    delivery_mode: deliveryMode,
    sent,
    failed,
    attempted: recipients.length,
  });
}
