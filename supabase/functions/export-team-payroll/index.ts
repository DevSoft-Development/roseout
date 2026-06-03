import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function csvEscape(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function buildCsv(headers: string[], rows: Record<string, unknown>[]) {
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ].join("\n");
}

async function getAuthedAdmin(req: Request, supabaseUrl: string, anonKey: string, serviceRoleKey: string) {
  const authHeader = req.headers.get("Authorization") ?? "";

  if (!authHeader.startsWith("Bearer ")) {
    return { ok: false, error: "Missing bearer token", userId: null };
  }

  const token = authHeader.replace("Bearer ", "");

  const userClient = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();

  if (userError || !userData.user) {
    return { ok: false, error: "Invalid token", userId: null };
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const userId = userData.user.id;

  const { data: profile } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  const role = profile?.role;

  if (!["superadmin", "admin"].includes(role)) {
    return { ok: false, error: "Admin access required", userId };
  }

  return { ok: true, error: null, userId };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ success: false, error: "Missing Supabase environment variables" }, 500);
  }

  const adminCheck = await getAuthedAdmin(req, supabaseUrl, anonKey, serviceRoleKey);

  if (!adminCheck.ok) {
    return jsonResponse({ success: false, error: adminCheck.error }, 401);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const body = await req.json().catch(() => ({}));

    const payPeriodStart = body.payPeriodStart;
    const payPeriodEnd = body.payPeriodEnd;
    const includeTraining = body.includeTraining === true;
    const force = body.force === true;

    if (!payPeriodStart || !payPeriodEnd) {
      return jsonResponse(
        {
          success: false,
          error: "payPeriodStart and payPeriodEnd are required.",
        },
        400,
      );
    }

    const startIso = new Date(`${payPeriodStart}T00:00:00.000Z`).toISOString();
    const endDate = new Date(`${payPeriodEnd}T00:00:00.000Z`);
    endDate.setUTCDate(endDate.getUTCDate() + 1);
    const endIsoExclusive = endDate.toISOString();

    let sessionsQuery = supabase
      .from("team_work_sessions")
      .select("*, team_member_profiles(*)")
      .eq("approval_status", "approved")
      .gte("clock_in_at", startIso)
      .lt("clock_in_at", endIsoExclusive);

    if (!includeTraining) {
      sessionsQuery = sessionsQuery.eq("is_training", false).eq("is_demo", false);
    }

    if (!force) {
      sessionsQuery = sessionsQuery.is("exported_at", null);
    }

    const { data: sessions, error: sessionsError } = await sessionsQuery;

    if (sessionsError) {
      throw sessionsError;
    }

    const payableSessions = (sessions ?? []).filter((session: any) => {
      return session.team_member_profiles?.include_in_payroll === true;
    });

    const sessionIds = payableSessions.map((session: any) => session.id);

    const { data: activities, error: activityError } = sessionIds.length
      ? await supabase
          .from("team_work_activities")
          .select("*")
          .in("work_session_id", sessionIds)
      : { data: [], error: null };

    if (activityError) {
      throw activityError;
    }

    const activitiesBySession = new Map<string, any[]>();

    for (const activity of activities ?? []) {
      const key = activity.work_session_id;
      if (!activitiesBySession.has(key)) {
        activitiesBySession.set(key, []);
      }
      activitiesBySession.get(key)?.push(activity);
    }

    const summaryByTeamMember = new Map<string, any>();

    for (const session of payableSessions as any[]) {
      const profile = session.team_member_profiles;
      const teamMemberId = session.team_member_id;
      const sessionActivities = activitiesBySession.get(session.id) ?? [];
      const minutes = Number(session.total_minutes ?? 0);
      const approvedHours = minutes / 60;
      const hourlyRate = Number(profile?.hourly_rate ?? 0);
      const grossPay = approvedHours * hourlyRate;

      const existing = summaryByTeamMember.get(teamMemberId) ?? {
        team_member_id: teamMemberId,
        user_id: session.user_id,
        team_type: profile?.team_type ?? session.team_type ?? "",
        approved_hours: 0,
        paid_travel_hours: 0,
        mileage: 0,
        reimbursement_amount: 0,
        hourly_rate: hourlyRate,
        gross_pay: 0,
        total_pay: 0,
        site_visits: 0,
        verified_site_visits: 0,
        social_messages_sent: 0,
        social_replies_received: 0,
        support_tickets_answered: 0,
        support_tickets_marked_complete: 0,
        support_tickets_resolved: 0,
        support_tickets_closed: 0,
        support_ticket_work_minutes: 0,
      };

      existing.approved_hours += approvedHours;
      existing.paid_travel_hours += Number(session.paid_travel_minutes ?? 0) / 60;
      existing.mileage += Number(session.mileage ?? 0);
      existing.reimbursement_amount += Number(session.reimbursement_amount ?? 0);
      existing.gross_pay += grossPay;
      existing.total_pay += grossPay + Number(session.reimbursement_amount ?? 0);

      for (const activity of sessionActivities) {
        if (activity.activity_type === "site_visit") existing.site_visits += 1;
        if (activity.activity_type === "social_outreach") existing.social_messages_sent += 1;

        if (activity.activity_type === "support_ticket") {
          existing.support_ticket_work_minutes += Number(activity.minutes_spent ?? 0);

          if (activity.ticket_action === "answered") existing.support_tickets_answered += 1;
          if (activity.ticket_action === "marked_complete") existing.support_tickets_marked_complete += 1;
          if (activity.ticket_action === "resolved") existing.support_tickets_resolved += 1;
          if (activity.ticket_action === "closed") existing.support_tickets_closed += 1;
        }
      }

      summaryByTeamMember.set(teamMemberId, existing);
    }

    const summaryRows = Array.from(summaryByTeamMember.values());

    const totalApprovedHours = summaryRows.reduce((sum, row) => sum + row.approved_hours, 0);
    const totalEstimatedPay = summaryRows.reduce((sum, row) => sum + row.total_pay, 0);

    const { data: batch, error: batchError } = await supabase
      .from("team_payroll_batches")
      .insert({
        pay_period_start: payPeriodStart,
        pay_period_end: payPeriodEnd,
        status: "generated",
        exported_by: adminCheck.userId,
        total_team_members: summaryRows.length,
        total_approved_hours: totalApprovedHours,
        total_estimated_pay: totalEstimatedPay,
      })
      .select()
      .single();

    if (batchError) {
      throw batchError;
    }

    const batchItems = [];

    for (const session of payableSessions as any[]) {
      const profile = session.team_member_profiles;
      const approvedMinutes = Number(session.total_minutes ?? 0);
      const hourlyRate = Number(profile?.hourly_rate ?? 0);
      const grossPay = (approvedMinutes / 60) * hourlyRate;

      batchItems.push({
        payroll_batch_id: batch.id,
        team_member_id: session.team_member_id,
        user_id: session.user_id,
        work_session_id: session.id,
        approved_minutes: approvedMinutes,
        paid_travel_minutes: Number(session.paid_travel_minutes ?? 0),
        mileage: Number(session.mileage ?? 0),
        reimbursement_amount: Number(session.reimbursement_amount ?? 0),
        hourly_rate: hourlyRate,
        gross_pay: grossPay,
        total_pay: grossPay + Number(session.reimbursement_amount ?? 0),
      });
    }

    if (batchItems.length) {
      const { error: itemsError } = await supabase.from("team_payroll_batch_items").insert(batchItems);
      if (itemsError) throw itemsError;

      const { error: updateError } = await supabase
        .from("team_work_sessions")
        .update({
          payroll_batch_id: batch.id,
          exported_at: new Date().toISOString(),
          status: "exported",
        })
        .in("id", sessionIds);

      if (updateError) throw updateError;
    }

    const summaryHeaders = [
      "team_member_id",
      "user_id",
      "team_type",
      "approved_hours",
      "paid_travel_hours",
      "mileage",
      "reimbursement_amount",
      "hourly_rate",
      "gross_pay",
      "total_pay",
      "site_visits",
      "verified_site_visits",
      "social_messages_sent",
      "social_replies_received",
      "support_tickets_answered",
      "support_tickets_marked_complete",
      "support_tickets_resolved",
      "support_tickets_closed",
      "support_ticket_work_minutes",
    ];

    const detailRows = (activities ?? []).map((activity: any) => ({
      activity_id: activity.id,
      team_member_id: activity.team_member_id,
      user_id: activity.user_id,
      activity_type: activity.activity_type,
      source_type: activity.source_type,
      source_id: activity.source_id,
      ticket_number: activity.ticket_number,
      ticket_action: activity.ticket_action,
      ticket_status_before: activity.ticket_status_before,
      ticket_status_after: activity.ticket_status_after,
      started_at: activity.started_at,
      ended_at: activity.ended_at,
      minutes_spent: activity.minutes_spent,
      manager_review_status: activity.manager_review_status,
      notes: activity.notes,
    }));

    const detailHeaders = [
      "activity_id",
      "team_member_id",
      "user_id",
      "activity_type",
      "source_type",
      "source_id",
      "ticket_number",
      "ticket_action",
      "ticket_status_before",
      "ticket_status_after",
      "started_at",
      "ended_at",
      "minutes_spent",
      "manager_review_status",
      "notes",
    ];

    return jsonResponse({
      success: true,
      batchId: batch.id,
      totals: {
        sessions: payableSessions.length,
        teamMembers: summaryRows.length,
        totalApprovedHours,
        totalEstimatedPay,
      },
      summaryCsv: buildCsv(summaryHeaders, summaryRows),
      detailCsv: buildCsv(detailHeaders, detailRows),
    });
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});
