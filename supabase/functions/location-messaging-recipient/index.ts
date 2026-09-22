import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail } from "../_shared/email.ts";
import { sendTelnyxSmsViaIntegrationApi } from "../_shared/aws-integration.ts";

const url = Deno.env.get("SUPABASE_URL") || "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const workerSecret = Deno.env.get("WORKER_INTERNAL_SECRET") || "";
const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function clean(value: unknown) { return String(value ?? "").trim(); }
function normalizeEmail(value: unknown) { return clean(value).toLowerCase(); }
function normalizePhone(value: unknown) {
  const raw = clean(value);
  if (!raw) return "";
  if (raw.startsWith("+")) return `+${raw.slice(1).replace(/\D/g, "")}`;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return raw;
}
function htmlEscape(value: unknown) {
  return clean(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function bodyHtml(value: unknown) {
  return htmlEscape(value).replace(/\n/g, "<br>");
}
function secureCompare(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

async function recipientStillEligible(recipient: any, campaign: any) {
  const { data: vip } = await db
    .from("location_vip_signups")
    .select("id,email,phone,email_consent,sms_consent,email_unsubscribed_at,sms_unsubscribed_at")
    .eq("id", recipient.vip_signup_id)
    .eq("location_id", campaign.location_id)
    .maybeSingle();
  if (!vip) return { eligible: false, reason: "vip_signup_missing" };

  if (campaign.channel === "email") {
    if (!vip.email_consent || vip.email_unsubscribed_at) return { eligible: false, reason: "email_consent_revoked" };
    if (normalizeEmail(vip.email) !== normalizeEmail(recipient.email)) return { eligible: false, reason: "email_changed" };
  } else {
    if (!vip.sms_consent || vip.sms_unsubscribed_at) return { eligible: false, reason: "sms_consent_revoked" };
    if (normalizePhone(vip.phone) !== normalizePhone(recipient.phone)) return { eligible: false, reason: "phone_changed" };
  }

  const { data: suppressions } = await db
    .from("location_messaging_suppression")
    .select("email,phone,channel")
    .eq("location_id", campaign.location_id);
  for (const suppression of suppressions || []) {
    const applies = !suppression.channel || suppression.channel === campaign.channel || suppression.channel === "all";
    if (!applies) continue;
    if (campaign.channel === "email" && normalizeEmail(suppression.email) === normalizeEmail(recipient.email)) {
      return { eligible: false, reason: "email_suppressed" };
    }
    if (campaign.channel === "sms" && normalizePhone(suppression.phone) === normalizePhone(recipient.phone)) {
      return { eligible: false, reason: "phone_suppressed" };
    }
  }
  return { eligible: true, reason: null };
}

async function finalizeCampaign(campaignId: string, locationId: string) {
  const { data: rows } = await db
    .from("location_messaging_recipients")
    .select("status")
    .eq("campaign_id", campaignId)
    .eq("location_id", locationId);
  const all = rows || [];
  const waiting = all.filter((row) => ["queued", "sending", "retrying"].includes(String(row.status))).length;
  if (waiting) return;

  const sent = all.filter((row) => row.status === "sent").length;
  const failed = all.filter((row) => row.status === "failed").length;
  const skipped = all.filter((row) => row.status === "skipped").length;
  const now = new Date().toISOString();
  const { data: campaign } = await db.from("location_messaging_campaigns").select("metadata,channel").eq("id", campaignId).maybeSingle();
  await db.from("location_messaging_campaigns").update({
    status: sent > 0 ? "sent" : "failed",
    sent_at: sent > 0 ? now : null,
    sms_credits_used: campaign?.channel === "sms" ? sent : 0,
    metadata: {
      ...(campaign?.metadata || {}),
      delivery_summary: { sent, failed, skipped, total: all.length },
      delivery_completed_at: now,
    },
    updated_at: now,
  }).eq("id", campaignId).eq("location_id", locationId);
  if (campaign?.channel === "sms" && sent > 0) {
    const start = new Date(); start.setUTCDate(1);
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
    const periodStart = start.toISOString().slice(0, 10);
    const periodEnd = end.toISOString().slice(0, 10);
    const { data: priorLedger } = await db
      .from("location_sms_credit_ledger")
      .select("credits_remaining")
      .eq("location_id", locationId)
      .eq("billing_period_start", periodStart)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const previousRemaining = Math.max(0, Number(priorLedger?.credits_remaining || 0));
    await db.from("location_sms_credit_ledger").insert({
      location_id: locationId,
      billing_period_start: periodStart,
      billing_period_end: periodEnd,
      credit_type: "campaign_usage",
      credits_added: 0,
      credits_used: sent,
      credits_remaining: Math.max(0, previousRemaining - sent),
      source: "location_messaging_delivery",
      campaign_id: campaignId,
      metadata: { settled_from_recipient_jobs: true, previous_remaining: previousRemaining },
    });
  }
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);
  if (!secureCompare(request.headers.get("x-worker-secret") || "", workerSecret)) {
    return json({ success: false, error: "Unauthorized" }, 401);
  }

  const body = await request.json().catch(() => ({}));
  const recipientId = clean(body.recipient_id || body.payload?.recipient_id);
  const campaignId = clean(body.campaign_id || body.payload?.campaign_id);
  if (!recipientId || !campaignId) return json({ success: false, error: "recipient_id and campaign_id are required" }, 400);

  const [{ data: recipient, error: recipientError }, { data: campaign, error: campaignError }] = await Promise.all([
    db.from("location_messaging_recipients").select("*").eq("id", recipientId).eq("campaign_id", campaignId).maybeSingle(),
    db.from("location_messaging_campaigns").select("*").eq("id", campaignId).maybeSingle(),
  ]);
  if (recipientError || campaignError || !recipient || !campaign) {
    return json({ success: false, error: "Campaign recipient could not be loaded" }, 404);
  }
  if (recipient.status === "sent" || recipient.status === "skipped") {
    return json({ success: true, idempotent: true, status: recipient.status });
  }
  if (campaign.status === "cancelled" || campaign.status === "rejected") {
    await db.from("location_messaging_recipients").update({ status: "skipped", failure_reason: "campaign_not_sendable", updated_at: new Date().toISOString() }).eq("id", recipient.id);
    await finalizeCampaign(campaign.id, campaign.location_id);
    return json({ success: true, skipped: true, reason: "campaign_not_sendable" });
  }
  if (campaign.channel === "sms" && campaign.requires_admin_approval && !campaign.approved_at) {
    return json({ success: false, error: "SMS campaign is not approved" }, 409);
  }

  const eligibility = await recipientStillEligible(recipient, campaign);
  if (!eligibility.eligible) {
    const now = new Date().toISOString();
    await db.from("location_messaging_recipients").update({
      status: "skipped",
      unsubscribed_at: eligibility.reason?.includes("consent") || eligibility.reason?.includes("suppressed") ? now : null,
      failure_reason: eligibility.reason,
      updated_at: now,
    }).eq("id", recipient.id);
    await finalizeCampaign(campaign.id, campaign.location_id);
    return json({ success: true, skipped: true, reason: eligibility.reason });
  }

  const { data: location } = await db.from("locations").select("name,restaurant_name,activity_name").eq("id", campaign.location_id).maybeSingle();
  const locationName = clean(location?.name || location?.restaurant_name || location?.activity_name || "this business");
  const now = new Date().toISOString();
  await db.from("location_messaging_recipients").update({
    status: "sending",
    attempt_count: Number(recipient.attempt_count || 0) + 1,
    updated_at: now,
  }).eq("id", recipient.id);

  try {
    let provider = "";
    let providerMessageId: string | null = null;
    if (campaign.channel === "email") {
      const subject = clean(campaign.subject) || `An update from ${locationName}`;
      const unsubscribeBase = clean(Deno.env.get("BUSINESS_SITE_URL")) || "https://business.theouthaven.com";
      const unsubscribeUrl = `${unsubscribeBase.replace(/\/$/, "")}/api/business/messaging/unsubscribe?recipient=${encodeURIComponent(recipient.id)}`;
      const html = `<p style="font-size:15px;line-height:24px;">${bodyHtml(campaign.body_rendered)}</p><p style="margin-top:28px;font-size:12px;color:#8f817a;">You received this because you opted in to updates from ${htmlEscape(locationName)} through TheOutHaven. <a href="${unsubscribeUrl}">Unsubscribe</a>.</p>`;
      const result = await sendEmail({
        to: recipient.email,
        subject,
        html,
        text: `${clean(campaign.body_rendered)}\n\nUnsubscribe: ${unsubscribeUrl}`,
        senderKey: "vip",
      });
      if (!result.sent) throw new Error(clean(result.error) || "email_delivery_failed");
      provider = clean(result.provider) || "aws_integration_api";
      providerMessageId = clean(result.id) || null;
    } else {
      const smsBody = `${clean(campaign.body_rendered)}\n\nReply STOP to opt out. Msg & data rates may apply.`;
      const result = await sendTelnyxSmsViaIntegrationApi("marketing", recipient.phone, smsBody);
      provider = "telnyx";
      providerMessageId = clean(result.id) || null;
    }

    const sentAt = new Date().toISOString();
    await Promise.all([
      db.from("location_messaging_recipients").update({
        status: "sent",
        provider,
        provider_message_id: providerMessageId,
        sent_at: sentAt,
        delivered_at: sentAt,
        failure_reason: null,
        updated_at: sentAt,
      }).eq("id", recipient.id),
      db.from("location_vip_signups").update({ last_contacted_at: sentAt, updated_at: sentAt }).eq("id", recipient.vip_signup_id),
      db.from("location_messaging_campaigns").update({ status: "sending", updated_at: sentAt }).eq("id", campaign.id),
    ]);
    await finalizeCampaign(campaign.id, campaign.location_id);
    return json({ success: true, sent: true, provider, provider_message_id: providerMessageId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const nextAttempt = Number(recipient.attempt_count || 0) + 1;
    const terminal = nextAttempt >= 5;
    const failedAt = terminal ? new Date().toISOString() : null;
    await db.from("location_messaging_recipients").update({
      status: terminal ? "failed" : "retrying",
      failed_at: failedAt,
      failure_reason: message.slice(0, 500),
      updated_at: new Date().toISOString(),
    }).eq("id", recipient.id);
    if (terminal) await finalizeCampaign(campaign.id, campaign.location_id);
    throw error;
  }
});
