import { handleOptions } from "../_shared/cors.ts";
import { ok, serverError } from "../_shared/response.ts";
import { requireAdminOrCron } from "../_shared/auth.ts";
import { createSupabaseAdminClient } from "../_shared/supabaseAdmin.ts";
import { sendEmail } from "../_shared/email.ts";
import { logCronJobRun } from "../_shared/cronLogger.ts";
import { logEdgeFunctionRun, safeError, startTimer } from "../_shared/logger.ts";
import { resolveDemoReservationScope } from "../_shared/demoReservationScope.ts";
import {
  escapeHtml,
  formatDate,
  formatTime,
  recipientFrom,
  returnIfDisabled,
} from "../_shared/reservationCron.ts";

const JOB = "reservation-daily-digest";
const DEMO_DIGEST_EMAIL = "demo-reservations@theouthaven.com";

function nyDate(offset = 0) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date(Date.now() + offset * 86400000));
}

function count(rows: any[], predicate: (row: any) => boolean) {
  return rows.filter(predicate).length;
}

function html(digest: any) {
  const card = (label: string, value: any) =>
    `<div style="display:inline-block;width:29%;min-width:150px;border:1px solid #f3d5a5;border-radius:16px;padding:14px;margin:0 8px 10px 0"><div style="font-size:12px;color:#8a6a2d;text-transform:uppercase;font-weight:800">${label}</div><div style="font-size:28px;font-weight:900;color:#18181b">${value}</div></div>`;
  const rows = digest.upcoming
    .map(
      (row: any) =>
        `<tr><td>${escapeHtml(formatDate(row.reservation_date))}</td><td>${escapeHtml(formatTime(row.reservation_time))}</td><td>${escapeHtml(row.customer_name || "—")}</td><td>${escapeHtml(row.location_name || row.restaurant_name || row.activity_name || "—")}</td><td>${escapeHtml(row.party_size || "—")}</td><td>${escapeHtml(row.status || "—")}</td></tr>`,
    )
    .join("");
  return `<!doctype html><body style="margin:0;background:#f6f1ea;padding:24px;font-family:Arial,sans-serif;color:#18181b"><div style="max-width:920px;margin:auto;background:white;border-radius:22px;overflow:hidden;border:1px solid #ead7b7"><div style="background:#181014;color:white;padding:28px"><div style="color:#f0c36a;font-weight:900;text-transform:uppercase;letter-spacing:.09em">TheOutHaven Operations</div><h1>${digest.demoLocationId ? "Demo reservation digest" : "Reservation daily digest"}</h1><p>${escapeHtml(digest.today)} / ${escapeHtml(digest.tomorrow)} · Generated ${escapeHtml(new Date().toISOString())}</p></div><div style="padding:24px">${card("Today", digest.todayTotal)}${card("Tomorrow", digest.tomorrowTotal)}${card("Pending", digest.pending)}${card("Confirmed", digest.confirmed)}${card("Seated", digest.seated)}${card("New 24h", digest.newLast24h)}${card("Cancelled", digest.cancelled)}${card("No-show", digest.no_show)}${card("Issues", digest.issues.length)}<h2>Upcoming next 10</h2><table width="100%" style="border-collapse:collapse"><thead><tr style="background:#fff7ed"><th align="left">Date</th><th align="left">Time</th><th align="left">Guest</th><th align="left">Location</th><th align="left">Party</th><th align="left">Status</th></tr></thead><tbody>${rows || `<tr><td colspan="6">No upcoming reservations.</td></tr>`}</tbody></table><h2>Issues</h2>${digest.issues.length ? digest.issues.map((issue: string) => `<p style="background:#fff1f2;border:1px solid #fecdd3;border-radius:12px;padding:10px">${escapeHtml(issue)}</p>`).join("") : "<p>No obvious reservation data issues.</p>"}</div></div></body>`;
}

function text(digest: any) {
  return [
    digest.demoLocationId
      ? "TheOutHaven Lounge demo reservation digest"
      : "TheOutHaven reservation daily digest",
    `Today: ${digest.todayTotal}`,
    `Tomorrow: ${digest.tomorrowTotal}`,
    `Pending: ${digest.pending}`,
    `Confirmed: ${digest.confirmed}`,
    `Seated: ${digest.seated}`,
    `Completed: ${digest.completed}`,
    `Cancelled: ${digest.cancelled}`,
    `No-show: ${digest.no_show}`,
    `New last 24h: ${digest.newLast24h}`,
    `Issues: ${digest.issues.length}`,
    ...digest.issues.map((issue: string) => `- ${issue}`),
  ].join("\n");
}

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  const timer = startTimer();
  const startedAt = new Date().toISOString();
  const supabase = createSupabaseAdminClient();

  try {
    const auth = await requireAdminOrCron(req, supabase);
    const disabled = await returnIfDisabled(supabase, JOB, startedAt, timer);
    if (disabled) return disabled;

    const body = await req.json().catch(() => ({}));
    const demoLocationId = await resolveDemoReservationScope(supabase, body);
    const today = nyDate(0);
    const tomorrow = nyDate(1);
    const yesterday = nyDate(-1);
    const since = new Date(Date.now() - 86400000).toISOString();

    let windowQuery = supabase
      .from("location_reservations")
      .select("*")
      .gte("reservation_date", yesterday)
      .lte("reservation_date", tomorrow);
    if (demoLocationId) {
      windowQuery = windowQuery.eq("location_id", demoLocationId);
    }

    const { data: windowRows, error } = await windowQuery.limit(2000);
    if (error) throw error;

    const rows = windowRows || [];
    const upcoming = rows
      .filter(
        (row: any) =>
          [today, tomorrow].includes(String(row.reservation_date)) &&
          !["cancelled", "declined", "completed", "no_show"].includes(
            String(row.status),
          ),
      )
      .sort((a: any, b: any) =>
        String(a.reservation_date + a.reservation_time).localeCompare(
          String(b.reservation_date + b.reservation_time),
        ),
      )
      .slice(0, 10);

    let failedReminderQuery = supabase
      .from("reservation_reminders")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed");
    if (demoLocationId) {
      failedReminderQuery = failedReminderQuery.eq("location_id", demoLocationId);
    }
    const { count: failedReminderCount } = await failedReminderQuery;

    const issues: string[] = [];
    const missingContact = rows.filter(
      (row: any) => !row.customer_email || !row.customer_phone,
    ).length;
    const missingLocation = rows.filter((row: any) => !row.location_id).length;
    if (missingContact) {
      issues.push(
        `${missingContact} reservations are missing customer email or phone.`,
      );
    }
    if (missingLocation) {
      issues.push(`${missingLocation} reservations are missing location_id.`);
    }
    if (failedReminderCount) {
      issues.push(`${failedReminderCount} reservation reminders are failed.`);
    }

    const digest = {
      demoLocationId,
      today,
      tomorrow,
      todayTotal: count(rows, (row) => String(row.reservation_date) === today),
      tomorrowTotal: count(
        rows,
        (row) => String(row.reservation_date) === tomorrow,
      ),
      pending: count(rows, (row) => row.status === "pending"),
      confirmed: count(rows, (row) => row.status === "confirmed"),
      seated: count(rows, (row) =>
        ["seated", "arrived", "checked_in"].includes(String(row.status)),
      ),
      completed: count(rows, (row) => row.status === "completed"),
      cancelled: count(rows, (row) => row.status === "cancelled"),
      no_show: count(rows, (row) => row.status === "no_show"),
      newLast24h: count(
        rows,
        (row) => row.created_at && new Date(row.created_at) >= new Date(since),
      ),
      upcoming,
      issues,
    };

    const to = demoLocationId
      ? DEMO_DIGEST_EMAIL
      : recipientFrom([
          "ADMIN_RESERVATION_DIGEST_EMAIL",
          "ADMIN_EMAIL",
          "SUPERADMIN_EMAIL",
          "ADMIN_ALERT_EMAIL",
        ]);

    let email: any = { sent: false, skipped: true, reason: "sendEmail=false" };
    if (body.sendEmail !== false) {
      email = to
        ? await sendEmail({
            to,
            subject: demoLocationId
              ? "[DEMO] TheOutHaven Lounge reservation digest"
              : "TheOutHaven reservation daily digest",
            html: html(digest),
            text: text(digest),
          })
        : { sent: false, skipped: true, reason: "missing_recipient" };
    }

    const skipped = email.skipped ? 1 : 0;
    await logCronJobRun(supabase, {
      job_name: JOB,
      job_key: JOB,
      function_name: JOB,
      route_path: `supabase/functions/${JOB}`,
      description: "Production reservation daily digest Edge Function.",
      schedule_hint: "pg_cron: 30 6 * * *",
      source: "edge_function",
      status:
        email.skipped && !to && body.sendEmail !== false ? "skipped" : "success",
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      duration_ms: timer(),
      checked_count: rows.length,
      success_count: email.sent ? 1 : 0,
      skipped_count: skipped,
      failed_count: email.error ? 1 : 0,
      metadata: {
        digest,
        email,
        authSource: auth.source,
        demo_location_id: demoLocationId,
      },
    });

    await logEdgeFunctionRun(supabase, {
      function_name: JOB,
      status: "success",
      source: auth.source,
      duration_ms: timer(),
      output_summary: digest,
      metadata: { email, demo_location_id: demoLocationId },
    });

    return ok({ success: true, demoLocationId, email, digest });
  } catch (error) {
    const message = safeError(error);
    await logCronJobRun(supabase, {
      job_name: JOB,
      job_key: JOB,
      function_name: JOB,
      route_path: `supabase/functions/${JOB}`,
      source: "edge_function",
      status: "failed",
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      duration_ms: timer(),
      failed_count: 1,
      error_message: message,
    });
    return serverError(`${JOB} failed`, message);
  }
});
