import { NextResponse } from "next/server";
import twilio from "twilio";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { hasSuccessfulSend, loadCampaign, nowIso, requireMarketingAdminApi, updateCampaignStatus } from "@/lib/marketing-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MarketingUserRow = {
  id: string;
  phone?: string | null;
  marketing_opt_in?: boolean | null;
};

type PreferenceRow = {
  phone?: string | null;
  sms_opt_in?: boolean | null;
  sms_opted_out_at?: string | null;
};

type Recipient = {
  id?: string | null;
  user_id?: string | null;
  phone?: string | null;
  sms_opt_in?: boolean | null;
  sms_opted_out_at?: string | null;
};

async function loadSmsRecipients(): Promise<Recipient[]> {
  const [subscribersResult, usersResult, preferencesResult] = await Promise.all([
    supabaseAdmin
      .from("marketing_subscribers")
      .select("id,user_id,phone,sms_opt_in,sms_opted_out_at")
      .eq("sms_opt_in", true)
      .is("sms_opted_out_at", null)
      .not("phone", "is", null)
      .limit(1000),
    supabaseAdmin
      .from("users")
      .select("id,phone,marketing_opt_in")
      .eq("marketing_opt_in", true)
      .not("phone", "is", null)
      .limit(1000),
    supabaseAdmin
      .from("user_marketing_preferences")
      .select("phone,sms_opt_in,sms_opted_out_at")
      .eq("sms_opt_in", false)
      .not("phone", "is", null)
      .limit(1000),
  ]);

  const optedOutPhones = new Set(
    ((preferencesResult.data || []) as PreferenceRow[])
      .filter((row) => row.sms_opted_out_at || row.sms_opt_in === false)
      .map((row) => row.phone)
      .filter((phone): phone is string => Boolean(phone)),
  );
  const rows: Recipient[] = [
    ...(subscribersResult.data || []),
    ...((usersResult.data || []) as MarketingUserRow[]).map((user) => ({ id: null, user_id: user.id, phone: user.phone, sms_opt_in: Boolean(user.marketing_opt_in), sms_opted_out_at: null })),
  ];

  const seen = new Set<string>();
  return rows.filter((row) => {
    const phone = row.phone;
    if (!phone || seen.has(phone) || optedOutPhones.has(phone)) return false;
    seen.add(phone);
    return row.sms_opt_in !== false && !row.sms_opted_out_at;
  });
}

export async function POST(req: Request) {
  const { error } = await requireMarketingAdminApi();
  if (error) return error;

  const body = await req.json();
  const campaignId = typeof body.campaign_id === "string" ? body.campaign_id : "";
  const confirmed = body.confirm === true;

  if (!campaignId) return NextResponse.json({ error: "campaign_id is required" }, { status: 400 });
  if (!confirmed) return NextResponse.json({ error: "Confirmation is required before sending a text blast." }, { status: 409 });
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
    return NextResponse.json({ error: "Twilio SMS environment variables are not configured." }, { status: 500 });
  }
  if (await hasSuccessfulSend(campaignId, "sms")) return NextResponse.json({ error: "This campaign already has successful SMS sends." }, { status: 409 });

  const { data: campaign, error: campaignError } = await loadCampaign(campaignId);
  if (campaignError) return NextResponse.json({ error: campaignError.message }, { status: 500 });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (!campaign.sms_text) return NextResponse.json({ error: "Campaign is missing SMS text." }, { status: 400 });

  const recipients = await loadSmsRecipients();
  if (!recipients.length) return NextResponse.json({ error: "No opted-in SMS recipients found." }, { status: 400 });

  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  let sent = 0;
  let failed = 0;
  const logs = [];

  for (const recipient of recipients) {
    const attemptedAt = nowIso();
    const to = recipient.phone!;
    try {
      const result = await client.messages.create({
        from: process.env.TWILIO_PHONE_NUMBER,
        to,
        body: `${campaign.sms_text}\n\nReply STOP to opt out. Msg & data rates may apply.`,
      });
      sent += 1;
      logs.push({ campaign_id: campaignId, subscriber_id: recipient.id || null, user_id: recipient.user_id || null, channel: "sms", provider: "twilio", recipient_phone: to, status: "sent", provider_response: { sid: result.sid }, attempted_at: attemptedAt, sent_at: nowIso() });
    } catch (sendError: unknown) {
      failed += 1;
      logs.push({ campaign_id: campaignId, subscriber_id: recipient.id || null, user_id: recipient.user_id || null, channel: "sms", provider: "twilio", recipient_phone: to, status: "failed", error_message: sendError instanceof Error ? sendError.message : "SMS send failed", attempted_at: attemptedAt });
    }
  }

  if (logs.length) await supabaseAdmin.from("marketing_send_logs").insert(logs);
  await updateCampaignStatus(campaignId, failed && !sent ? "failed" : "sent", { sent_at: nowIso() });

  return NextResponse.json({ success: failed === 0, sent, failed, attempted: recipients.length });
}
