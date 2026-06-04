import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { formatMinutes, getActiveSession, getAllowedWorkTypesForUser } from "@/lib/team-tools";

export function workspaceActions(profile: any, base = "/my-workspace") {
  return [
    { label: "My Tasks", href: `${base}/tasks`, enabled: true, description: "View assigned CRM, outreach, support, and follow-up work from the workspace task queue.", cta: "Open Tasks", explanation: "Tasks are available to every active workspace profile." },
    { label: "My CRM", href: `${base}/crm`, enabled: true, description: "Search assigned/permitted locations, add activities, and request protected field changes.", cta: "Open CRM", explanation: "Limited CRM access is available to every active workspace profile." },
    { label: "Site Visits", href: `${base}/site-visits`, enabled: Boolean(profile.can_do_site_visits), description: "Start physical site visit check-ins. GPS is requested only inside this workflow.", cta: "Start Visit", explanation: "Your team profile does not currently allow site visit check-ins." },
    { label: "Social Outreach", href: `${base}/social-outreach`, enabled: Boolean(profile.can_do_social_outreach), description: "Log social outreach, screenshots, replies, and follow-ups for permitted locations.", cta: "Log Outreach", explanation: "Your team profile does not currently allow social outreach." },
    { label: "Support Work", href: `${base}/support-work`, enabled: Boolean(profile.can_work_support_tickets), description: "Work existing support tickets remotely without GPS or proof-picture requirements.", cta: "Open Support", explanation: "Your team profile does not currently allow support ticket work." },
    { label: "Follow-Ups", href: `${base}/follow-ups`, enabled: true, description: "Complete, reschedule, or escalate due follow-ups tied to CRM, visits, social outreach, and tickets.", cta: "Open Follow-Ups", explanation: "Follow-ups are available to every active workspace profile." },
    { label: "Claim Codes", href: `${base}/claim-codes`, enabled: Boolean(profile.can_send_claim_codes), description: "Send or log audited claim-code delivery for permitted locations.", cta: "Open Claim Codes", explanation: "Claim-code sending is not enabled for your team profile." },
    { label: "Change Requests", href: `${base}/change-requests`, enabled: true, description: "Track protected location field changes that require manager approval.", cta: "Open Requests", explanation: "Change requests are available to every active workspace profile." },
    { label: "Demo / Training", href: `${base}/demo`, enabled: Boolean(profile.can_use_demo_mode), description: "Practice with private demo session copies that never write fake businesses into public.locations.", cta: "Open Demo", explanation: "Demo/training mode is not enabled for your team profile." },
    { label: "Knowledge Base", href: `${base}/knowledge-base`, enabled: true, description: "Read approved internal guides for your team type.", cta: "Open KB", explanation: "Knowledge Base is available to every active workspace profile." },
    { label: "Notifications", href: `${base}/notifications`, enabled: true, description: "Review task, follow-up, correction, payroll, and training notifications.", cta: "Open Notifications", explanation: "Notifications are available to every active workspace profile." },
    { label: "My Performance", href: `${base}/performance`, enabled: true, description: "Track approved hours, site visits, outreach, support tickets, claim codes, and corrections.", cta: "View Performance", explanation: "Performance is available to every active workspace profile." },
    { label: "My Payroll", href: `${base}/payroll`, enabled: true, description: "Review approved sessions, payroll status, and exported batches.", cta: "Open Payroll", explanation: "Payroll history is available to every workspace profile." },
  ];
}

async function ownCount(table: string, userId: string, filters: Record<string, string> = {}) {
  let query = supabaseAdmin.from(table).select("id", { count: "exact", head: true }).eq("user_id", userId);
  for (const [key, value] of Object.entries(filters)) query = query.eq(key, value);
  const { count } = await query;
  return count || 0;
}

export async function loadWorkspaceDashboardData(userId: string, profile: any) {
  const [allowedWorkTypes, activeSession, recent, tasks, followUps, notifications, pendingHours, approvedHours, visits, social, support, claimCodes] = await Promise.all([
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
  ]);

  const sumMinutes = (rows: any[] | null) => (rows || []).reduce((total, row) => total + Number(row.total_minutes || 0), 0);

  return {
    allowedWorkTypes,
    activeSession,
    recentSessions: recent.data || [],
    metrics: [
      { label: "Open tasks", value: tasks.count || 0, href: "/my-workspace/tasks" },
      { label: "Follow-ups due", value: followUps.count || 0, href: "/my-workspace/follow-ups" },
      { label: "Unread notifications", value: notifications.count || 0, href: "/my-workspace/notifications" },
      { label: "Pending hours", value: formatMinutes(sumMinutes(pendingHours.data)) },
      { label: "Approved hours", value: formatMinutes(sumMinutes(approvedHours.data)) },
      { label: "Site visits", value: visits },
      { label: "Social outreach", value: social },
      { label: "Support actions", value: support },
      { label: "Claim-code audit", value: claimCodes.count || 0 },
    ],
  };
}
