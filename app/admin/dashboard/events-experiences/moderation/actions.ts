"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { sendRawBrandedEmail } from "@/lib/email/sender";
import { fraudDecisionPreventsSensitiveAction, getFraudDecision } from "@/lib/fraud";
import { supabaseAdmin } from "@/lib/supabase-admin";

type ModerationSubject = "event" | "experience";
type ModerationDecision = "approve" | "deny" | "request_details";

function text(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function dashboardUrl(locationId: string | null, organizationId: string | null) {
  const origin = process.env.NEXT_PUBLIC_SITE_URL || "https://www.theouthaven.com";
  if (organizationId) return `${origin}/organizers/dashboard?organizationId=${encodeURIComponent(organizationId)}`;
  if (locationId) return `${origin}/locations/dashboard/events-experiences?locationId=${encodeURIComponent(locationId)}`;
  return `${origin}/`;
}

async function creatorEmails(locationId: string | null, organizationId: string | null) {
  const emails = new Set<string>();

  if (organizationId) {
    const { data: members, error } = await supabaseAdmin
      .from("organization_members")
      .select("email,user_id")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .limit(20);
    if (error) throw error;
    for (const member of members || []) {
      if (member.email) emails.add(String(member.email).trim().toLowerCase());
      else if (member.user_id) {
        const { data } = await supabaseAdmin.auth.admin.getUserById(String(member.user_id));
        if (data.user?.email) emails.add(data.user.email.trim().toLowerCase());
      }
    }
  }

  if (locationId) {
    const [{ data: location, error: locationError }, { data: owners, error: ownersError }] = await Promise.all([
      supabaseAdmin
        .from("locations")
        .select("owner_email,reservation_owner_email")
        .eq("id", locationId)
        .maybeSingle(),
      supabaseAdmin
        .from("location_owner_locations")
        .select("user_id")
        .eq("location_id", locationId)
        .eq("status", "active")
        .limit(10),
    ]);
    if (locationError) throw locationError;
    if (ownersError) throw ownersError;
    if (location?.owner_email) emails.add(String(location.owner_email).trim().toLowerCase());
    if (location?.reservation_owner_email) emails.add(String(location.reservation_owner_email).trim().toLowerCase());
    for (const owner of owners || []) {
      if (!owner.user_id) continue;
      const { data } = await supabaseAdmin.auth.admin.getUserById(String(owner.user_id));
      if (data.user?.email) emails.add(data.user.email.trim().toLowerCase());
    }
  }

  return [...emails].filter(Boolean);
}

async function notifyCreator(params: {
  decision: ModerationDecision;
  title: string;
  subjectType: ModerationSubject;
  note: string;
  locationId: string | null;
  organizationId: string | null;
}) {
  const recipients = await creatorEmails(params.locationId, params.organizationId);
  if (!recipients.length) return;

  const label = params.subjectType === "event" ? "event" : "experience";
  const cta = { label: "Open your dashboard", url: dashboardUrl(params.locationId, params.organizationId) };

  if (params.decision === "request_details") {
    await sendRawBrandedEmail({
      to: recipients,
      department: "account",
      subject: `More details needed for your ${label}: ${params.title}`,
      heading: "We need a little more information",
      preview: `Your ${label} is still being reviewed.`,
      body: `Your ${label} “${params.title}” is still being reviewed and is not public yet.`,
      sections: [{ type: "callout", title: "What we need", text: params.note, tone: "warning" }],
      cta,
    });
    return;
  }

  if (params.decision === "approve") {
    await sendRawBrandedEmail({
      to: recipients,
      department: "account",
      subject: `Your ${label} is approved: ${params.title}`,
      heading: "Approved",
      preview: `Your ${label} has been approved.`,
      body: `Your ${label} “${params.title}” passed moderation and is now approved for publication.`,
      sections: params.note ? [{ type: "callout", title: "Moderator note", text: params.note, tone: "success" }] : [],
      cta,
    });
    return;
  }

  await sendRawBrandedEmail({
    to: recipients,
    department: "account",
    subject: `Update about your ${label}: ${params.title}`,
    heading: "This submission was not approved",
    preview: `Your ${label} did not pass moderation.`,
    body: `Your ${label} “${params.title}” was not approved and will remain off the public marketplace.`,
    sections: [{ type: "callout", title: "Reason", text: params.note, tone: "critical" }],
    cta,
  });
}

async function loadModerationItem(caseId: string, subjectType: ModerationSubject, subjectId: string) {
  const { data: fraudCase, error: caseError } = await supabaseAdmin
    .from("fraud_cases")
    .select("id,status,primary_subject_type,primary_subject_id")
    .eq("id", caseId)
    .maybeSingle();
  if (caseError) throw caseError;
  if (!fraudCase || fraudCase.primary_subject_type !== subjectType || fraudCase.primary_subject_id !== subjectId) {
    throw new Error("Moderation case not found.");
  }
  if (fraudCase.status === "closed") throw new Error("This moderation case is already closed.");

  if (subjectType === "event") {
    const { data, error } = await supabaseAdmin
      .from("events")
      .select("id,title,status,searchable,starts_at,is_free,ticketing_enabled,location_id,organization_id")
      .eq("id", subjectId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Event not found.");
    return { ...data, subjectType } as const;
  }

  const { data, error } = await supabaseAdmin
    .from("experiences")
    .select("id,title,status,searchable,location_id,organization_id")
    .eq("id", subjectId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Experience not found.");
  return { ...data, subjectType } as const;
}

async function assertRelatedAccountsCanPublish(item: Awaited<ReturnType<typeof loadModerationItem>>) {
  const checks: Array<ReturnType<typeof getFraudDecision>> = [];
  if (item.location_id) checks.push(getFraudDecision("location", String(item.location_id)));
  if (item.organization_id) checks.push(getFraudDecision("organizer", String(item.organization_id)));
  const decisions = await Promise.all(checks);
  const blocked = decisions.find(fraudDecisionPreventsSensitiveAction);
  if (blocked) throw new Error("The related business or organizer is still held by Trust & Safety. Resolve that case before approving this submission.");

  if (item.subjectType !== "event" || item.is_free || !item.ticketing_enabled) return;

  if (item.location_id) {
    const { data: location, error } = await supabaseAdmin
      .from("locations")
      .select("stripe_connect_account_id,stripe_connect_charges_enabled,stripe_connect_payouts_enabled")
      .eq("id", item.location_id)
      .maybeSingle();
    if (error) throw error;
    if (!location?.stripe_connect_account_id || !location.stripe_connect_charges_enabled || !location.stripe_connect_payouts_enabled) {
      throw new Error("This paid event cannot be approved until the location finishes TheOutHaven Payments setup.");
    }
    const payoutDecision = await getFraudDecision("payout", `connect-account:${location.stripe_connect_account_id}`);
    if (fraudDecisionPreventsSensitiveAction(payoutDecision)) throw new Error("The payout account is still held for review.");
  }

  if (item.organization_id) {
    const { data: organization, error } = await supabaseAdmin
      .from("organizations")
      .select("stripe_connect_account_id,stripe_connect_charges_enabled,stripe_connect_payouts_enabled")
      .eq("id", item.organization_id)
      .maybeSingle();
    if (error) throw error;
    if (!organization?.stripe_connect_account_id || !organization.stripe_connect_charges_enabled || !organization.stripe_connect_payouts_enabled) {
      throw new Error("This paid event cannot be approved until the organizer finishes TheOutHaven Payments setup.");
    }
    const payoutDecision = await getFraudDecision("payout", `connect-account:${organization.stripe_connect_account_id}`);
    if (fraudDecisionPreventsSensitiveAction(payoutDecision)) throw new Error("The payout account is still held for review.");
  }
}

async function addAction(params: {
  caseId: string;
  subjectType: ModerationSubject;
  subjectId: string;
  actionType: "restore" | "remove_content" | "hold_publication";
  reason: string;
  actorUserId: string;
  actorRole: string;
}) {
  const { error } = await supabaseAdmin.from("fraud_actions").insert({
    case_id: params.caseId,
    subject_type: params.subjectType,
    subject_id: params.subjectId,
    action_type: params.actionType,
    reason: params.reason,
    actor_user_id: params.actorUserId,
    actor_role: params.actorRole,
  });
  if (error) throw error;
}

export async function moderateEventExperienceAction(formData: FormData) {
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.fraudEnforce);
  const caseId = text(formData, "caseId");
  const subjectId = text(formData, "subjectId");
  const subjectType = text(formData, "subjectType") as ModerationSubject;
  const decision = text(formData, "decision") as ModerationDecision;
  const note = text(formData, "note");

  if (!caseId || !subjectId || !["event", "experience"].includes(subjectType) || !["approve", "deny", "request_details"].includes(decision)) {
    throw new Error("Invalid moderation action.");
  }
  if ((decision === "deny" || decision === "request_details") && !note) {
    throw new Error(decision === "deny" ? "Add a reason before denying this submission." : "Tell the creator what information you need.");
  }

  const item = await loadModerationItem(caseId, subjectType, subjectId);
  const now = new Date().toISOString();

  if (decision === "request_details") {
    await addAction({
      caseId,
      subjectType,
      subjectId,
      actionType: "hold_publication",
      reason: `More information requested: ${note}`,
      actorUserId: admin.user_id,
      actorRole: admin.role,
    });
    const [{ error: caseError }, { error: noteError }] = await Promise.all([
      supabaseAdmin.from("fraud_cases").update({
        status: "awaiting_evidence",
        resolution: "more_information_requested",
        resolution_notes: note,
        last_activity_at: now,
        updated_at: now,
      }).eq("id", caseId),
      supabaseAdmin.from("fraud_case_notes").insert({
        case_id: caseId,
        note: `Requested from creator: ${note}`,
        actor_user_id: admin.user_id,
      }),
    ]);
    if (caseError) throw caseError;
    if (noteError) throw noteError;

    await notifyCreator({
      decision,
      title: item.title,
      subjectType,
      note,
      locationId: item.location_id ? String(item.location_id) : null,
      organizationId: item.organization_id ? String(item.organization_id) : null,
    });
  } else if (decision === "deny") {
    await addAction({
      caseId,
      subjectType,
      subjectId,
      actionType: "remove_content",
      reason: note,
      actorUserId: admin.user_id,
      actorRole: admin.role,
    });

    const itemUpdate = subjectType === "event"
      ? supabaseAdmin.from("events").update({ status: "cancelled", searchable: false, updated_at: now }).eq("id", subjectId)
      : supabaseAdmin.from("experiences").update({ status: "archived", searchable: false, updated_at: now }).eq("id", subjectId);
    const [{ error: itemError }, { error: caseError }] = await Promise.all([
      itemUpdate,
      supabaseAdmin.from("fraud_cases").update({
        status: "closed",
        resolution: "denied",
        resolution_notes: note,
        resolved_at: now,
        last_activity_at: now,
        updated_at: now,
      }).eq("id", caseId),
    ]);
    if (itemError) throw itemError;
    if (caseError) throw caseError;

    await notifyCreator({
      decision,
      title: item.title,
      subjectType,
      note,
      locationId: item.location_id ? String(item.location_id) : null,
      organizationId: item.organization_id ? String(item.organization_id) : null,
    });
  } else {
    await assertRelatedAccountsCanPublish(item);
    if (subjectType === "event" && item.starts_at && new Date(item.starts_at).getTime() < Date.now()) {
      throw new Error("This event date has already passed. Ask the creator to update the date before approving it.");
    }

    await addAction({
      caseId,
      subjectType,
      subjectId,
      actionType: "restore",
      reason: note || "Approved during Events & Experiences moderation.",
      actorUserId: admin.user_id,
      actorRole: admin.role,
    });

    const itemUpdate = subjectType === "event"
      ? supabaseAdmin.from("events").update({ status: "scheduled", searchable: true, updated_at: now }).eq("id", subjectId)
      : supabaseAdmin.from("experiences").update({ status: "published", searchable: true, updated_at: now }).eq("id", subjectId);
    const [{ error: itemError }, { error: caseError }] = await Promise.all([
      itemUpdate,
      supabaseAdmin.from("fraud_cases").update({
        status: "closed",
        resolution: "approved",
        resolution_notes: note || "Approved during Events & Experiences moderation.",
        resolved_at: now,
        last_activity_at: now,
        updated_at: now,
      }).eq("id", caseId),
    ]);
    if (itemError) throw itemError;
    if (caseError) throw caseError;

    await notifyCreator({
      decision,
      title: item.title,
      subjectType,
      note,
      locationId: item.location_id ? String(item.location_id) : null,
      organizationId: item.organization_id ? String(item.organization_id) : null,
    });
  }

  revalidatePath("/admin/dashboard/events-experiences/moderation");
  revalidatePath("/admin/dashboard/events-experiences");
  revalidatePath("/admin/dashboard/fraud");
  revalidatePath("/events");
  revalidatePath("/experiences");
  revalidatePath("/locations/dashboard/events-experiences");
  revalidatePath("/organizers/dashboard");

  const notice = decision === "approve"
    ? "Submission approved and published."
    : decision === "deny"
      ? "Submission denied and removed from the moderation queue."
      : "More details requested. The submission will stay on hold.";
  redirect(`/admin/dashboard/events-experiences/moderation?notice=${encodeURIComponent(notice)}`);
}
