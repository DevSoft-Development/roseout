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

const tabs = ["All", "Active", "Paused", "Failed", "Needs attention", "Reservation"];

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

function Switch({
  label,
  checked,
  disabled,
  onClick,
  tone = "rose",
}: {
  label: string;
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
      </span>
      <span className={`relative h-6 w-11 rounded-full transition ${checked ? (tone === "emerald" ? "bg-emerald-500" : "bg-rose-500") : "bg-white/15"}`}>
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
  const [recipientDraft, setRecipientDraft] = useState("");

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
    setRecipientDraft((job.email_recipients || []).join(", "));
    const response = await fetch(`/api/admin/cron-jobs/${encodeURIComponent(job.job_key)}/runs`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    setRuns(response.ok ? data.runs || [] : []);
  }

  async function patch(job: Job, key: "send_success_email" | "send_failure_email" | "is_active") {
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
      setNotice(key === "is_active" ? `${job.job_name} is now ${next ? "active" : "paused"}.` : "Alert setting saved.");
      await load();
    }
    setSaving(null);
  }

  async function saveRecipients() {
    if (!selected) return;
    setSaving(`${selected.job_key}:recipients`);
    setError("");
    setNotice("");
    const recipients = recipientDraft.split(/[;,\n]/).map((value) => value.trim()).filter(Boolean);
    const response = await fetch(`/api/admin/cron-jobs/${encodeURIComponent(selected.job_key)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email_recipients: recipients }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) setError(data.error || "Could not save alert recipients.");
    else {
      setSelected((current) => current ? { ...current, ...data.job } : current);
      setNotice("Alert recipients saved.");
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
      await open({ ...job, ...(jobs.find((item) => item.job_key === job.job_key) || {}) });
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
      if (tab === "Failed") return job.last_status === "failed" || job.scheduler_status === "failed";
      if (tab === "Needs attention") return !["ok", "paused"].includes(job.needs_attention_reason);
      if (tab === "Reservation") return job.category === "reservation" || String(job.job_key).startsWith("reservation-");
      return true;
    }),
    [jobs, q, tab],
  );

  const cards = [
    ["Total jobs", counts.total],
    ["Active jobs", counts.active_count],
    ["Paused jobs", counts.paused_count],
    ["Healthy", counts.success],
    ["Failed", counts.failed],
    ["Needs attention", counts.needs_attention],
    ["Supabase crons", counts.pg_cron_count],
    ["Vercel crons", counts.vercel_cron_count],
  ];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Settings · Operations"
        title="Cron Jobs"
        subtitle="Unified control plane for Supabase pg_cron, Edge Function jobs, Vercel schedules, execution history, and alert routing."
        actions={<button onClick={() => void load()} className="rounded-xl border border-white/10 bg-white/[0.055] px-4 py-2 text-sm font-black text-white/80">Refresh</button>}
      />

      {error && <p className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</p>}
      {notice && <p className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-sm text-emerald-100">{notice}</p>}

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

          <p className="text-sm text-white/55">Pause is authoritative: pg_cron is disabled at the scheduler, and Vercel calls are blocked by the managed dispatcher before job work begins.</p>

          {loading ? (
            <p className="p-6 text-white/60">Reconciling schedulers and run history…</p>
          ) : (
            <div className="grid gap-3">
              {filtered.map((job) => (
                <article key={job.job_key} className="rounded-[1.25rem] border border-white/10 bg-[#0f0f12]/90 p-4 shadow-xl shadow-black/10">
                  <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr_1fr_1.2fr_1.4fr_auto]">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-black text-white">{job.job_name}</h3>
                        {badge(job.last_status)}
                        <span className={`rounded-full px-2 py-1 text-xs font-black ${job.is_active === false ? "bg-amber-400/10 text-amber-100" : "bg-emerald-400/10 text-emerald-200"}`}>
                          {job.is_active === false ? "Paused" : "Active"}
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
                      <p className="text-xs text-white/45">Scheduler {job.scheduler_status || "—"} · Duration {dur(job.last_duration_ms)}</p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
                      <Switch label="Job" checked={job.is_active !== false} disabled={Boolean(saving)} onClick={() => void patch(job, "is_active")} />
                      <Switch label="Success email" tone="emerald" checked={Boolean(job.send_success_email)} disabled={Boolean(saving)} onClick={() => void patch(job, "send_success_email")} />
                      <Switch label="Failure email" checked={Boolean(job.send_failure_email)} disabled={Boolean(saving)} onClick={() => void patch(job, "send_failure_email")} />
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
                </article>
              ))}
            </div>
          )}
        </div>
      </AdminSectionCard>

      {selected && (
        <section className="rounded-[1.35rem] border border-white/10 bg-[#101012]/90 p-6 shadow-xl shadow-black/20">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black">{selected.job_name}</h2>
              <p className="text-sm text-white/45">{selected.job_key}</p>
            </div>
            <div className="flex gap-2">
              {selected.is_manually_runnable && <button disabled={Boolean(running) || selected.is_active === false} onClick={() => void runNow(selected)} className="rounded-full bg-rose-500 px-4 py-2 text-sm font-black disabled:opacity-50">Run now</button>}
              <button onClick={() => setSelected(null)} className="rounded-full border border-white/10 px-4 py-2 text-sm font-bold text-white/65">Close</button>
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Info label="Application status" value={selected.last_status} />
            <Info label="Scheduler status" value={selected.scheduler_status} />
            <Info label="Health assessment" value={String(selected.needs_attention_reason || "ok").replaceAll("_", " ")} />
            <Info label="Active / Paused" value={selected.is_active === false ? "Paused" : "Active"} />
            <Info label="Schedule" value={selected.schedule_hint} />
            <Info label="Source" value={sourceLabel(selected.source)} />
            <Info label="Route" value={selected.route_path} />
            <Info label="Last app run" value={fmt(selected.latest_run_at)} />
            <Info label="Last scheduler start" value={fmt(selected.scheduler_last_started_at)} />
            <Info label="Last scheduler finish" value={fmt(selected.scheduler_last_completed_at)} />
            <Info label="Last success" value={fmt(selected.last_completed_at)} />
            <Info label="Last failure" value={fmt(selected.last_failed_at)} />
            <Info label="Last duration" value={dur(selected.last_duration_ms)} />
            <Info label="Last message" value={selected.last_message} />
            <Info label="Last error" value={selected.last_error} />
          </div>

          <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
              <label className="flex-1">
                <span className="mb-2 block text-xs font-black uppercase tracking-widest text-white/40">Alert recipients</span>
                <input value={recipientDraft} onChange={(event) => setRecipientDraft(event.target.value)} placeholder="admin@theouthaven.com, ops@theouthaven.com" className="min-h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white placeholder:text-white/30" />
              </label>
              <button disabled={Boolean(saving)} onClick={() => void saveRecipients()} className="min-h-11 rounded-xl border border-white/10 bg-white/[0.08] px-4 text-sm font-black disabled:opacity-50">Save recipients</button>
            </div>
            <p className="mt-2 text-xs text-white/45">Leave blank to use the system admin alert recipient. Separate multiple addresses with commas, semicolons, or new lines.</p>
          </div>

          <h3 className="mt-6 font-black">Recent runs</h3>
          <div className="mt-2 grid gap-2">
            {runs.length ? runs.map((run) => (
              <div key={run.id} className="rounded-2xl border border-white/10 bg-black/20 p-3 text-sm">
                <div className="flex flex-wrap gap-2">
                  {badge(run.status)}
                  <span className="text-white/55">Started {fmt(run.started_at)}</span>
                  <span className="text-white/55">Completed {fmt(run.completed_at || run.finished_at)}</span>
                  <span className="text-white/55">{dur(run.duration_ms)}</span>
                  {run.alert_dispatched_at && <span className="text-emerald-200">Alert sent {fmt(run.alert_dispatched_at)}</span>}
                </div>
                {run.message && <p className="mt-2 text-white/70">{run.message}</p>}
                {run.error_message && <p className="mt-2 text-rose-200">{run.error_message}</p>}
              </div>
            )) : (
              <p className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/55">No application run history logged for this job yet.</p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
