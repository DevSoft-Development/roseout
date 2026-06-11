import { NextRequest, NextResponse } from "next/server";
import { trackEvent } from "@/lib/analytics/trackEvent";
import { supabaseAdmin } from "@/lib/supabase-admin";

const ELIGIBLE_STATUSES = ["saved", "link_clicked", "reservation_clicked", "call_clicked", "reminder_sent", "feedback_requested"];

type InferenceOuting = {
  id: string;
  location_id?: string | null;
  source_location_id?: string | null;
  status?: string | null;
  planned_for?: string | null;
  outing_time_confidence?: string | null;
  next_morning_followup_date?: string | null;
  attendance_confirmed_at?: string | null;
  attendance_declined_at?: string | null;
  completed_no_feedback_at?: string | null;
};

function hoursAgo(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function isDue(outing: InferenceOuting) {
  if (outing.attendance_confirmed_at || outing.attendance_declined_at || outing.completed_no_feedback_at) return false;
  if (outing.outing_time_confidence === "date_only") {
    return Boolean(outing.next_morning_followup_date && outing.next_morning_followup_date < daysAgo(2));
  }
  return Boolean(outing.planned_for && outing.planned_for < hoursAgo(18));
}

export async function POST(_req: NextRequest) {
  const { data, error } = await supabaseAdmin
    .from("outings")
    .select("id,location_id,source_location_id,status,planned_for,outing_time_confidence,next_morning_followup_date,attendance_confirmed_at,attendance_declined_at,completed_no_feedback_at")
    .in("status", ELIGIBLE_STATUSES)
    .is("completed_no_feedback_at", null)
    .limit(500);

  if (error) {
    return NextResponse.json({ ok: false, error: "query_failed" }, { status: 500 });
  }

  const due = (data as InferenceOuting[] || []).filter(isDue);
  const now = new Date().toISOString();
  const reason = "planned_time_passed_no_feedback";

  await Promise.allSettled(due.map(async (outing) => {
    await supabaseAdmin
      .from("outings")
      .update({
        status: "completed_no_feedback",
        completed_no_feedback_at: now,
        completion_inferred_at: now,
        completion_inferred_reason: reason,
      })
      .eq("id", outing.id)
      .is("completed_no_feedback_at", null);

    await trackEvent({
      event_name: "outing_completed_no_feedback",
      event_type: "conversion",
      conversion_step: "completed_no_feedback",
      outing_id: outing.id,
      location_id: outing.location_id,
      source_location_id: outing.source_location_id ?? outing.location_id,
      source: "outing_completion_inference",
      metadata: { reason, planned_for: outing.planned_for ?? null, outing_time_confidence: outing.outing_time_confidence ?? null },
    });
  }));

  return NextResponse.json({ ok: true, inferred: due.length });
}
