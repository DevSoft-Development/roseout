import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { renderEnterpriseEmail, sendEmail } from "../_shared/email.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function sendQueuedCareerEmails(db: any) {
  const { data: events, error } = await db
    .from("career_email_events")
    .select("id,application_id,template_key,recipient_email,subject,status,metadata,attempt_count,career_applications(first_name,last_name)")
    .eq("status", "queued")
    .lt("attempt_count", 5)
    .order("created_at", { ascending: true })
    .limit(25);
  if (error) throw error;

  let sent = 0;
  let failed = 0;
  for (const event of events || []) {
    const firstName = event.career_applications?.first_name || "there";
    const templateKey = text(event.template_key);
    let subject = event.subject || "TheOutHaven Careers update";
    let heading = "TheOutHaven Careers";
    let intro = `Hi ${firstName},`;
    let html = "<p>We have an update regarding your TheOutHaven application.</p>";

    if (templateKey === "career_application_received") {
      subject = event.subject || "We received your TheOutHaven application";
      heading = "Application received";
      html = "<p>Thanks for applying to TheOutHaven. Our team has received your application and will review it carefully. We will contact you if we need anything else or when there is an update.</p>";
    } else if (templateKey === "career_offer_expiring") {
      subject = event.subject || "Reminder: your TheOutHaven offer is expiring soon";
      heading = "Offer reminder";
      html = "<p>This is a reminder that your TheOutHaven employment offer is approaching its expiration date. Please review and respond to the offer before it expires.</p>";
    } else if (templateKey === "career_interview_reminder") {
      subject = event.subject || "Reminder: your TheOutHaven interview is coming up";
      heading = "Interview reminder";
      html = `<p>Your interview with TheOutHaven is coming up. ${event.metadata?.scheduled_at ? `Scheduled time: <strong>${event.metadata.scheduled_at}</strong>.` : ""}</p>`;
    }

    const rendered = renderEnterpriseEmail({ subject, heading, intro, html });
    const result = await sendEmail({ to: event.recipient_email, subject, html: rendered.html, text: rendered.text, senderKey: "admin" });
    const now = new Date().toISOString();
    if ((result as any).sent) {
      sent += 1;
      await db.from("career_email_events").update({ status: "sent", sent_at: now, last_attempt_at: now, attempt_count: Number(event.attempt_count || 0) + 1, error: null }).eq("id", event.id);
    } else {
      failed += 1;
      await db.from("career_email_events").update({ status: Number(event.attempt_count || 0) + 1 >= 5 ? "failed" : "queued", last_attempt_at: now, attempt_count: Number(event.attempt_count || 0) + 1, error: text((result as any).error || (result as any).reason || "Email send failed").slice(0, 500) }).eq("id", event.id);
    }
  }
  return { processed: (events || []).length, sent, failed };
}

async function queueInterviewReminders(db: any) {
  const now = new Date();
  const soon = new Date(now.getTime() + 25 * 60 * 60 * 1000).toISOString();
  const afterNow = now.toISOString();
  const { data: interviews, error } = await db
    .from("career_interviews")
    .select("id,application_id,scheduled_at,status,career_applications(email,first_name)")
    .eq("status", "scheduled")
    .gte("scheduled_at", afterNow)
    .lte("scheduled_at", soon)
    .limit(100);
  if (error) throw error;

  let queued = 0;
  for (const interview of interviews || []) {
    const recipient = interview.career_applications?.email;
    if (!recipient) continue;
    const dedupeKey = `career-interview-reminder:${interview.id}`;
    const { error: insertError } = await db.from("career_email_events").insert({
      application_id: interview.application_id,
      template_key: "career_interview_reminder",
      recipient_email: recipient,
      subject: "Reminder: your TheOutHaven interview is coming up",
      status: "queued",
      dedupe_key: dedupeKey,
      metadata: { interview_id: interview.id, scheduled_at: interview.scheduled_at },
    });
    if (!insertError) queued += 1;
  }
  return queued;
}

async function processOfferExpirations(db: any) {
  const now = new Date();
  const reminderCutoff = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
  const nowIso = now.toISOString();

  const { data: expiring, error: expiringError } = await db
    .from("career_offers")
    .select("id,application_id,expires_at,status,career_applications(email,first_name)")
    .eq("status", "sent")
    .gt("expires_at", nowIso)
    .lte("expires_at", reminderCutoff)
    .limit(100);
  if (expiringError) throw expiringError;

  let remindersQueued = 0;
  for (const offer of expiring || []) {
    const recipient = offer.career_applications?.email;
    if (!recipient) continue;
    const { error } = await db.from("career_email_events").insert({
      application_id: offer.application_id,
      template_key: "career_offer_expiring",
      recipient_email: recipient,
      subject: "Reminder: your TheOutHaven offer is expiring soon",
      status: "queued",
      dedupe_key: `career-offer-expiring:${offer.id}`,
      metadata: { offer_id: offer.id, expires_at: offer.expires_at },
    });
    if (!error) remindersQueued += 1;
  }

  const { data: expired, error: expiredError } = await db
    .from("career_offers")
    .update({ status: "expired", updated_at: nowIso })
    .eq("status", "sent")
    .lt("expires_at", nowIso)
    .select("id");
  if (expiredError) throw expiredError;
  return { remindersQueued, expired: (expired || []).length };
}

async function flagIncompleteOnboarding(db: any) {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data, error } = await db
    .from("career_team_conversions")
    .select("id,application_id,provisioning_status,converted_at")
    .in("provisioning_status", ["pending", "partial_failure"])
    .lt("converted_at", cutoff)
    .limit(100);
  if (error) throw error;
  for (const conversion of data || []) {
    await db.from("career_employee_lifecycle_events").insert({
      conversion_id: conversion.id,
      application_id: conversion.application_id,
      event_type: "onboarding",
      step: "reconciliation_needed",
      status: "pending",
      details: { provisioning_status: conversion.provisioning_status },
    });
  }
  return (data || []).length;
}

Deno.serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") return json({ success: false, error: "Method not allowed" }, 405);
  const expected = Deno.env.get("CAREER_AUTOMATION_SECRET") || Deno.env.get("WORKER_INTERNAL_SECRET");
  if (expected) {
    const supplied = req.headers.get("x-career-secret") || req.headers.get("x-worker-secret") || "";
    if (supplied !== expected) return json({ success: false, error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ success: false, error: "Supabase is not configured." }, 500);
  const db = createClient(supabaseUrl, serviceRoleKey);

  try {
    const [interviewReminders, offerResult, emailResult, incompleteOnboarding] = await Promise.all([
      queueInterviewReminders(db),
      processOfferExpirations(db),
      sendQueuedCareerEmails(db),
      flagIncompleteOnboarding(db),
    ]);
    return json({ success: true, interviewReminders, offerResult, emailResult, incompleteOnboarding });
  } catch (error) {
    console.error("career-automation-worker failed", error);
    return json({ success: false, error: error instanceof Error ? error.message : "Career automation failed." }, 500);
  }
});
