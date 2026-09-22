import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

type Channel = "email" | "sms";

export type LocationMessagingAudienceFilter = {
  birthdayMonth?: string | null;
  interests?: string[];
  source?: string | null;
};

type VipRow = {
  id: string;
  location_id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  birthday_month?: string | null;
  interests?: unknown;
  source?: string | null;
  email_consent?: boolean | null;
  sms_consent?: boolean | null;
  email_unsubscribed_at?: string | null;
  sms_unsubscribed_at?: string | null;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeEmail(value: unknown) {
  return clean(value).toLowerCase();
}

function normalizePhone(value: unknown) {
  const raw = clean(value);
  if (!raw) return "";
  if (raw.startsWith("+")) return `+${raw.slice(1).replace(/\D/g, "")}`;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return raw;
}

function interests(value: unknown) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(clean).filter(Boolean);
    } catch {
      return value.split(",").map(clean).filter(Boolean);
    }
  }
  return [];
}

function matchesAudience(row: VipRow, filter: LocationMessagingAudienceFilter) {
  if (filter.birthdayMonth && clean(row.birthday_month).toLowerCase() !== clean(filter.birthdayMonth).toLowerCase()) return false;
  if (filter.source && clean(row.source).toLowerCase() !== clean(filter.source).toLowerCase()) return false;
  const desiredInterests = (filter.interests || []).map((value) => clean(value).toLowerCase()).filter(Boolean);
  if (desiredInterests.length) {
    const actual = new Set(interests(row.interests).map((value) => value.toLowerCase()));
    if (!desiredInterests.some((value) => actual.has(value))) return false;
  }
  return true;
}

export async function resolveLocationMessagingAudience(input: {
  locationId: string;
  channel: Channel;
  filter?: LocationMessagingAudienceFilter | null;
}) {
  const filter = input.filter || {};
  const consentColumn = input.channel === "email" ? "email_consent" : "sms_consent";
  const unsubscribedColumn = input.channel === "email" ? "email_unsubscribed_at" : "sms_unsubscribed_at";
  const contactColumn = input.channel === "email" ? "email" : "phone";

  const { data: rows, error } = await supabaseAdmin
    .from("location_vip_signups")
    .select("id,location_id,name,email,phone,birthday_month,interests,source,email_consent,sms_consent,email_unsubscribed_at,sms_unsubscribed_at")
    .eq("location_id", input.locationId)
    .eq(consentColumn, true)
    .is(unsubscribedColumn, null)
    .not(contactColumn, "is", null)
    .limit(5000);
  if (error) throw error;

  const { data: suppressions, error: suppressionError } = await supabaseAdmin
    .from("location_messaging_suppression")
    .select("email,phone,channel")
    .eq("location_id", input.locationId)
    .limit(10000);
  if (suppressionError) throw suppressionError;

  const suppressedEmails = new Set<string>();
  const suppressedPhones = new Set<string>();
  for (const suppression of suppressions || []) {
    const applies = !suppression.channel || suppression.channel === input.channel || suppression.channel === "all";
    if (!applies) continue;
    const email = normalizeEmail(suppression.email);
    const phone = normalizePhone(suppression.phone);
    if (email) suppressedEmails.add(email);
    if (phone) suppressedPhones.add(phone);
  }

  const seen = new Set<string>();
  const audience = (rows || []).flatMap((row: VipRow) => {
    if (!matchesAudience(row, filter)) return [];
    const email = normalizeEmail(row.email);
    const phone = normalizePhone(row.phone);
    const contact = input.channel === "email" ? email : phone;
    if (!contact || seen.has(contact)) return [];
    if (input.channel === "email" && suppressedEmails.has(email)) return [];
    if (input.channel === "sms" && suppressedPhones.has(phone)) return [];
    seen.add(contact);
    return [{
      vipSignupId: String(row.id),
      name: row.name || null,
      email: email || null,
      phone: phone || null,
    }];
  });

  return audience;
}

export async function materializeLocationMessagingCampaign(input: {
  campaign: any;
  runAfter?: string | null;
  createdBy?: string | null;
}) {
  const campaignId = String(input.campaign.id);
  const locationId = String(input.campaign.location_id);
  const channel = String(input.campaign.channel) as Channel;
  if (channel !== "email" && channel !== "sms") throw new Error("Unsupported campaign channel.");

  const audience = await resolveLocationMessagingAudience({
    locationId,
    channel,
    filter: (input.campaign.audience_filter || {}) as LocationMessagingAudienceFilter,
  });
  if (!audience.length) throw new Error("No opted-in recipients match this campaign audience.");

  const runAfter = input.runAfter
    ? new Date(input.runAfter).toISOString()
    : new Date().toISOString();

  const recipientRows = audience.map((recipient) => ({
    campaign_id: campaignId,
    vip_signup_id: recipient.vipSignupId,
    location_id: locationId,
    channel,
    email: channel === "email" ? recipient.email : null,
    phone: channel === "sms" ? recipient.phone : null,
    status: "queued",
    queued_at: new Date().toISOString(),
    metadata: { audience_source: "location_vip_signups" },
    updated_at: new Date().toISOString(),
  }));

  const { data: inserted, error: recipientError } = await supabaseAdmin
    .from("location_messaging_recipients")
    .upsert(recipientRows, { onConflict: "campaign_id,vip_signup_id,channel", ignoreDuplicates: true })
    .select("id,vip_signup_id,status");
  if (recipientError) throw recipientError;

  const { data: allRecipients, error: loadError } = await supabaseAdmin
    .from("location_messaging_recipients")
    .select("id,vip_signup_id,status,worker_job_id")
    .eq("campaign_id", campaignId)
    .eq("location_id", locationId)
    .eq("channel", channel);
  if (loadError) throw loadError;

  const toQueue = (allRecipients || []).filter((recipient: any) =>
    recipient.status !== "sent" && !recipient.worker_job_id,
  );
  const jobs = toQueue.map((recipient: any) => ({
    job_type: "location.messaging.recipient",
    status: "queued",
    payload: {
      campaign_id: campaignId,
      recipient_id: String(recipient.id),
      location_id: locationId,
    },
    payload_version: 1,
    idempotency_key: `location-messaging:${campaignId}:${recipient.id}`,
    priority: 80,
    max_attempts: 5,
    run_after: runAfter,
    created_by_label: "business_campaign",
    created_by: input.createdBy || null,
  }));

  let queuedJobs: Array<{ id: string; payload: any; idempotency_key?: string | null }> = [];
  if (jobs.length) {
    const keys = jobs.map((job) => job.idempotency_key);
    const { data: existingJobs, error: existingJobError } = await supabaseAdmin
      .from("worker_jobs")
      .select("id,payload,idempotency_key")
      .in("idempotency_key", keys);
    if (existingJobError) throw existingJobError;

    const existingKeys = new Set((existingJobs || []).map((job: any) => String(job.idempotency_key || "")));
    const missingJobs = jobs.filter((job) => !existingKeys.has(job.idempotency_key));
    let insertedJobs: Array<{ id: string; payload: any; idempotency_key?: string | null }> = [];
    if (missingJobs.length) {
      const { data, error: jobError } = await supabaseAdmin
        .from("worker_jobs")
        .insert(missingJobs)
        .select("id,payload,idempotency_key");
      if (jobError) throw jobError;
      insertedJobs = data || [];
    }
    queuedJobs = [...(existingJobs || []), ...insertedJobs];
  }

  for (const job of queuedJobs) {
    const recipientId = String(job.payload?.recipient_id || "");
    if (!recipientId) continue;
    await supabaseAdmin
      .from("location_messaging_recipients")
      .update({ worker_job_id: job.id, updated_at: new Date().toISOString() })
      .eq("id", recipientId)
      .is("worker_job_id", null);
  }

  const total = (allRecipients || []).length;
  const smsEstimate = channel === "sms" ? total : 0;
  const { error: campaignError } = await supabaseAdmin
    .from("location_messaging_campaigns")
    .update({
      recipient_count: total,
      scheduled_for: runAfter,
      status: new Date(runAfter).getTime() > Date.now() + 5_000 ? "scheduled" : "sending",
      sms_credits_estimated: smsEstimate,
      metadata: {
        ...(input.campaign.metadata || {}),
        audience_materialized_at: new Date().toISOString(),
        delivery_job_type: "location.messaging.recipient",
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", campaignId)
    .eq("location_id", locationId);
  if (campaignError) throw campaignError;

  return {
    recipientCount: total,
    queuedJobCount: queuedJobs.length,
    scheduledFor: runAfter,
    channel,
  };
}
