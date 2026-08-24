"use client";

import { useMemo, useState } from "react";
import {
  BarChart3,
  CalendarClock,
  Download,
  Mail,
  MapPin,
  Play,
  Save,
  Search,
  Send,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import type { MarketingReportConfig, MarketingReportResult, MarketingReportType } from "@/lib/admin/marketing-report-engine";

type SavedReport = {
  id: string;
  name: string;
  description: string | null;
  report_type: MarketingReportType;
  date_range: MarketingReportConfig["dateRange"];
  comparison: MarketingReportConfig["comparison"];
  breakdown: MarketingReportConfig["breakdown"];
  filters: Record<string, unknown> | null;
};

type ReportSchedule = {
  id: string;
  name: string;
  recipients: string[];
  cadence: string;
  day_of_week: number | null;
  day_of_month: number | null;
  send_hour: number;
  send_minute: number;
  next_run_at: string | null;
  last_status: string | null;
  is_active: boolean;
};

const REPORTS: Array<{ type: MarketingReportType; label: string; description: string; icon: typeof BarChart3 }> = [
  { type: "overview", label: "Marketing overview", description: "A complete pulse of traffic, searches, engagement and what is changing.", icon: TrendingUp },
  { type: "website_traffic", label: "Website traffic", description: "Visits, sessions, homepage traffic, Create views and time spent on site.", icon: Users },
  { type: "search_activity", label: "Search activity", description: "What people are searching for and how demand is changing.", icon: Search },
  { type: "search_funnel", label: "Search funnel", description: "See where visitors continue, complete the flow or drop off.", icon: BarChart3 },
  { type: "locations", label: "Locations", description: "Top locations, rising locations and changing audience interest.", icon: MapPin },
  { type: "neighborhoods", label: "Neighborhoods", description: "Top and trending neighborhoods across your markets.", icon: MapPin },
  { type: "cuisines", label: "Cuisines", description: "See which dining interests are gaining or losing momentum.", icon: Sparkles },
  { type: "activities", label: "Activities", description: "Understand which activities are drawing the most interest.", icon: Sparkles },
  { type: "occasions", label: "Occasions", description: "Date night, birthdays, brunch and other outing intent trends.", icon: Sparkles },
  { type: "acquisition", label: "Acquisition", description: "Compare Google, social, direct, email, QR and referral traffic.", icon: TrendingUp },
  { type: "campaigns", label: "Campaigns", description: "Compare campaign traffic and engagement in one place.", icon: BarChart3 },
  { type: "content", label: "Content performance", description: "Understand which social and marketing content is working best.", icon: Sparkles },
  { type: "email", label: "Email marketing", description: "Review email-driven visits and marketing actions.", icon: Mail },
  { type: "qr_postcards", label: "QR & postcards", description: "See how physical outreach is turning into digital activity.", icon: MapPin },
  { type: "events_experiences", label: "Events & experiences", description: "Track audience interest in events and experiences.", icon: CalendarClock },
  { type: "geography", label: "Geographic performance", description: "Compare neighborhoods, boroughs, cities and markets.", icon: MapPin },
];

const DATE_RANGES = [
  ["today", "Today"], ["yesterday", "Yesterday"], ["last_7_days", "Last 7 days"], ["last_30_days", "Last 30 days"], ["this_month", "This month"], ["last_month", "Last month"],
] as const;
const COMPARISONS = [
  ["previous_period", "Previous period"], ["previous_week", "Previous week"], ["previous_month", "Previous month"], ["none", "No comparison"],
] as const;
const BREAKDOWNS = [
  ["day", "Day"], ["week", "Week"], ["neighborhood", "Neighborhood"], ["borough", "Borough"], ["market", "Market"], ["source", "Traffic source"], ["campaign", "Campaign"], ["device", "Device"], ["location", "Location"], ["cuisine", "Cuisine"], ["activity", "Activity"],
] as const;

function changeText(value: number | null | undefined) {
  if (value == null) return "No earlier baseline";
  if (value === 0) return "No change";
  return `${value > 0 ? "+" : ""}${value}%`;
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export default function MarketingReportBuilder({
  initialType,
  savedReports,
  schedules,
  adminEmail,
}: {
  initialType: MarketingReportType;
  savedReports: SavedReport[];
  schedules: ReportSchedule[];
  adminEmail: string;
}) {
  const [config, setConfig] = useState<MarketingReportConfig>({ reportType: initialType, dateRange: "last_30_days", comparison: "previous_period", breakdown: "day", filters: {} });
  const [report, setReport] = useState<MarketingReportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [reportName, setReportName] = useState("My marketing report");
  const [emailRecipients, setEmailRecipients] = useState(adminEmail);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [cadence, setCadence] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [sendHour, setSendHour] = useState(8);
  const [sendMinute, setSendMinute] = useState(0);
  const selected = useMemo(() => REPORTS.find((r) => r.type === config.reportType) || REPORTS[0], [config.reportType]);

  async function api(body: Record<string, unknown>) {
    const response = await fetch("/api/admin/marketing/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error || "The report request could not be completed.");
    return payload;
  }

  async function runReport() {
    setBusy(true); setMessage(null);
    try {
      const payload = await api({ action: "run", config });
      setReport(payload.report);
      setMessage("Report refreshed with current data.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not run report."); }
    finally { setBusy(false); }
  }

  async function saveReport() {
    setBusy(true); setMessage(null);
    try {
      await api({ action: "save", name: reportName, config });
      setMessage("Report saved. It will be available under Saved reports after refresh.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save report."); }
    finally { setBusy(false); }
  }

  async function sendNow() {
    setBusy(true); setMessage(null);
    try {
      const recipients = emailRecipients.split(",").map((x) => x.trim()).filter(Boolean);
      const payload = await api({ action: "send_now", name: reportName, config, recipients });
      setMessage(`Report emailed to ${payload.recipients.join(", ")}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not email report."); }
    finally { setBusy(false); }
  }

  async function createSchedule() {
    setBusy(true); setMessage(null);
    try {
      const recipients = emailRecipients.split(",").map((x) => x.trim()).filter(Boolean);
      await api({ action: "schedule", schedule: { name: reportName, recipients, cadence, dayOfWeek, dayOfMonth, sendHour, sendMinute, timezone: "America/New_York", reportConfig: config } });
      setMessage(cadence === "weekly" && dayOfWeek === 1 ? "Scheduled. This report will be emailed every Monday." : `Scheduled. This report will be emailed ${cadence}.`);
      setScheduleOpen(false);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not schedule report."); }
    finally { setBusy(false); }
  }

  function loadSaved(saved: SavedReport) {
    setConfig({ reportType: saved.report_type, dateRange: saved.date_range, comparison: saved.comparison, breakdown: saved.breakdown, filters: (saved.filters || {}) as MarketingReportConfig["filters"] });
    setReportName(saved.name);
    setReport(null);
    setMessage(`Loaded “${saved.name}”. Run it to refresh with current data.`);
  }

  function exportCsv() {
    if (!report) return;
    const lines = [["Marketing report", report.title], ["Period", report.periodLabel], [], ["Metric", "Value", "Change"], ...report.metrics.map((m) => [m.label, m.value, changeText(m.changePct)]), [], ["Rank", "Result", "Activity", "Change"], ...report.rows.map((r, i) => [i + 1, r.label, r.value, changeText(r.changePct)])];
    const blob = new Blob([lines.map((row) => row.map(csvEscape).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `theouthaven-marketing-${config.reportType}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-red-600">Marketing intelligence</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">Build the report you need</h1>
            <p className="mt-2 text-sm leading-6 text-neutral-600">Choose what you want to understand, pick a time period, then run the report. No technical setup or analytics terminology required.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={runReport} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-neutral-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Play className="h-4 w-4" />Run report</button>
            <button onClick={saveReport} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold text-neutral-800"><Save className="h-4 w-4" />Save</button>
            <button onClick={sendNow} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold text-neutral-800"><Send className="h-4 w-4" />Email me now</button>
            <button onClick={() => setScheduleOpen((v) => !v)} className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700"><CalendarClock className="h-4 w-4" />Schedule email</button>
          </div>
        </div>

        {message ? <div className="mt-5 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">{message}</div> : null}

        <div className="mt-7 grid gap-5 xl:grid-cols-[1.3fr_.7fr]">
          <div>
            <div className="mb-3 text-sm font-semibold text-neutral-900">What do you want to understand?</div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {REPORTS.map((item) => {
                const Icon = item.icon; const active = item.type === config.reportType;
                return <button key={item.type} onClick={() => { setConfig((c) => ({ ...c, reportType: item.type })); setReport(null); }} className={`rounded-2xl border p-4 text-left transition ${active ? "border-red-300 bg-red-50 ring-1 ring-red-200" : "border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50"}`}><Icon className={`h-5 w-5 ${active ? "text-red-600" : "text-neutral-500"}`} /><div className="mt-3 text-sm font-semibold text-neutral-950">{item.label}</div><div className="mt-1 text-xs leading-5 text-neutral-500">{item.description}</div></button>;
              })}
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border bg-neutral-50 p-5">
            <div><label className="text-xs font-bold uppercase tracking-wide text-neutral-500">Report name</label><input value={reportName} onChange={(e) => setReportName(e.target.value)} className="mt-2 w-full rounded-xl border bg-white px-3 py-2.5 text-sm" /></div>
            <div><label className="text-xs font-bold uppercase tracking-wide text-neutral-500">Date range</label><select value={config.dateRange} onChange={(e) => setConfig((c) => ({ ...c, dateRange: e.target.value as MarketingReportConfig["dateRange"] }))} className="mt-2 w-full rounded-xl border bg-white px-3 py-2.5 text-sm">{DATE_RANGES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            <div><label className="text-xs font-bold uppercase tracking-wide text-neutral-500">Compare with</label><select value={config.comparison} onChange={(e) => setConfig((c) => ({ ...c, comparison: e.target.value as MarketingReportConfig["comparison"] }))} className="mt-2 w-full rounded-xl border bg-white px-3 py-2.5 text-sm">{COMPARISONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            <div><label className="text-xs font-bold uppercase tracking-wide text-neutral-500">Break it down by</label><select value={config.breakdown} onChange={(e) => setConfig((c) => ({ ...c, breakdown: e.target.value as MarketingReportConfig["breakdown"] }))} className="mt-2 w-full rounded-xl border bg-white px-3 py-2.5 text-sm">{BREAKDOWNS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            <div><label className="text-xs font-bold uppercase tracking-wide text-neutral-500">Email recipients</label><input value={emailRecipients} onChange={(e) => setEmailRecipients(e.target.value)} placeholder="marketing@theouthaven.com" className="mt-2 w-full rounded-xl border bg-white px-3 py-2.5 text-sm" /><p className="mt-1 text-xs text-neutral-500">Separate multiple addresses with commas.</p></div>
          </div>
        </div>
      </section>

      {scheduleOpen ? <section className="rounded-2xl border border-red-200 bg-red-50/60 p-5"><div className="flex items-center gap-2"><CalendarClock className="h-5 w-5 text-red-600" /><h2 className="font-semibold text-neutral-950">Email this report automatically</h2></div><p className="mt-1 text-sm text-neutral-600">The report reruns with fresh data before each email is sent.</p><div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5"><div><label className="text-xs font-semibold text-neutral-600">How often</label><select value={cadence} onChange={(e) => setCadence(e.target.value as typeof cadence)} className="mt-1 w-full rounded-xl border bg-white px-3 py-2"><option value="daily">Every day</option><option value="weekly">Every week</option><option value="monthly">Every month</option></select></div>{cadence === "weekly" ? <div><label className="text-xs font-semibold text-neutral-600">Day</label><select value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))} className="mt-1 w-full rounded-xl border bg-white px-3 py-2">{["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].map((d,i)=><option value={i} key={d}>{d}</option>)}</select></div> : null}{cadence === "monthly" ? <div><label className="text-xs font-semibold text-neutral-600">Day of month</label><select value={dayOfMonth} onChange={(e)=>setDayOfMonth(Number(e.target.value))} className="mt-1 w-full rounded-xl border bg-white px-3 py-2">{Array.from({length:28},(_,i)=>i+1).map((d)=><option key={d} value={d}>{d}</option>)}</select></div> : null}<div><label className="text-xs font-semibold text-neutral-600">Hour</label><select value={sendHour} onChange={(e)=>setSendHour(Number(e.target.value))} className="mt-1 w-full rounded-xl border bg-white px-3 py-2">{Array.from({length:24},(_,i)=>i).map((h)=><option key={h} value={h}>{h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h-12} PM`}</option>)}</select></div><div><label className="text-xs font-semibold text-neutral-600">Minute</label><select value={sendMinute} onChange={(e)=>setSendMinute(Number(e.target.value))} className="mt-1 w-full rounded-xl border bg-white px-3 py-2"><option value={0}>:00</option><option value={15}>:15</option><option value={30}>:30</option><option value={45}>:45</option></select></div><div className="flex items-end"><button onClick={createSchedule} disabled={busy} className="w-full rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white">Create schedule</button></div></div></section> : null}

      {report ? <section className="rounded-3xl border bg-white p-5 shadow-sm sm:p-7"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="text-xs font-bold uppercase tracking-[.16em] text-red-600">Report results</div><h2 className="mt-1 text-2xl font-semibold text-neutral-950">{report.title}</h2><p className="mt-1 text-sm text-neutral-500">{report.periodLabel}{report.comparisonLabel ? ` · compared with ${report.comparisonLabel}` : ""}</p></div><button onClick={exportCsv} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold"><Download className="h-4 w-4" />Export CSV</button></div><div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">{report.metrics.map((m)=><div key={m.label} className="rounded-2xl border bg-neutral-50 p-4"><div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{m.label}</div><div className="mt-2 text-2xl font-semibold text-neutral-950">{typeof m.value === "number" ? m.value.toLocaleString() : m.value}</div>{m.changePct != null ? <div className={`mt-1 text-xs font-semibold ${m.changePct >= 0 ? "text-emerald-600" : "text-amber-600"}`}>{changeText(m.changePct)}</div> : null}</div>)}</div>{report.funnel ? <div className="mt-7"><h3 className="font-semibold text-neutral-950">Search journey</h3><div className="mt-3 space-y-2">{report.funnel.map((step,i)=><div key={step.label} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-xl border px-4 py-3"><div><div className="font-medium">{i+1}. {step.label}</div>{i>0 ? <div className="text-xs text-neutral-500">{step.dropoffPct}% drop-off from prior step</div> : null}</div><div className="text-right"><div className="font-semibold">{step.count.toLocaleString()}</div><div className="text-xs text-neutral-500">people</div></div><div className="w-20 text-right text-sm font-semibold">{i===0 ? "Start" : `${step.conversionPct}%`}</div></div>)}</div></div> : null}{report.rows.length ? <div className="mt-7 overflow-hidden rounded-2xl border"><div className="grid grid-cols-[60px_1fr_120px_120px] bg-neutral-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500"><span>Rank</span><span>Result</span><span className="text-right">Activity</span><span className="text-right">Change</span></div>{report.rows.map((row,i)=><div key={`${row.label}-${i}`} className="grid grid-cols-[60px_1fr_120px_120px] items-center border-t px-4 py-3 text-sm"><span className="text-neutral-500">{i+1}</span><span className="font-medium text-neutral-900">{row.label}</span><span className="text-right font-semibold">{row.value.toLocaleString()}</span><span className={`text-right text-xs font-semibold ${row.changePct != null && row.changePct < 0 ? "text-amber-600" : "text-emerald-600"}`}>{changeText(row.changePct)}</span></div>)}</div> : null}{report.insights.length ? <div className="mt-7 rounded-2xl border border-red-100 bg-red-50/50 p-5"><div className="flex items-center gap-2 font-semibold text-neutral-950"><Sparkles className="h-4 w-4 text-red-600" />Key takeaways</div><div className="mt-3 space-y-2">{report.insights.map((x)=><p key={x} className="text-sm leading-6 text-neutral-700">{x}</p>)}</div></div> : null}</section> : <section className="rounded-3xl border border-dashed bg-white p-12 text-center"><BarChart3 className="mx-auto h-8 w-8 text-neutral-400" /><h2 className="mt-3 font-semibold">Your report will appear here</h2><p className="mt-1 text-sm text-neutral-500">Choose a report above and select Run report.</p></section>}

      <div className="grid gap-5 lg:grid-cols-2"><section className="rounded-2xl border bg-white p-5"><h2 className="font-semibold">Saved reports</h2><p className="mt-1 text-sm text-neutral-500">Reuse reports without rebuilding the filters.</p><div className="mt-4 space-y-2">{savedReports.length ? savedReports.map((saved)=><button key={saved.id} onClick={()=>loadSaved(saved)} className="w-full rounded-xl border p-3 text-left hover:bg-neutral-50"><div className="font-medium">{saved.name}</div><div className="mt-1 text-xs text-neutral-500">{REPORTS.find((r)=>r.type===saved.report_type)?.label || saved.report_type} · {DATE_RANGES.find(([v])=>v===saved.date_range)?.[1]}</div></button>) : <div className="rounded-xl bg-neutral-50 p-4 text-sm text-neutral-500">No saved reports yet.</div>}</div></section><section className="rounded-2xl border bg-white p-5"><h2 className="font-semibold">Scheduled emails</h2><p className="mt-1 text-sm text-neutral-500">Reports that rerun and email automatically.</p><div className="mt-4 space-y-2">{schedules.length ? schedules.map((item)=><div key={item.id} className="rounded-xl border p-3"><div className="flex items-center justify-between gap-3"><div><div className="font-medium">{item.name}</div><div className="mt-1 text-xs text-neutral-500">{item.cadence === "weekly" && item.day_of_week === 1 ? "Every Monday" : item.cadence === "daily" ? "Every day" : item.cadence === "weekly" ? "Every week" : "Every month"} · {item.recipients.join(", ")}</div></div><span className={`rounded-full px-2 py-1 text-xs font-semibold ${item.is_active ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-500"}`}>{item.is_active ? "Active" : "Paused"}</span></div>{item.next_run_at ? <div className="mt-2 text-xs text-neutral-500">Next email: {new Date(item.next_run_at).toLocaleString()}</div> : null}</div>) : <div className="rounded-xl bg-neutral-50 p-4 text-sm text-neutral-500">No scheduled reports yet.</div>}</div></section></div>
    </div>
  );
}