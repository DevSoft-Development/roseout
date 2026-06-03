import { handleOptions } from "../_shared/cors.ts";
import { badRequest, ok, serverError } from "../_shared/response.ts";
import { createSupabaseAdminClient } from "../_shared/supabaseAdmin.ts";
import { logEdgeFunctionRun, safeError, startTimer } from "../_shared/logger.ts";

type SessionRow = Record<string, any>;
type CountSummary = {
  supportTickets: number;
  supportAnswered: number;
  supportMarkedComplete: number;
  supportResolved: number;
  siteVisits: number;
  verifiedSiteVisits: number;
  socialOutreach: number;
  socialMessagesSent: number;
};

const EMPTY_COUNTS: CountSummary = {
  supportTickets: 0,
  supportAnswered: 0,
  supportMarkedComplete: 0,
  supportResolved: 0,
  siteVisits: 0,
  verifiedSiteVisits: 0,
  socialOutreach: 0,
  socialMessagesSent: 0,
};

function csvEscape(value: unknown): string {
  const raw = value == null ? "" : String(value);
  return /[",\n]/.test(raw) ? `"${raw.replaceAll('"', '""')}"` : raw;
}

function csv(rows: unknown[][]): string {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

function toEndOfDay(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59.999Z` : value;
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

async function loadSessionCounts(supabase: any, sessionIds: string[]): Promise<Map<string, CountSummary>> {
  const counts = new Map<string, CountSummary>();
  if (!sessionIds.length) return counts;

  const [{ data: supportActivities, error: supportError }, { data: siteVisits, error: siteError }, { data: socialOutreach, error: socialError }] = await Promise.all([
    supabase
      .from("team_work_activities")
      .select("work_session_id,source_id,ticket_action")
      .in("work_session_id", sessionIds)
      .eq("activity_type", "support_ticket")
      .eq("payroll_eligible", true),
    supabase
      .from("ambassador_site_visits")
      .select("work_session_id,location_verification_status")
      .in("work_session_id", sessionIds),
    supabase
      .from("ambassador_social_outreach")
      .select("work_session_id,message_status")
      .in("work_session_id", sessionIds),
  ]);

  if (supportError) throw supportError;
  if (siteError) throw siteError;
  if (socialError) throw socialError;

  const ticketIdsBySession = new Map<string, Set<string>>();
  for (const activity of supportActivities ?? []) {
    const sessionId = activity.work_session_id;
    if (!sessionId) continue;
    const action = String(activity.ticket_action ?? "");
    if (activity.source_id) {
      const ticketIds = ticketIdsBySession.get(sessionId) ?? new Set<string>();
      ticketIds.add(activity.source_id);
      ticketIdsBySession.set(sessionId, ticketIds);
    }
    increment(counts, sessionId, {
      supportAnswered: action === "answered" ? 1 : 0,
      supportMarkedComplete: action === "marked_complete" ? 1 : 0,
      supportResolved: action === "resolved" ? 1 : 0,
    });
  }

  for (const [sessionId, ticketIds] of ticketIdsBySession) {
    increment(counts, sessionId, { supportTickets: ticketIds.size });
  }

  for (const visit of siteVisits ?? []) {
    if (!visit.work_session_id) continue;
    increment(counts, visit.work_session_id, {
      siteVisits: 1,
      verifiedSiteVisits: visit.location_verification_status === "verified" ? 1 : 0,
    });
  }

  for (const outreach of socialOutreach ?? []) {
    if (!outreach.work_session_id) continue;
    increment(counts, outreach.work_session_id, {
      socialOutreach: 1,
      socialMessagesSent: outreach.message_status === "sent" ? 1 : 0,
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
    "support_ticket_count",
    "support_answered_count",
    "support_marked_complete_count",
    "support_resolved_count",
    "site_visit_count",
    "verified_site_visit_count",
    "social_outreach_count",
    "social_messages_sent_count",
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
        counts.supportTickets,
        counts.supportAnswered,
        counts.supportMarkedComplete,
        counts.supportResolved,
        counts.siteVisits,
        counts.verifiedSiteVisits,
        counts.socialOutreach,
        counts.socialMessagesSent,
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
      "support_ticket_count",
      "support_answered_count",
      "support_marked_complete_count",
      "support_resolved_count",
      "site_visit_count",
      "verified_site_visit_count",
      "social_outreach_count",
      "social_messages_sent_count",
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
      row.supportTickets,
      row.supportAnswered,
      row.supportMarkedComplete,
      row.supportResolved,
      row.siteVisits,
      row.verifiedSiteVisits,
      row.socialOutreach,
      row.socialMessagesSent,
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
    const body = await req.json().catch(() => ({}));
    const start = String(body.payPeriodStart ?? "").trim();
    const end = String(body.payPeriodEnd ?? "").trim();
    if (!start || !end) return badRequest("payPeriodStart and payPeriodEnd are required.");

    let query = supabase
      .from("team_work_sessions")
      .select("*, team_member_profiles!inner(include_in_payroll,hourly_rate,team_type)")
      .eq("approval_status", "approved")
      .gte("clock_in_at", start)
      .lte("clock_in_at", toEndOfDay(end))
      .eq("team_member_profiles.include_in_payroll", true);

    if (!body.force) query = query.is("exported_at", null);
    if (!body.includeTraining) query = query.eq("is_training", false).eq("is_demo", false);

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
        total_team_members: new Set(sessions.map((session) => session.team_member_id)).size,
        total_approved_hours: totalMinutes / 60,
        total_paid_travel_hours: totalPaidTravelMinutes / 60,
        total_estimated_pay: totalPay,
        notes: `Generated with detailed CSV metrics for ${sessions.length} sessions.`,
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

    const aggregateCounts = sessions.reduce((totals, session) => {
      const counts = countsFor(countMap, session.id);
      for (const key of Object.keys(EMPTY_COUNTS) as Array<keyof CountSummary>) {
        totals[key] += counts[key];
      }
      return totals;
    }, { ...EMPTY_COUNTS });

    await logEdgeFunctionRun(supabase, {
      function_name: "export-team-payroll",
      status: "success",
      source: "admin",
      duration_ms: timer(),
      output_summary: { sessionCount: sessions.length, totalPay, ...aggregateCounts },
    });

    return ok({
      success: true,
      batch,
      sessionCount: sessions.length,
      totalApprovedHours: totalMinutes / 60,
      totalPaidTravelHours: totalPaidTravelMinutes / 60,
      totalEstimatedPay: totalPay,
      counts: aggregateCounts,
      summaryCsv: buildSummaryCsv(sessions, countMap),
      detailCsv: buildDetailCsv(sessions, countMap),
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
    return serverError("export-team-payroll failed", message);
  }
});
