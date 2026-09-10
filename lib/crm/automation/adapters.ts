import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendRenderedEmail } from "@/lib/email/sender";
import { buildClaimShortUrlFromCode } from "@/lib/claimQr";
import { AutomationError } from "./errors";
import type { AutomationSettings, ClaimedStep, StepOutcome } from "./types";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://theouthaven.com").replace(/\/$/, "");
const SUPPORT_URL = `${SITE_URL}/support`;
const TERMINAL_MESSAGE_STATUSES = new Set(["sent", "delivered", "opened", "clicked", "replied"]);
const ACQUISITION_SEQUENCE_KEYS = new Set(["business-claim-outreach", "business-claim-follow-up", "essentials-conversion"]);

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function interpolate(value: string | null | undefined, variables: Record<string, unknown>, html = false) {
  return String(value ?? "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    const resolved = variables[key] ?? "";
    return html ? escapeHtml(resolved) : String(resolved);
  });
}

function isPaidLocation(location: any) {
  const status = String(location?.subscription_status || "").toLowerCase();
  const plan = String(location?.subscription_plan || location?.plan || "free").toLowerCase();
  return status === "active" || status === "paid" || Boolean(location?.is_pro) || !["", "free", "free_discovery"].includes(plan);
}

function localHour(timeZone: string, at = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", hour12: false }).formatToParts(at);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 12);
  return hour === 24 ? 0 : hour;
}

function quietHoursNextCheck(settings: AutomationSettings) {
  if (!settings.quietHoursEnabled) return null;
  const hour = localHour(settings.defaultTimezone || "America/New_York");
  if (hour >= 8 && hour < 20) return null;
  return new Date(Date.now() + 60 * 60 * 1000).toISOString();
}

async function loadContext(step: ClaimedStep) {
  const { data: enrollment, error: enrollmentError } = await supabaseAdmin
    .from("crm_sequence_enrollments")
    .select("id,sequence_id,contact_id,account_id,location_id,opportunity_id,owner_user_id,status")
    .eq("id", step.enrollment_id)
    .single();
  if (enrollmentError) throw new AutomationError("ENROLLMENT_LOAD_FAILED", enrollmentError.message, true, "database");

  const [{ data: sequence, error: sequenceError }, { data: sequenceStep, error: stepError }, { data: contact, error: contactError }, { data: location, error: locationError }] = await Promise.all([
    supabaseAdmin.from("crm_sequences").select("id,sequence_key,name,status,category,exit_rules").eq("id", step.sequence_id).single(),
    supabaseAdmin.from("crm_sequence_steps").select("id,template_id,task_template_id,conditions,requires_manual_approval").eq("id", step.step_id).single(),
    supabaseAdmin.from("crm_contacts").select("id,email,full_name,first_name,last_name,do_not_contact,email_consent_status,archived_at").eq("id", enrollment.contact_id).single(),
    enrollment.location_id
      ? supabaseAdmin.from("locations").select("id,name,business_name,restaurant_name,activity_name,neighborhood,city,state,claim_code,claim_url,is_claimed,claim_status,claim_started_at,claim_submitted_at,claim_approved_at,profile_completion_score,subscription_status,subscription_plan,plan,is_pro,do_not_contact,do_not_contact_reason,opportunity_score").eq("id", enrollment.location_id).single()
      : Promise.resolve({ data: null, error: null } as any),
  ]);
  if (sequenceError) throw new AutomationError("SEQUENCE_LOAD_FAILED", sequenceError.message, true, "database");
  if (stepError) throw new AutomationError("SEQUENCE_STEP_LOAD_FAILED", stepError.message, true, "database");
  if (contactError) throw new AutomationError("CONTACT_LOAD_FAILED", contactError.message, true, "database");
  if (locationError) throw new AutomationError("LOCATION_LOAD_FAILED", locationError.message, true, "database");

  return { enrollment, sequence, sequenceStep, contact, location };
}

async function isEmailSuppressed(contactId: string, email: string) {
  const normalized = email.trim().toLowerCase();
  const { count, error } = await supabaseAdmin
    .from("crm_suppression_entries")
    .select("id", { count: "exact", head: true })
    .eq("channel", "email")
    .eq("is_active", true)
    .ilike("address", normalized);
  if (error) throw new AutomationError("SUPPRESSION_CHECK_FAILED", error.message, true, "database");
  if (Number(count || 0) > 0) return true;
  const { count: contactCount, error: contactSuppressionError } = await supabaseAdmin
    .from("crm_suppression_entries")
    .select("id", { count: "exact", head: true })
    .eq("contact_id", contactId)
    .eq("channel", "email")
    .eq("is_active", true);
  if (contactSuppressionError) throw new AutomationError("SUPPRESSION_CHECK_FAILED", contactSuppressionError.message, true, "database");
  return Number(contactCount || 0) > 0;
}

async function enforceFrequency(contactId: string, settings: AutomationSettings): Promise<string | null> {
  const now = Date.now();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [{ count: daily, error: dailyError }, { count: weekly, error: weeklyError }] = await Promise.all([
    supabaseAdmin.from("crm_messages").select("id", { count: "exact", head: true }).eq("contact_id", contactId).eq("direction", "outbound").eq("channel", "email").gte("sent_at", dayAgo),
    supabaseAdmin.from("crm_messages").select("id", { count: "exact", head: true }).eq("contact_id", contactId).eq("direction", "outbound").eq("channel", "email").gte("sent_at", weekAgo),
  ]);
  if (dailyError || weeklyError) throw new AutomationError("FREQUENCY_CHECK_FAILED", dailyError?.message || weeklyError?.message || "Frequency check failed", true, "database");
  if (Number(daily || 0) >= settings.dailyLimit) return new Date(now + 60 * 60 * 1000).toISOString();
  if (Number(weekly || 0) >= settings.weeklyLimit) return new Date(now + 24 * 60 * 60 * 1000).toISOString();
  return null;
}

async function getOrCreateUnsubscribeUrl(params: { contactId: string; locationId: string | null; enrollmentId: string; email: string; required: boolean }) {
  if (!params.required) return "";
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("crm_unsubscribe_tokens")
    .select("token")
    .eq("contact_id", params.contactId)
    .eq("sequence_enrollment_id", params.enrollmentId)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .limit(1)
    .maybeSingle();
  if (existingError) throw new AutomationError("UNSUBSCRIBE_TOKEN_LOAD_FAILED", existingError.message, true, "database");
  if (existing?.token) return `${SITE_URL}/email/unsubscribe/${existing.token}`;
  const { data, error } = await supabaseAdmin.from("crm_unsubscribe_tokens").insert({
    contact_id: params.contactId,
    location_id: params.locationId,
    sequence_enrollment_id: params.enrollmentId,
    email: params.email.toLowerCase(),
  }).select("token").single();
  if (error) throw new AutomationError("UNSUBSCRIBE_TOKEN_CREATE_FAILED", error.message, true, "database");
  return `${SITE_URL}/email/unsubscribe/${data.token}`;
}

async function templateVariables(context: Awaited<ReturnType<typeof loadContext>>, unsubscribeUrl: string) {
  const location = context.location;
  const businessName = String(location?.name || location?.business_name || location?.restaurant_name || location?.activity_name || "your business");
  const claimUrl = location?.claim_code ? buildClaimShortUrlFromCode(location.claim_code) : String(location?.claim_url || `${SITE_URL}/business/claim`);
  let metrics: Record<string, any> = {};
  let reasons: string[] = [];
  if (location?.id) {
    const { data: state } = await supabaseAdmin.from("gtm_location_state").select("score_explanation").eq("location_id", location.id).maybeSingle();
    metrics = state?.score_explanation?.metrics || {};
    reasons = Array.isArray(state?.score_explanation?.reasons) ? state.score_explanation.reasons : [];
  }
  return {
    business_name: businessName,
    neighborhood: location?.neighborhood || location?.city || "",
    city: location?.city || "",
    claim_url: claimUrl,
    claim_code: location?.claim_code || "",
    support_url: SUPPORT_URL,
    dashboard_url: `${SITE_URL}/locations/dashboard`,
    analytics_url: `${SITE_URL}/locations/dashboard`,
    plans_url: `${SITE_URL}/business/plans`,
    profile_completion_score: Number(location?.profile_completion_score || 0),
    search_impressions_30d: Number(metrics.searchImpressions30d || 0),
    views_30d: Number(metrics.views30d || 0),
    outing_inclusions_30d: Number(metrics.outingInclusions30d || 0),
    opportunity_reason: reasons[0] || "Your business can manage its TheOutHaven presence and customer conversion tools after claiming.",
    unsubscribe_url: unsubscribeUrl,
  };
}

async function getOrCreateConversation(context: Awaited<ReturnType<typeof loadContext>>, subject: string) {
  const key = `sequence:${context.enrollment.id}`;
  const { data: existing, error: existingError } = await supabaseAdmin.from("crm_conversations").select("id").eq("conversation_key", key).maybeSingle();
  if (existingError) throw new AutomationError("CONVERSATION_LOAD_FAILED", existingError.message, true, "database");
  if (existing?.id) return existing.id;
  const { data, error } = await supabaseAdmin.from("crm_conversations").insert({
    conversation_key: key,
    channel: "email",
    status: "open",
    subject,
    account_id: context.enrollment.account_id,
    location_id: context.enrollment.location_id,
    contact_id: context.enrollment.contact_id,
    opportunity_id: context.enrollment.opportunity_id,
    owner_user_id: context.enrollment.owner_user_id,
    assigned_team: "crm",
    priority: context.sequence.sequence_key === "business-claim-outreach" ? "high" : "normal",
    metadata: { sequence_key: context.sequence.sequence_key, sequence_enrollment_id: context.enrollment.id },
  }).select("id").single();
  if (error) throw new AutomationError("CONVERSATION_CREATE_FAILED", error.message, true, "database");
  return data.id;
}

export async function executeEmailStep(step: ClaimedStep, settings: AutomationSettings): Promise<StepOutcome> {
  if (!settings.emailAutomationEnabled) return { status: "waiting", nextStepAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(), result: { reason: "email_automation_disabled" } };
  const quietUntil = quietHoursNextCheck(settings);
  if (quietUntil) return { status: "waiting", nextStepAt: quietUntil, result: { reason: "quiet_hours" } };

  const context = await loadContext(step);
  const { contact, location, sequence, sequenceStep } = context;
  if (!contact?.email) return { status: "suppressed", result: { reason: "contact_email_missing" } };
  if (contact.archived_at || contact.do_not_contact || location?.do_not_contact) return { status: "suppressed", result: { reason: "do_not_contact" } };
  if (await isEmailSuppressed(contact.id, contact.email)) return { status: "suppressed", result: { reason: "email_suppressed" } };

  const frequencyNext = await enforceFrequency(contact.id, settings);
  if (frequencyNext) return { status: "waiting", nextStepAt: frequencyNext, result: { reason: "frequency_limit" } };

  const { data: template, error: templateError } = await supabaseAdmin.from("crm_templates")
    .select("id,template_key,status,active_version_id")
    .eq("id", sequenceStep.template_id)
    .single();
  if (templateError || template.status !== "approved" || !template.active_version_id) throw new AutomationError("TEMPLATE_NOT_APPROVED", "Sequence email template is not approved with an active version", false, "configuration");
  const { data: version, error: versionError } = await supabaseAdmin.from("crm_template_versions")
    .select("id,subject,body_text,body_html,approval_status")
    .eq("id", template.active_version_id)
    .eq("template_id", template.id)
    .single();
  if (versionError || version.approval_status !== "approved") throw new AutomationError("TEMPLATE_VERSION_NOT_APPROVED", "Active sequence template version is not approved", false, "configuration");

  const acquisition = ACQUISITION_SEQUENCE_KEYS.has(sequence.sequence_key);
  const unsubscribeUrl = await getOrCreateUnsubscribeUrl({ contactId: contact.id, locationId: context.enrollment.location_id, enrollmentId: context.enrollment.id, email: contact.email, required: acquisition });
  const variables = await templateVariables(context, unsubscribeUrl);
  const subject = interpolate(version.subject, variables, false);
  let bodyHtml = interpolate(version.body_html, variables, true);
  let bodyText = interpolate(version.body_text, variables, false);
  if (acquisition && unsubscribeUrl && !bodyHtml.includes(unsubscribeUrl)) bodyHtml += `<p style="font-size:12px;color:#666"><a href="${escapeHtml(unsubscribeUrl)}">Unsubscribe from business outreach</a>.</p>`;
  if (acquisition && unsubscribeUrl && !bodyText.includes(unsubscribeUrl)) bodyText += `\n\nUnsubscribe: ${unsubscribeUrl}`;

  const conversationId = await getOrCreateConversation(context, subject);
  const sourceRecordId = step.execution_key;
  const { data: existingMessage, error: existingMessageError } = await supabaseAdmin.from("crm_messages")
    .select("id,status,provider_message_id")
    .eq("source_system", "crm_sequence_automation")
    .eq("source_record_id", sourceRecordId)
    .limit(1)
    .maybeSingle();
  if (existingMessageError) throw new AutomationError("MESSAGE_LOAD_FAILED", existingMessageError.message, true, "database");
  if (existingMessage && TERMINAL_MESSAGE_STATUSES.has(existingMessage.status)) return { status: "completed", result: { messageId: existingMessage.id, providerMessageId: existingMessage.provider_message_id, idempotent: true } };

  let messageId = existingMessage?.id || null;
  if (!messageId) {
    const { data: message, error: messageError } = await supabaseAdmin.from("crm_messages").insert({
      conversation_id: conversationId,
      direction: "outbound",
      channel: "email",
      message_type: "sequence",
      contact_id: contact.id,
      subject,
      body_text: bodyText,
      body_html: bodyHtml,
      preview_text: subject,
      status: "queued",
      queued_at: new Date().toISOString(),
      template_id: template.id,
      template_version_id: version.id,
      sequence_id: sequence.id,
      sequence_enrollment_id: context.enrollment.id,
      source_system: "crm_sequence_automation",
      source_record_id: sourceRecordId,
      metadata: { template_key: template.template_key, sequence_key: sequence.sequence_key, execution_id: step.execution_id },
    }).select("id").single();
    if (messageError) throw new AutomationError("MESSAGE_CREATE_FAILED", messageError.message, true, "database");
    messageId = message.id;
    const { error: recipientError } = await supabaseAdmin.from("crm_message_recipients").insert({
      message_id: messageId,
      contact_id: contact.id,
      recipient_type: "to",
      address: contact.email.toLowerCase(),
      delivery_status: "queued",
      consent_snapshot: { status: contact.email_consent_status || "unknown", source: "public_business_contact" },
      suppression_snapshot: { checked: true, suppressed: false },
    });
    if (recipientError) throw new AutomationError("MESSAGE_RECIPIENT_CREATE_FAILED", recipientError.message, true, "database");
    await supabaseAdmin.from("crm_sequence_step_executions").update({ message_id: messageId }).eq("id", step.execution_id);
  }

  const sendResult = await sendRenderedEmail({
    to: contact.email,
    department: "claims",
    rendered: { subject, preview: subject, html: bodyHtml, text: bodyText, department: "account" as any },
    templateKey: template.template_key || "gtm_sequence",
  });
  if (sendResult.status !== "sent") {
    await supabaseAdmin.from("crm_messages").update({ status: "failed", failed_at: new Date().toISOString(), failure_code: "provider_send_failed", failure_reason: sendResult.error || "Email send failed", updated_at: new Date().toISOString() }).eq("id", messageId);
    throw new AutomationError("EMAIL_SEND_FAILED", sendResult.error || "Email provider did not accept the message", true, "provider");
  }

  const now = new Date().toISOString();
  const updates = await Promise.all([
    supabaseAdmin.from("crm_messages").update({ status: "sent", provider: "resend", provider_message_id: sendResult.id || null, sent_at: now, updated_at: now }).eq("id", messageId),
    supabaseAdmin.from("crm_message_recipients").update({ delivery_status: "sent" }).eq("message_id", messageId),
    supabaseAdmin.from("crm_conversations").update({ last_message_at: now, last_outbound_at: now, updated_at: now }).eq("id", conversationId),
    supabaseAdmin.from("crm_contacts").update({ last_contacted_at: now, updated_at: now }).eq("id", contact.id),
    context.enrollment.location_id ? supabaseAdmin.from("locations").update({ last_contacted_at: now, claim_outreach_status: sequence.sequence_key === "business-claim-outreach" ? "sent" : undefined, claim_outreach_channel: "email", claim_sent_at: sequence.sequence_key === "business-claim-outreach" ? now : undefined }).eq("id", context.enrollment.location_id) : Promise.resolve({ error: null } as any),
    context.enrollment.location_id ? supabaseAdmin.from("gtm_events").insert({ location_id: context.enrollment.location_id, account_id: context.enrollment.account_id, contact_id: contact.id, opportunity_id: context.enrollment.opportunity_id, event_type: "email_sent", channel: "email", source: "crm_sequence_automation", campaign_key: sequence.sequence_key, occurred_at: now, metadata: { message_id: messageId, template_key: template.template_key, step_order: step.step_order } }) : Promise.resolve({ error: null } as any),
  ]);
  for (const update of updates) if ((update as any)?.error) throw new AutomationError("EMAIL_POST_SEND_WRITE_FAILED", (update as any).error.message, true, "database");
  return { status: "completed", result: { messageId, providerMessageId: sendResult.id || null, templateKey: template.template_key } };
}

export async function executeTaskStep(step: ClaimedStep, settings: AutomationSettings): Promise<StepOutcome> {
  if (!settings.taskAutomationEnabled) return { status: "waiting", nextStepAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(), result: { reason: "task_automation_disabled" } };
  const context = await loadContext(step);
  const conditions = (context.sequenceStep.conditions || {}) as Record<string, any>;
  const { data: existing, error: existingError } = await supabaseAdmin.from("crm_tasks").select("id,status").eq("source", "crm_sequence_automation").eq("source_record_id", step.execution_key).maybeSingle();
  if (existingError) throw new AutomationError("TASK_LOAD_FAILED", existingError.message, true, "database");
  if (existing?.id) return { status: "completed", result: { taskId: existing.id, idempotent: true } };

  let assignedTo = context.enrollment.owner_user_id || null;
  if (!assignedTo && context.enrollment.location_id) {
    const { data: territory } = await supabaseAdmin.from("crm_location_territories").select("owner_user_id").eq("location_id", context.enrollment.location_id).limit(1).maybeSingle();
    assignedTo = territory?.owner_user_id || null;
  }
  const { data: task, error } = await supabaseAdmin.from("crm_tasks").insert({
    account_id: context.enrollment.account_id,
    location_id: context.enrollment.location_id,
    contact_id: context.enrollment.contact_id,
    opportunity_id: context.enrollment.opportunity_id,
    title: String(conditions.task_title || `Follow up: ${context.sequence.name}`).slice(0, 240),
    description: String(conditions.task_description || "Review the current CRM activity and complete the recommended follow-up."),
    task_type: conditions.task_type || "follow_up",
    status: "open",
    priority: conditions.priority || "normal",
    assigned_to_user_id: assignedTo,
    assigned_team: context.sequence.category === "onboarding" ? "experience_team" : "sales_team",
    due_at: new Date().toISOString(),
    source: "crm_sequence_automation",
    source_record_id: step.execution_key,
    queue_key: conditions.queue_key || "sales",
    category: context.sequence.category,
    subtype: "sequence_follow_up",
    workflow_key: context.sequence.sequence_key,
    workflow_stage: String(step.step_order),
    assignment_reason: assignedTo ? "territory_owner" : "team_queue",
    metadata: { sequence_enrollment_id: context.enrollment.id, sequence_id: context.sequence.id, execution_id: step.execution_id },
  }).select("id").single();
  if (error) throw new AutomationError("TASK_CREATE_FAILED", error.message, true, "database");
  await supabaseAdmin.from("crm_sequence_step_executions").update({ task_id: task.id }).eq("id", step.execution_id);
  return { status: "completed", result: { taskId: task.id } };
}

export async function executeExitCheckStep(step: ClaimedStep): Promise<StepOutcome> {
  const context = await loadContext(step);
  const { contact, location, sequence } = context;
  if (!location) return { status: "completed" };
  if (contact?.do_not_contact || location.do_not_contact || (contact?.email && await isEmailSuppressed(contact.id, contact.email))) return { status: "suppressed", result: { reason: "suppressed_or_do_not_contact" } };
  if (isPaidLocation(location)) return { status: "exited", result: { reason: "customer" } };

  if (sequence.sequence_key === "business-claim-outreach") {
    if (location.claim_submitted_at || location.claim_approved_at || location.is_claimed) return { status: "exited", result: { reason: "claim_submitted_or_completed" } };
    if (location.claim_started_at) return { status: "exited", result: { reason: "claim_started" } };
  }
  if (sequence.sequence_key === "business-claim-follow-up") {
    if (location.claim_submitted_at || location.claim_approved_at || location.is_claimed) return { status: "exited", result: { reason: "claim_submitted_or_completed" } };
  }
  if (sequence.sequence_key === "essentials-conversion" && isPaidLocation(location)) return { status: "exited", result: { reason: "customer" } };
  return { status: "completed" };
}
