import { NextRequest, NextResponse } from "next/server";
import { requireCronRequest } from "@/lib/cron-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendOutingReminder } from "@/lib/outings/send-outing-reminder";
import { sendReservationPostVisitReview } from "@/lib/reservations/send-post-visit-review";
import { sendDueExternalBookingFollowups } from "@/lib/outings/external-booking";
import { generateConfirmToken } from "@/lib/tokens/secure-token";
import { getNextMorningFollowupDateForDate } from "@/lib/outings/planned-time-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_LATE_MS = 36 * 60 * 60 * 1000;

function localDateString(value: string | Date, timezone: string) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return map.year && map.month && map.day ? `${map.year}-${map.month}-${map.day}` : null;
}

function addDateDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days, 12));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

function followupDateForOuting(outing: Record<string, any>) {
  if (outing.next_morning_followup_date) {
    const direct = new Date(outing.next_morning_followup_date);
    if (!Number.isNaN(direct.getTime())) return direct;
  }

  const timezone = String(outing.timezone || "America/New_York");
  const context = String(outing.outing_date_context || "").trim().toLowerCase();
  let outingDate: string | null = /^\d{4}-\d{2}-\d{2}$/.test(context) ? context : null;

  if (!outingDate && outing.planned_for) outingDate = localDateString(outing.planned_for, timezone);

  if (!outingDate && outing.created_at) {
    const createdDate = localDateString(outing.created_at, timezone);
    if (createdDate) {
      if (context === "today" || context === "tonight") outingDate = createdDate;
      if (context === "tomorrow") outingDate = addDateDays(createdDate, 1);
      if (context === "this_weekend") {
        const [year, month, day] = createdDate.split("-").map(Number);
        const dow = new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
        const daysUntilSunday = (7 - dow) % 7;
        outingDate = addDateDays(createdDate, daysUntilSunday);
      }
    }
  }

  if (!outingDate) return null;
  const iso = getNextMorningFollowupDateForDate(outingDate, timezone);
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dueNow(date: Date | null, now: Date) {
  if (!date) return false;
  const age = now.getTime() - date.getTime();
  return age >= 0 && age <= MAX_LATE_MS;
}

async function processOutings(now: Date) {
  const { data: outings, error } = await supabaseAdmin
    .from("outings")
    .select("id,created_at,status,planned_for,timezone,outing_date_context,outing_time_confidence,next_morning_followup_enabled,next_morning_followup_date,next_morning_followup_sent_at,confirm_token,confirm_token_expires_at")
    .is("next_morning_followup_sent_at", null)
    .neq("status", "cancelled")
    .neq("outing_time_confidence", "none")
    .order("created_at", { ascending: false })
    .limit(250);
  if (error) throw error;

  let sent = 0;
  let skippedNoChannel = 0;
  const failures: Array<{ id: string; error: string }> = [];

  for (const outing of outings || []) {
    const due = followupDateForOuting(outing as Record<string, any>);
    if (!dueNow(due, now)) continue;

    let confirmToken = outing.confirm_token;
    if (!confirmToken) {
      confirmToken = generateConfirmToken();
      const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const { error: tokenError } = await supabaseAdmin
        .from("outings")
        .update({
          confirm_token: confirmToken,
          confirm_token_expires_at: expires,
          next_morning_followup_enabled: true,
          next_morning_followup_date: due?.toISOString() || null,
        })
        .eq("id", outing.id);
      if (tokenError) {
        failures.push({ id: outing.id, error: tokenError.message });
        continue;
      }
    }

    try {
      const result = await sendOutingReminder(outing.id, "next_morning_followup");
      if (!result.sent.length) {
        skippedNoChannel += 1;
        continue;
      }
      await supabaseAdmin.from("outings").update({ next_morning_followup_sent_at: new Date().toISOString() }).eq("id", outing.id).is("next_morning_followup_sent_at", null);
      sent += 1;
    } catch (err) {
      failures.push({ id: outing.id, error: err instanceof Error ? err.message : "unknown_error" });
    }
  }

  return { sent, skippedNoChannel, failures };
}

async function processReservations(now: Date) {
  const cutoff = localDateString(new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000), "America/New_York");
  let query = supabaseAdmin
    .from("location_reservations")
    .select("id,reservation_date,status,seated_at,completed_at")
    .in("status", ["seated", "completed"])
    .order("reservation_date", { ascending: false })
    .limit(250);
  if (cutoff) query = query.gte("reservation_date", cutoff);
  const { data: reservations, error } = await query;
  if (error) throw error;

  let sent = 0;
  let skipped = 0;
  const failures: Array<{ id: string; error: string }> = [];

  for (const reservation of reservations || []) {
    const dueIso = getNextMorningFollowupDateForDate(String(reservation.reservation_date), "America/New_York");
    const due = new Date(dueIso);
    if (!dueNow(due, now)) continue;
    try {
      const result = await sendReservationPostVisitReview(reservation.id);
      if (result.skipped) skipped += 1;
      else sent += 1;
    } catch (err) {
      failures.push({ id: reservation.id, error: err instanceof Error ? err.message : "unknown_error" });
    }
  }

  return { sent, skipped, failures };
}

export async function GET(request: NextRequest) {
  const authError = requireCronRequest(request);
  if (authError) return authError;

  const now = new Date();
  const [outings, reservations, externalBookings] = await Promise.all([
    processOutings(now),
    processReservations(now),
    sendDueExternalBookingFollowups(100),
  ]);
  const externalFailures = externalBookings.failed.map((item) => ({ id: item.id, error: item.error }));
  const failures = [...outings.failures, ...reservations.failures, ...externalFailures];

  return NextResponse.json({
    success: failures.length === 0,
    checked_at: now.toISOString(),
    outings: { sent: outings.sent, skipped_no_channel: outings.skippedNoChannel },
    reservations: { sent: reservations.sent, skipped: reservations.skipped },
    external_bookings: {
      confirmations_sent: externalBookings.sent.length,
      skipped: externalBookings.skipped.length,
      failed: externalBookings.failed.length,
    },
    failures: failures.slice(0, 25),
  }, { status: failures.length ? 207 : 200 });
}
