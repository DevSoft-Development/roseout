import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { formatMinutes, getActiveSession, getAllowedWorkTypesForUser } from "@/lib/team-tools";

export function workspaceActions(profile: any, base = "/admin/dashboard/crm") {
  return [
    { label: "My Tasks", href: `${base}/work-queue?view=tasks`, enabled: true, description: "View assigned CRM, outreach, support, and follow-up work from the workspace task queue.", cta: "Open Tasks", explanation: "Tasks are available to every active workspace profile." },
    { label: "My CRM", href: `${base}/accounts`, enabled: true, description: base.startsWith("/admin") ? "Work Partner Launch locations and partner leads." : "Work assigned partner leads.", cta: "Open CRM", explanation: "Limited CRM access is available to every active workspace profile." },
    { label: "Site Visits", href: `${base}/outreach?view=site-visits`, enabled: Boolean(profile.can_do_site_visits), description: "Start physical site visit check-ins. GPS is requested only inside this workflow.", cta: "Start Visit", explanation: "Your team profile does not currently allow site visit check-ins." },
    { label: "Social Outreach", href: `${base}/outreach?view=social-outreach`, enabled: Boolean(profile.can_do_social_outreach), description: "Log social outreach, screenshots, replies, and follow-ups for permitted locations.", cta: "Log Outreach", explanation: "Your team profile does not currently allow social outreach." },
    { label: "Support Work", href: `${base}/operations?view=support`, enabled: Boolean(profile.can_work_support_tickets), description: "Work existing support tickets remotely without GPS or proof-picture requirements.", cta: "Open Support", explanation: "Your team profile does not currently allow support ticket work." },
    { label: "Follow-Ups", href: `${base}/work-queue?view=follow-ups`, enabled: true, description: "Work today’s partner sales follow-ups.", cta: "Open Follow-Ups", explanation: "Follow-ups are available to every active workspace profile." },
    { label: "Claim Codes", href: `${base}/outreach?view=claim-codes`, enabled: Boolean(profile.can_send_claim_codes), description: "Send or log claim links and QR delivery.", cta: "Open Claim Codes", explanation: "Claim-code sending is not enabled for your team profile." },
    { label: "Change Requests", href: `${base}/operations?view=change-requests`, enabled: true, description: "Track protected location field changes that require manager approval.", cta: "Open Requests", explanation: "Change requests are available to every active workspace profile." },
    { label: "Demo / Training", href: `${base}/operations?view=demo`, enabled: Boolean(profile.can_use_demo_mode), description: "Practice with private demo session copies that never write fake businesses into public.locations.", cta: "Open Demo", explanation: "Demo/training mode is not enabled for your team profile." },
    { label: "Knowledge Base", href: `${base}/operations?view=knowledge-base`, enabled: true, description: "Sales scripts, objection handling, and setup guides.", cta: "Open KB", explanation: "Knowledge Base is available to every active workspace profile." },
    { label: "Notifications", href: `${base}/work-queue?view=notifications`, enabled: true, description: "Review task, follow-up, correction, payroll, and training notifications.", cta: "Open Notifications", explanation: "Notifications are available to every active workspace profile." },
    { label: "My Performance", href: `${base}/operations?view=performance`, enabled: true, description: "Track outreach, claims, and partner readiness.", cta: "View Performance", explanation: "Performance is available to every active workspace profile." },
    { label: "My Payroll", href: `/admin/dashboard/team/payroll`, enabled: true, description: "Review approved sessions, payroll status, and exported batches.", cta: "Open Payroll", explanation: "Payroll history is available to every workspace profile." },
  ];
}

async function ownCount(table: string, userId: string, filters: Record<string, string> = {}) {
  let query = supabaseAdmin.from(table).select("id", { count: "exact", head: true }).eq("user_id", userId);
  for (const [key, value] of Object.entries(filters)) query = query.eq(key, value);
  const { count } = await query;
  return count || 0;
}

export async function loadWorkspaceDashboardData(userId: string, profile: any) {
  const [allowedWorkTypes, activeSession, recent, tasks, followUps, notifications, pendingHours, approvedHours, visits, social, support, claimCodes, activePartners, claimToSend, claimSent, claimsStarted, paymentPending, reservationSetup, embedToSend, embedFollowUp, discoveryNeeded, atRisk] = await Promise.all([
    getAllowedWorkTypesForUser(userId, profile),
    getActiveSession(userId),
    supabaseAdmin.from("team_work_sessions").select("*").eq("user_id", userId).order("clock_in_at", { ascending: false }).limit(8),
    supabaseAdmin.from("workspace_tasks").select("id", { count: "exact", head: true }).eq("assigned_to_user_id", userId).in("status", ["not_started", "in_progress", "blocked", "needs_review"]),
    supabaseAdmin.from("team_follow_ups").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "pending").lte("follow_up_at", new Date(Date.now() + 7 * 86400000).toISOString()),
    supabaseAdmin.from("workspace_notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).is("read_at", null),
    supabaseAdmin.from("team_work_sessions").select("total_minutes").eq("user_id", userId).eq("approval_status", "pending_review"),
    supabaseAdmin.from("team_work_sessions").select("total_minutes").eq("user_id", userId).eq("approval_status", "approved"),
    ownCount("ambassador_site_visits", userId),
    ownCount("ambassador_social_outreach", userId),
    ownCount("team_work_activities", userId, { activity_type: "support_ticket" }),
    supabaseAdmin.from("claim_code_audit_logs").select("id", { count: "exact", head: true }).eq("actor_user_id", userId),
    supabaseAdmin.from("locations").select("id", { count: "exact", head: true }).in("partner_sales_status", ["active_partner", "reservation_ready"]),
    supabaseAdmin.from("locations").select("id", { count: "exact", head: true }).eq("claim_outreach_status", "not_sent"),
    supabaseAdmin.from("locations").select("id", { count: "exact", head: true }).eq("claim_outreach_status", "sent"),
    supabaseAdmin.from("locations").select("id", { count: "exact", head: true }).eq("claim_outreach_status", "started"),
    supabaseAdmin.from("locations").select("id", { count: "exact", head: true }).eq("partner_sales_status", "payment_pending"),
    supabaseAdmin.from("locations").select("id", { count: "exact", head: true }).in("reservation_portal_status", ["not_enabled", "needs_setup"]),
    supabaseAdmin.from("locations").select("id", { count: "exact", head: true }).in("reservation_embed_status", ["not_sent", "generated"]),
    supabaseAdmin.from("locations").select("id", { count: "exact", head: true }).eq("reservation_embed_status", "sent"),
    supabaseAdmin.from("locations").select("id", { count: "exact", head: true }).neq("discovery_profile_status", "ready"),
    supabaseAdmin.from("locations").select("id", { count: "exact", head: true }).eq("partner_sales_status", "at_risk"),
  ]);

  const sumMinutes = (rows: any[] | null) => (rows || []).reduce((total, row) => total + Number(row.total_minutes || 0), 0);

  return {
    allowedWorkTypes,
    activeSession,
    recentSessions: recent.data || [],
    metrics: [
      { label: "Active Partners", value: activePartners.count || 0, href: "/admin/dashboard/crm/accounts?view=active-partners" },
      { label: "Monthly Partner Revenue", value: `$${((activePartners.count || 0) * 99).toLocaleString()}` },
      { label: "Partner Sales Today", value: followUps.count || 0, href: "/admin/dashboard/crm/work-queue?view=follow-ups" },
      { label: "Follow-Ups Due Today", value: followUps.count || 0, href: "/admin/dashboard/crm/work-queue?view=follow-ups" },
      { label: "Claim Invitations to Send", value: claimToSend.count || 0, href: "/admin/dashboard/crm/outreach?view=claim-codes" },
      { label: "Claim Sent but Not Started", value: claimSent.count || 0, href: "/admin/dashboard/crm/accounts?view=claim-sent" },
      { label: "Claims Started", value: claimsStarted.count || 0 },
      { label: "Payment Pending", value: paymentPending.count || 0 },
      { label: "Reservation Setup Needed", value: reservationSetup.count || 0 },
      { label: "Embed Code to Send", value: embedToSend.count || 0 },
      { label: "Embed Install Follow-Up", value: embedFollowUp.count || 0 },
      { label: "Discovery Profile Needed", value: discoveryNeeded.count || 0 },
      { label: "At-Risk Partners", value: atRisk.count || 0 },
      { label: "Open tasks", value: tasks.count || 0, href: "/admin/dashboard/crm/work-queue?view=tasks" },
      { label: "Follow-ups due", value: followUps.count || 0, href: "/admin/dashboard/crm/work-queue?view=follow-ups" },
      { label: "Unread notifications", value: notifications.count || 0, href: "/admin/dashboard/crm/work-queue?view=notifications" },
      { label: "Pending hours", value: formatMinutes(sumMinutes(pendingHours.data)) },
      { label: "Approved hours", value: formatMinutes(sumMinutes(approvedHours.data)) },
      { label: "Site visits", value: visits },
      { label: "Social outreach", value: social },
      { label: "Support actions", value: support },
      { label: "Claim-code audit", value: claimCodes.count || 0 },
    ],
  };
}
