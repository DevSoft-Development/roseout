import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  marketingReportEmailHtml,
  runMarketingReport,
  type MarketingReportConfig,
} from "@/lib/admin/marketing-report-engine";

export const dynamic = "force-dynamic";

type ScheduleInput = {
  name: string;
  recipients: string[];
  cadence: "daily" | "weekly" | "monthly";
  dayOfWeek?: number;
  dayOfMonth?: number;
  sendHour?: number;
  sendMinute?: number;
  timezone?: string;
  reportId?: string | null;
  reportConfig: MarketingReportConfig;
};

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
  return { year: value("year"), month: value("month"), day: value("day"), hour: value("hour"), minute: value("minute"), second: value("second") };
}

function localDateTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string) {
  const desired = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let guess = new Date(desired);
  for (let i = 0; i < 3; i++) {
    const actual = zonedParts(guess, timeZone);
    const represented = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second, 0);
    guess = new Date(guess.getTime() + desired - represented);
  }
  return guess;
}

function nextRun(input: Pick<ScheduleInput, "cadence" | "dayOfWeek" | "dayOfMonth" | "sendHour" | "sendMinute" | "timezone">, from = new Date()) {
  const hour = Math.max(0, Math.min(23, Number(input.sendHour ?? 8)));
  const minute = Math.max(0, Math.min(59, Number(input.sendMinute ?? 0)));
  const timeZone = input.timezone || "America/New_York";
  const local = zonedParts(from, timeZone);

  for (let i = 0; i < 40; i++) {
    const calendar = new Date(Date.UTC(local.year, local.month - 1, local.day + i, 12, 0, 0));
    const year = calendar.getUTCFullYear();
    const month = calendar.getUTCMonth() + 1;
    const day = calendar.getUTCDate();
    const weekday = calendar.getUTCDay();
    if (input.cadence === "weekly" && weekday !== Number(input.dayOfWeek ?? 1)) continue;
    if (input.cadence === "monthly" && day !== Number(input.dayOfMonth ?? 1)) continue;
    const candidate = localDateTimeToUtc(year, month, day, hour, minute, timeZone);
    if (candidate > from) return candidate;
  }
  return new Date(from.getTime() + 7 * 86_400_000);
}

async function sendReportEmail(to: string[], reportName: string, config: MarketingReportConfig) {
  const recipients = [...new Set(to.map((v) => v.trim().toLowerCase()).filter(validEmail))];
  if (!recipients.length) throw new Error("At least one valid email recipient is required.");
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Email delivery is not configured.");

  const report = await runMarketingReport(config);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "TheOutHaven Admin <admin@theouthaven.com>",
      reply_to: "admin@theouthaven.com",
      to: recipients,
      subject: `TheOutHaven Marketing Report — ${reportName || report.title}`,
      html: marketingReportEmailHtml(report),
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.message || "The report email could not be sent.");
  return { report, providerMessageId: payload?.id || null, recipients };
}

async function processDueSchedules() {
  const now = new Date();
  const { data: due, error } = await supabaseAdmin
    .from("marketing_report_schedules")
    .select("*")
    .eq("is_active", true)
    .lte("next_run_at", now.toISOString())
    .order("next_run_at", { ascending: true })
    .limit(25);
  if (error) throw error;

  const results: Array<Record<string, unknown>> = [];
  for (const schedule of due || []) {
    try {
      const config = schedule.report_config as MarketingReportConfig;
      const sent = await sendReportEmail(schedule.recipients || [], schedule.name, config);
      const following = nextRun({
        cadence: schedule.cadence,
        dayOfWeek: schedule.day_of_week,
        dayOfMonth: schedule.day_of_month,
        sendHour: schedule.send_hour,
        sendMinute: schedule.send_minute,
        timezone: schedule.timezone || "America/New_York",
      }, now);
      await supabaseAdmin.from("marketing_report_schedules").update({
        last_sent_at: now.toISOString(),
        last_status: "sent",
        last_error: null,
        next_run_at: following.toISOString(),
        updated_at: now.toISOString(),
      }).eq("id", schedule.id);
      results.push({ id: schedule.id, sent: true, providerMessageId: sent.providerMessageId });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await supabaseAdmin.from("marketing_report_schedules").update({
        last_status: "failed",
        last_error: message.slice(0, 1000),
        updated_at: now.toISOString(),
      }).eq("id", schedule.id);
      results.push({ id: schedule.id, sent: false, error: message });
    }
  }
  return results;
}

export async function POST(request: Request) {
  const cronSecret = request.headers.get("x-cron-secret");
  const isCron = Boolean(process.env.CRON_SECRET) && cronSecret === process.env.CRON_SECRET;
  const body = await request.json().catch(() => ({}));

  if (body.action === "process_due" && isCron) {
    try {
      const results = await processDueSchedules();
      return NextResponse.json({ ok: true, processed: results.length, results });
    } catch (error) {
      return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Scheduler failed" }, { status: 500 });
    }
  }

  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.marketing);

  try {
    if (body.action === "run") {
      const report = await runMarketingReport(body.config as MarketingReportConfig);
      return NextResponse.json({ ok: true, report });
    }

    if (body.action === "save") {
      const config = body.config as MarketingReportConfig;
      const name = String(body.name || "Saved marketing report").trim().slice(0, 120);
      const { data, error } = await supabaseAdmin.from("marketing_saved_reports").insert({
        name,
        description: String(body.description || "").trim().slice(0, 500) || null,
        report_type: config.reportType,
        date_range: config.dateRange,
        comparison: config.comparison,
        breakdown: config.breakdown,
        filters: config.filters || {},
        created_by: admin.user_id,
      }).select("*").single();
      if (error) throw error;
      return NextResponse.json({ ok: true, savedReport: data });
    }

    if (body.action === "send_now") {
      const recipients = Array.isArray(body.recipients) && body.recipients.length ? body.recipients : [admin.email].filter(Boolean);
      const sent = await sendReportEmail(recipients, String(body.name || "Marketing report"), body.config as MarketingReportConfig);
      return NextResponse.json({ ok: true, recipients: sent.recipients, providerMessageId: sent.providerMessageId });
    }

    if (body.action === "schedule") {
      const input = body.schedule as ScheduleInput;
      const recipients = [...new Set((input.recipients || []).map((v) => String(v).trim().toLowerCase()).filter(validEmail))];
      if (!recipients.length) throw new Error("Add at least one email recipient.");
      const timezone = input.timezone || "America/New_York";
      const firstRun = nextRun({ ...input, timezone });
      const { data, error } = await supabaseAdmin.from("marketing_report_schedules").insert({
        report_id: input.reportId || null,
        name: String(input.name || "Marketing report").trim().slice(0, 120),
        report_config: input.reportConfig,
        recipients,
        cadence: input.cadence,
        day_of_week: input.cadence === "weekly" ? Number(input.dayOfWeek ?? 1) : null,
        day_of_month: input.cadence === "monthly" ? Number(input.dayOfMonth ?? 1) : null,
        send_hour: Number(input.sendHour ?? 8),
        send_minute: Number(input.sendMinute ?? 0),
        timezone,
        next_run_at: firstRun.toISOString(),
        created_by: admin.user_id,
      }).select("*").single();
      if (error) throw error;
      return NextResponse.json({ ok: true, schedule: data });
    }

    if (body.action === "toggle_schedule") {
      const id = String(body.id || "");
      const { error } = await supabaseAdmin.from("marketing_report_schedules").update({ is_active: Boolean(body.isActive), updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "Unknown report action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Marketing report request failed." }, { status: 500 });
  }
}
