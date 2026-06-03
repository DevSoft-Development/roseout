import { handleOptions } from "../_shared/cors.ts";
import { badRequest, forbidden, ok, serverError, unauthorized } from "../_shared/response.ts";
import { getUserFromRequest } from "../_shared/auth.ts";
import { createSupabaseAdminClient } from "../_shared/supabaseAdmin.ts";
import { logEdgeFunctionRun, safeError, startTimer } from "../_shared/logger.ts";

const ADMIN_ROLES = new Set(["admin", "superadmin"]);

type SessionRow = Record<string, any>;
type CountSummary = {
  supportTicketsAnswered: number;
  supportTicketsMarkedComplete: number;
  supportTicketsResolved: number;
  supportTicketsClosed: number;
  supportTicketWorkMinutes: number;
  siteVisits: number;
  verifiedSiteVisits: number;
  socialMessagesSent: number;
  socialRepliesReceived: number;
};

const EMPTY_COUNTS: CountSummary = {
  supportTicketsAnswered: 0,
  supportTicketsMarkedComplete: 0,
  supportTicketsResolved: 0,
  supportTicketsClosed: 0,
  supportTicketWorkMinutes: 0,
  siteVisits: 0,
  verifiedSiteVisits: 0,
  socialMessagesSent: 0,
  socialRepliesReceived: 0,
};

function csvEscape(value: unknown): string {
  const raw = value == null ? "" : String(value);
  return /[",\n]/.test(raw) ? `"${raw.replaceAll('"', '""')}"` : raw;
}

function csv(rows: unknown[][]): string {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

function addOneDayExclusive(value: string): string {
  const base = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value;
  const date = new Date(base);
  if (Number.isNaN(date.getTime())) return value;
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

function hours(minutes: unknown): number {
  return Number(minutes || 0) / 60;
}

function payForSession(session: SessionRow): number {
  return hours(session.total_minutes) * Number(session.team_member_profiles?.hourly_rate || 0);
}

function countsFor(map: Map<string, CountSummary>, sessionId: string): CountSummary {
  return map.get(sessionId) ?? { ...EMPTY_COUNTS };
}

function increment(map: Map<string, CountSummary>, sessionId: string, changes: Partial<CountSummary>) {
  const current = countsFor(map, sessionId);
  for (const [key, value] of Object.entries(changes)) {
    current[key as keyof CountSummary] += Number(value || 0);
  }
  map.set(sessionId, current);
}

function roleFromUserMetadata(user: { app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> }): string | null {
  const role = user.app_metadata?.role ?? user.user_metadata?.role;
  return role ? String(role).toLowerCase() : null;
}

async function roleFromTable(supabase: ReturnType<typeof createSupabaseAdminClient>, table: string, userId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.from(table).select("role").eq("user_id", userId).maybeSingle();
    if (error || !data?.role) return null;
    return String(data.role).toLowerCase();
  } catch {
    return null;
  }
}

async function requireAdminOrSuperadmin(req: Request, supabase: ReturnType<typeof createSupabaseAdminClient>) {
  const user = await getUserFromRequest(req, supabase);
  if (!user) throw new Error("UNAUTHORIZED: valid user JWT required");

  const metadataRole = roleFromUserMetadata(user);
  if (metadataRole && ADMIN_ROLES.has(metadataRole)) return { user, role: metadataRole };

  for (const table of ["profiles", "admin_users"]) {
    const tableRole = await roleFromTable(supabase, table, user.id);
    if (tableRole && ADMIN_ROLES.has(tableRole)) return { user, role: tableRole };
  }

  throw new Error("FORBIDDEN: admin or superadmin role required");
}

async function loadSessionCounts(supabase: ReturnType<typeof createSupabaseAdminClient>, sessionIds: string[]): Promise<Map<string, CountSummary>> {
  const counts = new Map<string, CountSummary>();
  if (!sessionIds.length) return counts;

  const [supportResult, siteResult, socialResult] = await Promise.all([
    supabase
      .from("team_work_activities")
      .select("work_session_id,ticket_action,minutes_spent")
      .in("work_session_id", sessionIds)
      .eq("activity_type", "support_ticket"),
    supabase
      .from("ambassador_site_visits")
      .select("work_session_id,location_verification_status")
      .in("work_session_id", sessionIds),
    supabase
      .from("ambassador_social_outreach")
      .select("work_session_id,message_status,reply_status")
      .in("work_session_id", sessionIds),
  ]);

  if (supportResult.error) throw supportResult.error;
  if (siteResult.error) throw siteResult.error;
  if (socialResult.error) throw socialResult.error;

  for (const activity of supportResult.data ?? []) {
    const sessionId = activity.work_session_id;
    if (!sessionId) continue;
    const action = String(activity.ticket_action ?? "").toLowerCase();
    increment(counts, sessionId, {
      supportTicketsAnswered: action === "answered" ? 1 : 0,
      supportTicketsMarkedComplete: action === "marked_complete" ? 1 : 0,
      supportTicketsResolved: action === "resolved" ? 1 : 0,
      supportTicketsClosed: action === "closed" ? 1 : 0,
      supportTicketWorkMinutes: Number(activity.minutes_spent || 0),
    });
  }

  for (const visit of siteResult.data ?? []) {
    if (!visit.work_session_id) continue;
    increment(counts, visit.work_session_id, {
      siteVisits: 1,
      verifiedSiteVisits: visit.location_verification_status === "verified" ? 1 : 0,
    });
  }

  for (const outreach of socialResult.data ?? []) {
    if (!outreach.work_session_id) continue;
    increment(counts, outreach.work_session_id, {
      socialMessagesSent: outreach.message_status === "sent" ? 1 : 0,
      socialRepliesReceived: outreach.reply_status && outreach.reply_status !== "no_reply" ? 1 : 0,
    });
  }

  return counts;
}

function buildDetailCsv(sessions: SessionRow[], countMap: Map<string, CountSummary>): string {
  const header = [
    "work_session_id",
    "team_member_id",
    "user_id",
    "team_type",
    "work_type",
    "clock_in_at",
    "clock_out_at",
    "approved_minutes",
    "approved_hours",
    "paid_travel_minutes",
    "mileage",
    "reimbursement_amount",
    "hourly_rate",
    "gross_pay",
    "total_pay",
    "support_tickets_answered",
    "support_tickets_marked_complete",
    "support_tickets_resolved",
    "support_tickets_closed",
    "support_ticket_work_minutes",
    "site_visits",
    "verified_site_visits",
    "social_messages_sent",
    "social_replies_received",
    "is_training",
    "is_demo",
    "user_notes",
    "admin_notes",
  ];

  return csv([
    header,
    ...sessions.map((session) => {
      const counts = countsFor(countMap, session.id);
      const grossPay = payForSession(session);
      const totalPay = grossPay + Number(session.reimbursement_amount || 0);
      return [
        session.id,
        session.team_member_id,
        session.user_id,
        session.team_member_profiles?.team_type ?? session.team_type,
        session.work_type,
        session.clock_in_at,
        session.clock_out_at,
        session.total_minutes || 0,
        hours(session.total_minutes),
        session.paid_travel_minutes || 0,
        session.mileage || 0,
        session.reimbursement_amount || 0,
        session.team_member_profiles?.hourly_rate ?? "",
        grossPay,
        totalPay,
        counts.supportTicketsAnswered,
        counts.supportTicketsMarkedComplete,
        counts.supportTicketsResolved,
        counts.supportTicketsClosed,
        counts.supportTicketWorkMinutes,
        counts.siteVisits,
        counts.verifiedSiteVisits,
        counts.socialMessagesSent,
        counts.socialRepliesReceived,
        session.is_training ?? false,
        session.is_demo ?? false,
        session.user_notes,
        session.admin_notes,
      ];
    }),
  ]);
}

function buildSummaryCsv(sessions: SessionRow[], countMap: Map<string, CountSummary>): string {
  const byMember = new Map<string, Record<string, any>>();

  for (const session of sessions) {
    const key = session.team_member_id ?? session.user_id;
    const counts = countsFor(countMap, session.id);
    const current = byMember.get(key) ?? {
      teamMemberId: session.team_member_id,
      userId: session.user_id,
      teamType: session.team_member_profiles?.team_type ?? session.team_type,
      sessionCount: 0,
      approvedMinutes: 0,
      paidTravelMinutes: 0,
      mileage: 0,
      reimbursements: 0,
      hourlyRate: session.team_member_profiles?.hourly_rate ?? "",
      grossPay: 0,
      totalPay: 0,
      ...EMPTY_COUNTS,
    };

    current.sessionCount += 1;
    current.approvedMinutes += Number(session.total_minutes || 0);
    current.paidTravelMinutes += Number(session.paid_travel_minutes || 0);
    current.mileage += Number(session.mileage || 0);
    current.reimbursements += Number(session.reimbursement_amount || 0);
    current.grossPay += payForSession(session);
    current.totalPay += payForSession(session) + Number(session.reimbursement_amount || 0);
    for (const key of Object.keys(EMPTY_COUNTS) as Array<keyof CountSummary>) {
      current[key] += counts[key];
    }
    byMember.set(key, current);
  }

  return csv([
    [
      "team_member_id",
      "user_id",
      "team_type",
      "session_count",
      "approved_hours",
      "paid_travel_hours",
      "mileage",
      "reimbursement_amount",
      "hourly_rate",
      "gross_pay",
      "total_pay",
      "support_tickets_answered",
      "support_tickets_marked_complete",
      "support_tickets_resolved",
      "support_tickets_closed",
      "support_ticket_work_minutes",
      "site_visits",
      "verified_site_visits",
      "social_messages_sent",
      "social_replies_received",
    ],
    ...Array.from(byMember.values()).map((row) => [
      row.teamMemberId,
      row.userId,
      row.teamType,
      row.sessionCount,
      row.approvedMinutes / 60,
      row.paidTravelMinutes / 60,
      row.mileage,
      row.reimbursements,
      row.hourlyRate,
      row.grossPay,
      row.totalPay,
      row.supportTicketsAnswered,
      row.supportTicketsMarkedComplete,
      row.supportTicketsResolved,
      row.supportTicketsClosed,
      row.supportTicketWorkMinutes,
      row.siteVisits,
      row.verifiedSiteVisits,
      row.socialMessagesSent,
      row.socialRepliesReceived,
    ]),
  ]);
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return badRequest("POST is required.");

  const timer = startTimer();
  const supabase = createSupabaseAdminClient();

  try {
    const { user, role } = await requireAdminOrSuperadmin(req, supabase);
    const body = await req.json().catch(() => ({}));
    const start = String(body.payPeriodStart ?? "").trim();
    const end = String(body.payPeriodEnd ?? "").trim();
    const includeTraining = body.includeTraining === true;
    const force = body.force === true;
    if (!start || !end) return badRequest("payPeriodStart and payPeriodEnd are required.");

    let query = supabase
      .from("team_work_sessions")
      .select("*, team_member_profiles!inner(include_in_payroll,hourly_rate,team_type)")
      .eq("approval_status", "approved")
      .gte("clock_in_at", start)
      .lt("clock_in_at", addOneDayExclusive(end))
      .eq("team_member_profiles.include_in_payroll", true)
      .eq("is_demo", false);

    if (!force) query = query.is("exported_at", null);
    if (!includeTraining) query = query.eq("is_training", false);

    const { data, error } = await query;
    if (error) throw error;

    const sessions = (data ?? []) as SessionRow[];
    const sessionIds = sessions.map((session) => session.id);
    const countMap = await loadSessionCounts(supabase, sessionIds);
    const totalMinutes = sessions.reduce((total, session) => total + Number(session.total_minutes || 0), 0);
    const totalPaidTravelMinutes = sessions.reduce((total, session) => total + Number(session.paid_travel_minutes || 0), 0);
    const totalPay = sessions.reduce(
      (total, session) => total + payForSession(session) + Number(session.reimbursement_amount || 0),
      0,
    );

    const { data: batch, error: batchError } = await supabase
      .from("team_payroll_batches")
      .insert({
        pay_period_start: start,
        pay_period_end: end,
        exported_by: user.id,
        total_team_members: new Set(sessions.map((session) => session.team_member_id ?? session.user_id)).size,
        total_approved_hours: totalMinutes / 60,
        total_paid_travel_hours: totalPaidTravelMinutes / 60,
        total_estimated_pay: totalPay,
        notes: `Generated by ${role} with CSV metrics for ${sessions.length} approved sessions.`,
      })
      .select("*")
      .single();
    if (batchError) throw batchError;

    if (batch && sessions.length) {
      const { error: itemsError } = await supabase.from("team_payroll_batch_items").insert(
        sessions.map((session) => ({
          payroll_batch_id: batch.id,
          team_member_id: session.team_member_id,
          user_id: session.user_id,
          work_session_id: session.id,
          approved_minutes: session.total_minutes || 0,
          paid_travel_minutes: session.paid_travel_minutes || 0,
          mileage: session.mileage || 0,
          reimbursement_amount: session.reimbursement_amount || 0,
          hourly_rate: session.team_member_profiles?.hourly_rate || null,
          gross_pay: payForSession(session),
          total_pay: payForSession(session) + Number(session.reimbursement_amount || 0),
        })),
      );
      if (itemsError) throw itemsError;

      const { error: sessionsError } = await supabase
        .from("team_work_sessions")
        .update({ payroll_batch_id: batch.id, exported_at: new Date().toISOString(), status: "exported" })
        .in("id", sessionIds);
      if (sessionsError) throw sessionsError;
    }

    const totals = sessions.reduce(
      (summary, session) => {
        const counts = countsFor(countMap, session.id);
        for (const key of Object.keys(EMPTY_COUNTS) as Array<keyof CountSummary>) {
          summary[key] += counts[key];
        }
        return summary;
      },
      {
        sessionCount: sessions.length,
        teamMemberCount: new Set(sessions.map((session) => session.team_member_id ?? session.user_id)).size,
        approvedHours: totalMinutes / 60,
        paidTravelHours: totalPaidTravelMinutes / 60,
        estimatedPay: totalPay,
        ...EMPTY_COUNTS,
      },
    );

    await logEdgeFunctionRun(supabase, {
      function_name: "export-team-payroll",
      status: "success",
      source: "admin",
      duration_ms: timer(),
      output_summary: { batchId: batch.id, ...totals },
    });

    return ok({
      success: true,
      batchId: batch.id,
      summaryCsv: buildSummaryCsv(sessions, countMap),
      detailCsv: body.includeDetails === false ? null : buildDetailCsv(sessions, countMap),
      totals,
    });
  } catch (error) {
    const message = safeError(error);
    await logEdgeFunctionRun(supabase, {
      function_name: "export-team-payroll",
      status: "error",
      source: "admin",
      duration_ms: timer(),
      error_message: message,
    });
    if (message.startsWith("UNAUTHORIZED:")) return unauthorized(message.replace("UNAUTHORIZED: ", ""));
    if (message.startsWith("FORBIDDEN:")) return forbidden(message.replace("FORBIDDEN: ", ""));
    return serverError("export-team-payroll failed", message);
  }
});
