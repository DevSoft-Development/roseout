"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AdminKpiCard,
  AdminKpiGrid,
  AdminPageHeader,
  AdminSectionCard,
} from "@/components/admin/AdminDesignSystem";

type Job = Record<string, any>;
type Run = Record<string, any>;

const tabs = ["All", "Active", "Paused", "Daily email", "Excluded from email", "Failed", "Needs attention", "Reservation"];

function fmt(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

function dur(ms?: number | null) {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function sourceLabel(source?: string | null) {
  const value = String(source || "unknown");
  if (value === "edge_function") return "Supabase Edge Function";
  if (value === "pg_cron") return "Supabase pg_cron";
  if (value === "vercel_cron") return "Vercel Cron";
  if (value === "nextjs_route" || value === "nextjs") return "Next.js route";
  return value.replaceAll("_", " ");
}

function badge(status?: string | null) {
  const value = String(status || "unknown");
  const classes =
    value === "success" || value === "succeeded"
      ? "bg-emerald-400/10 text-emerald-200 border-emerald-400/20"
      : value === "failed" || value === "error"
        ? "bg-rose-400/10 text-rose-200 border-rose-400/20"
        : value === "running"
          ? "bg-sky-400/10 text-sky-200 border-sky-400/20"
          : value === "skipped"
            ? "bg-amber-400/10 text-amber-100 border-amber-400/20"
            : "bg-white/5 text-white/55 border-white/10";
  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase ${classes}`}>
      {value}
    </span>
  );
}

function helper(job: Job) {
  if (job.is_active === false) return "Paused at the control plane";
  if (job.needs_attention_reason !== "ok") return String(job.needs_attention_reason || "needs_attention").replaceAll("_", " ");
  return "Scheduler and execution history agree";
}

function OutcomeSummary({ outcome, compact = false }: { outcome?: Record<string, any> | null; compact?: boolean }) {
  const summary = outcome?.summary || "No outcome counters reported yet.";
  const changeTotal = Number(outcome?.materialChangeTotal || 0);
  const review = Number(outcome?.review || 0);
  const failed = Number(outcome?.failed || 0);
  return (
    <div className={`rounded-2xl border border-white/10 bg-black/25 ${compact ? "px-3 py-2" : "p-4"}`}>
      {!compact && <p className="text-[11px] font-black uppercase tracking-[0.16em] text-white/40">Last result</p>}
      <p className={`${compact ? "text-xs" : "mt-1 text-sm"} font-bold leading-5 text-white/75`}>{summary}</p>
      {!compact && (changeTotal > 0 || review > 0 || failed > 0) && (
        <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-black">
          {changeTotal > 0 && <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-emerald-200">{changeTotal} material change{changeTotal === 1 ? "" : "s"}</span>}
          {review > 0 && <span className="rounded-full bg-amber-400/10 px-2 py-1 text-amber-100">{review} review</span>}
          {failed > 0 && <span className="rounded-full bg-rose-400/10 px-2 py-1 text-rose-100">{failed} failed</span>}
        </div>
      )}
    </div>
  );
}

function Switch({ label, helperText, checked, disabled, onClick, tone = "rose" }: {
  label: string;
  helperText?: string;
  checked: boolean;
  disabled?: boolean;
  onClick: () => void;
  tone?: "rose" | "emerald";
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="group flex w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-left disabled:opacity-60"
    >
      <span>
        <span className="block text-xs font-black uppercase tracking-widest text-white/45">{label}</span>
        <span className="text-sm font-bold text-white/80">{checked ? "On" : "Off"}</span>
        {helperText && <span className="mt-0.5 block text-[11px] leading-4 text-white/40">{helperText}</span>}
      </span>
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? (tone === "emerald" ? "bg-emerald-500" : "bg-rose-500") : "bg-white/15"}`}>
        <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${checked ? "left-6" : "left-1"}`} />
      </span>
    </button>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <p className="text-xs font-black uppercase tracking-widest text-white/40">{label}</p>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm text-white/75">{value || "—"}</p>
    </div>
  );
}

export default function CronJobsClient() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [counts, setCounts] = useState<Record<string, any>>({});
  const [selected, setSelected] = useState<Job | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [tab, setTab] = useState("All");
  const [q, setQ] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    const response = await fetch("/api/admin/cron-jobs", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) setError(data.error || "Unable to load cron jobs.");
    else {
      setJobs(data.jobs || []);
      setCounts(data.counts || {});
      if (selected) {
        const refreshed = (data.jobs || []).find((job: Job) => job.job_key === selected.job_key);
        if (refreshed) setSelected(refreshed);
      }
    }
    setLoading(false);
  }

  async function open(job: Job) {
    setSelected(job);
    const response = await fetch(`/api/admin/cron-jobs/${encodeURIComponent(job.job_key)}/runs`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    setRuns(response.ok ? data.runs || [] : []);
  }

  async function patch(job: Job, key: "is_active" | "include_in_daily_digest") {
    const next = !job[key];
    setSaving(`${job.job_key}:${key}`);
    setError("");
    setNotice("");
    const response = await fetch(`/api/admin/cron-jobs/${encodeURIComponent(job.job_key)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ [key]: next }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) setError(data.error || "Could not update cron job.");
    else {
      setNotice(
        key === "is_active"
          ? `${job.job_name} is now ${next ? "active" : "paused"}.`
          : `${job.job_name} will ${next ? "appear" : "not appear"} in the daily System Health email.`,
      );
      await load();
    }
    setSaving(null);
  }

  async function runNow(job: Job) {
    setRunning(job.job_key);
    setError("");
    setNotice("");
    const response = await fetch(`/api/admin/cron-jobs/${encodeURIComponent(job.job_key)}/run`, { method: "POST" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) setError(data.error || data.result?.error || "Manual run failed.");
    else {
      setNotice(`${job.job_name} manual run completed.`);
      await load();
      await open(job);
    }
    setRunning(null);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(
    () => jobs.filter((job) => {
      const text = `${job.job_name} ${job.job_key} ${job.source} ${job.route_path}`.toLowerCase();
      if (q && !text.includes(q.toLowerCase())) return false;
      if (tab === "Active") return job.is_active !== false;
      if (tab === "Paused") return job.is_active === false;
      if (tab === "Daily email") return job.include_in_daily_digest !== false;
      if (tab === "Excluded from email") return job.include_in_daily_digest === false;
      if (tab === "Failed") return job.last_status === "failed" || job.scheduler_status === "failed";
      if (tab === "Needs attention") return !["ok", "paused"].includes(job.needs_attention_reason);
      if (tab === "Reservation") return job.category === "reservation" || String(job.job_key).startsWith("reservation-");
      return true;
    }),
    [jobs, q, tab],
  );

  const digestIncluded = jobs.filter((job) => job.include_in_daily_digest !== false).length;
  const cards = [
    ["Total jobs", counts.total],
    ["Active jobs", counts.active_count],
    ["In daily email", digestIncluded],
    ["Paused jobs", counts.paused_count],
    ["Healthy", counts.success],
    ["Failed", counts.failed],
    ["Supabase crons", counts.pg_cron_count],
    ["Vercel crons", counts.vercel_cron_count],
  ];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Settings · Operations"
        title="Cron Jobs"
        subtitle="Control scheduled jobs, see exactly what each one changed, and choose which jobs appear in the single daily TheOutHaven System Health email."
        actions={<button onClick={() => void load()} className="rounded-xl border border-white/10 bg-white/[0.055] px-4 py-2 text-sm font-black text-white/80">Refresh</button>}
      />

      {error && <p className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</p>}
      {notice && <p className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-sm text-emerald-100">{notice}</p>}

      <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/[0.07] p-4">
        <p className="font-black text-emerald-100">One daily cron / Edge Function email</p>
        <p className="mt-1 text-sm leading-6 text-white/60">Each job now reports a plain-English outcome such as <b className="text-white/80">18 processed · 12 updated · 4 unchanged · 2 need review</b>. Individual cron success/failure emails remain disabled.</p>
      </div>

      <AdminKpiGrid>
        {cards.map(([label, value]) => <AdminKpiCard key={String(label)} label={String(label)} value={value ?? 0} />)}
      </AdminKpiGrid>

      <AdminSectionCard>
        <div className="space-y-4 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {tabs.map((item) => (
                <button key={item} onClick={() => setTab(item)} className={`rounded-full px-4 py-2 text-sm font-black ${tab === item ? "bg-rose-500 text-white" : "border border-white/10 bg-black/20 text-white/65"}`}>
                  {item}
                </button>
              ))}
            </div>
            <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search job name, key, source…" className="min-h-11 rounded-2xl border border-white/10 bg-black/25 px-4 text-sm text-white placeholder:text-white/35 lg:w-80" />
          </div>

          <p className="text-sm text-white/55">The <b className="text-white/75">Job</b> switch controls execution. The <b className="text-white/75">Include in daily email</b> switch only controls reporting.</p>

          {loading ? (
            <p className="p-6 text-white/60">Reconciling schedulers and run history…</p>
          ) : (
            <div className="grid gap-3">
              {filtered.map((job) => (
                <article key={job.job_key} className="rounded-[1.25rem] border border-white/10 bg-[#0f0f12]/90 p-4 shadow-xl shadow-black/10">
                  <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr_1fr_1.1fr_1.25fr_auto]">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-black text-white">{job.job_name}</h3>
                        {badge(job.last_status)}
                        <span className={`rounded-full px-2 py-1 text-xs font-black ${job.include_in_daily_digest === false ? "bg-white/5 text-white/45" : "bg-sky-400/10 text-sky-200"}`}>
                          {job.include_in_daily_digest === false ? "Not emailed" : "Daily email"}
                        </span>
                      </div>
                      <p className="text-xs text-white/45">{job.job_key}</p>
                      <p className="mt-1 break-words text-xs text-rose-100/70">{job.route_path || "Database-only scheduled job"}</p>
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest text-white/40">Schedule</p>
                      <p className="mt-1 text-sm font-bold text-white/75">{job.schedule_detected ? "Detected" : "Missing"}</p>
                      <p className="text-xs text-white/45">{job.schedule_hint || "No scheduler declaration found"}</p>
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest text-white/40">Source</p>
                      <p className="mt-1 text-sm font-bold text-white/75">{sourceLabel(job.source)}</p>
                      <p className="text-xs text-white/45">{job.run_count || 0} app runs · {helper(job)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest text-white/40">Last execution</p>
                      <p className="mt-1 text-sm text-white/70">{fmt(job.latest_run_at || job.scheduler_last_completed_at || job.last_completed_at || job.last_failed_at)}</p>
                      <p className="text-xs text-white/45">Scheduler {job.scheduler_status || "—"} · {dur(job.last_duration_ms)}</p>
                    </div>
                    <div className="grid gap-2">
                      <Switch label="Job" helperText="Controls whether it runs" checked={job.is_active !== false} disabled={Boolean(saving)} onClick={() => void patch(job, "is_active")} />
                      <Switch label="Include in daily email" helperText="Reporting only" tone="emerald" checked={job.include_in_daily_digest !== false} disabled={Boolean(saving)} onClick={() => void patch(job, "include_in_daily_digest")} />
                    </div>
                    <div className="flex flex-col gap-2">
                      <button onClick={() => void open(job)} className="h-11 rounded-full border border-white/10 bg-white/[0.08] px-4 text-xs font-black">Details</button>
                      {job.is_manually_runnable && (
                        <button disabled={Boolean(running) || job.is_active === false} onClick={() => void runNow(job)} className="h-11 rounded-full bg-rose-500 px-4 text-xs font-black text-white disabled:opacity-50">
                          {running === job.job_key ? "Running…" : "Run now"}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="mt-4">
                    <OutcomeSummary outcome={job.latest_outcome} />
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </AdminSectionCard>

      {selected && (
        <AdminSectionCard>
          <div className="space-y-5 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-rose-300">Cron details</p>
                <h2 className="mt-1 text-2xl font-black text-white">{selected.job_name}</h2>
                <p className="text-sm text-white/45">{selected.job_key}</p>
              </div>
              <button onClick={() => setSelected(null)} className="rounded-full border border-white/10 px-4 py-2 text-xs font-black text-white/65">Close</button>
            </div>

            <OutcomeSummary outcome={selected.latest_outcome} />

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Info label="App status" value={selected.last_status} />
              <Info label="Scheduler status" value={selected.scheduler_status} />
              <Info label="Health assessment" value={helper(selected)} />
              <Info label="Daily email" value={selected.include_in_daily_digest === false ? "Excluded" : "Included"} />
              <Info label="Schedule" value={selected.schedule_hint} />
              <Info label="Source" value={sourceLabel(selected.source)} />
              <Info label="Route" value={selected.route_path} />
              <Info label="Last app run" value={fmt(selected.latest_run_at || selected.last_completed_at)} />
              <Info label="Last scheduler run" value={fmt(selected.scheduler_last_completed_at)} />
              <Info label="Last failure" value={fmt(selected.last_failed_at)} />
              <Info label="Duration" value={dur(selected.last_duration_ms)} />
              <Info label="Message" value={selected.last_error || selected.last_message || selected.scheduler_return_message} />
            </div>

            <div>
              <h3 className="text-sm font-black uppercase tracking-widest text-white/45">Recent runs</h3>
              <div className="mt-3 grid gap-2">
                {runs.length ? runs.slice(0, 15).map((run) => (
                  <div key={run.id || `${run.created_at}-${run.status}`} className="grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-3 md:grid-cols-[auto_1fr_auto] md:items-center">
                    <div>{badge(run.status)}</div>
                    <div className="space-y-2">
                      <p className="text-sm font-bold text-white/75">{run.message || run.error_message || "Run completed"}</p>
                      <OutcomeSummary outcome={run.outcome} compact />
                      <p className="text-xs text-white/40">{fmt(run.finished_at || run.completed_at || run.created_at)}</p>
                    </div>
                    <p className="text-xs text-white/45">{dur(run.duration_ms)}</p>
                  </div>
                )) : <p className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/50">No app-level run history recorded yet.</p>}
              </div>
            </div>
          </div>
        </AdminSectionCard>
      )}
    </div>
  );
}
