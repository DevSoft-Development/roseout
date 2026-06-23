"use client";
import { useEffect, useState } from "react";
import { AdminKpiCard, AdminKpiGrid, AdminPageHeader, AdminSectionCard, AdminTableScroll } from "@/components/admin/AdminDesignSystem";

type Job = any;
type Run = any;
function fmt(v?: string | null) {
  return v ? new Date(v).toLocaleString() : "—";
}
function dur(ms?: number | null) {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}
function sourceLabel(source?: string | null) {
  const s = String(source || "unknown");
  if (s === "edge_function") return "Supabase Edge Function";
  if (s === "vercel_cron") return "Vercel cron";
  if (s === "nextjs_route" || s === "nextjs") return "Next.js route";
  if (s === "cron") return "Scheduled cron";
  return s.replace(/_/g, " ");
}
function badge(s: string) {
  const c =
    s === "success"
      ? "bg-emerald-400/10 text-emerald-200 border-emerald-400/20"
      : s === "failed"
        ? "bg-rose-400/10 text-rose-200 border-rose-400/20"
        : s === "running"
          ? "bg-sky-400/10 text-sky-200 border-sky-400/20"
          : "bg-white/5 text-white/55 border-white/10";
  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-black uppercase ${c}`}
    >
      {s || "unknown"}
    </span>
  );
}
function helper(job: Job) {
  if (job.last_status === "never_run" && !job.has_run_history)
    return "Registered, no run logged yet";
  if (job.last_status === "never_run" && job.run_count > 0)
    return "History exists; summary needs refresh";
  if (!job.schedule_detected) return "No schedule found";
  if (job.needs_attention_reason !== "ok")
    return job.needs_attention_reason?.replaceAll("_", " ");
  return "Schedule and run history detected";
}

export default function CronJobsClient() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [counts, setCounts] = useState<any>({});
  const [selected, setSelected] = useState<Job | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/cron-jobs", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) setError(data.error || "Unable to load cron jobs.");
    else {
      setJobs(data.jobs || []);
      setCounts(data.counts || {});
    }
    setLoading(false);
  }
  async function open(job: Job) {
    setSelected(job);
    const res = await fetch(
      `/api/admin/cron-jobs/${encodeURIComponent(job.job_key)}/runs`,
      { cache: "no-store" },
    );
    const data = await res.json();
    setRuns(res.ok ? data.runs || [] : []);
  }
  async function toggle(
    job: Job,
    key: "send_success_email" | "send_failure_email",
  ) {
    setSaving(`${job.job_key}:${key}`);
    setError("");
    const next = !job[key];
    const res = await fetch(
      `/api/admin/cron-jobs/${encodeURIComponent(job.job_key)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ [key]: next }),
      },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error || "Could not update cron job.");
    else {
      const merged = { ...job, ...data.job };
      setJobs((prev) =>
        prev.map((j) => (j.job_key === job.job_key ? { ...j, ...merged } : j)),
      );
      if (selected?.job_key === job.job_key)
        setSelected({ ...selected, ...merged });
    }
    setSaving(null);
  }
  useEffect(() => {
    load();
  }, []);
  const cards = [
    ["Total jobs", counts.total],
    ["Healthy jobs", counts.success],
    ["Failed jobs", counts.failed],
    ["Never run", counts.never_run],
    ["Needs attention", counts.needs_attention],
    ["Email alerts enabled", counts.email_alerts_enabled],
  ];
  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Settings · Operations"
        title="Cron Jobs"
        subtitle="Monitor scheduled jobs, run history, diagnostics, and notification settings."
        actions={
          <button
            onClick={load}
            className="inline-flex min-h-10 min-w-[88px] shrink-0 items-center justify-center whitespace-nowrap rounded-xl border border-white/10 bg-white/[0.055] px-4 py-2 text-sm font-black text-white/80"
          >
            Refresh
          </button>
        }
      />
      {error && (
        <p className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 p-3 text-sm text-rose-100">
          {error}
        </p>
      )}
      <AdminKpiGrid>
        {cards.map(([l, v]) => (
          <AdminKpiCard key={l} label={String(l)} value={v ?? 0} />
        ))}
      </AdminKpiGrid>
      <AdminSectionCard>
        {loading ? (
          <p className="p-6 text-white/60">Loading cron jobs…</p>
        ) : jobs.length === 0 ? (
          <p className="p-6 text-white/60">
            No cron jobs are registered yet. Cron jobs should be registered in
            public.cron_jobs even before their first run.
          </p>
        ) : (
          <AdminTableScroll>
            <table className="w-full min-w-[1180px] table-fixed text-left text-sm">
              <thead className="bg-white/[0.03] text-xs uppercase tracking-widest text-white/45">
                <tr>
                  {[
                    ["Job", "w-[230px]"],
                    ["Source", "w-[170px]"],
                    ["Schedule", "w-[170px]"],
                    ["Status", "w-[190px]"],
                    ["Run History", "w-[150px]"],
                    ["Last Success/Failure", "w-[220px]"],
                    ["Duration", "w-[100px]"],
                    ["Alerts", "w-[150px]"],
                    ["Details", "w-[120px]"],
                  ].map(([h, w]) => (
                    <th key={h} className={`${w} whitespace-nowrap px-4 py-3`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr
                    key={job.job_key}
                    className="border-t border-white/10 align-top"
                  >
                    <td className="px-4 py-4">
                      <p className="font-black">{job.job_name}</p>
                      <p className="text-xs text-white/45">{job.job_key}</p>
                      {job.route_path && (
                        <p className="text-xs text-rose-100/70">
                          {job.route_path}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-4 text-white/70">
                      <p className="font-bold">{sourceLabel(job.source)}</p>
                      <p className="text-xs text-white/45">
                        {job.source || "unknown"}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-black ${job.schedule_detected ? "bg-emerald-400/10 text-emerald-200" : "bg-amber-400/10 text-amber-100"}`}
                      >
                        {job.schedule_detected ? "Found" : "Not found"}
                      </span>
                      <p className="mt-2 text-xs text-white/50">
                        {job.schedule_hint || "No schedule hint"}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      {badge(job.last_status)}
                      <p className="mt-2 max-w-44 text-xs text-white/50">
                        {helper(job)}
                      </p>
                    </td>
                    <td className="px-4 py-4 text-white/65">
                      <p>
                        {job.has_run_history ? "Has history" : "No history"}
                      </p>
                      <p className="text-xs text-white/45">
                        {job.run_count || 0} runs
                      </p>
                      <p className="text-xs text-white/45">
                        Latest: {job.latest_run_status || "—"}
                      </p>
                    </td>
                    <td className="px-4 py-4 text-white/65">
                      <p>Success: {fmt(job.last_completed_at)}</p>
                      <p>Failure: {fmt(job.last_failed_at)}</p>
                    </td>
                    <td className="px-4 py-4 text-white/65">
                      {dur(job.last_duration_ms)}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-col items-start gap-2">
                        <button disabled={Boolean(saving)} onClick={() => toggle(job, "send_success_email")} className={`inline-flex min-w-[112px] items-center justify-center whitespace-nowrap rounded-full px-3 py-1 text-xs font-black ${job.send_success_email ? "bg-emerald-500 text-white" : "bg-white/10 text-white/55"}`}>Success: {saving === `${job.job_key}:send_success_email` ? "Saving…" : job.send_success_email ? "On" : "Off"}</button>
                        <button disabled={Boolean(saving)} onClick={() => toggle(job, "send_failure_email")} className={`inline-flex min-w-[112px] items-center justify-center whitespace-nowrap rounded-full px-3 py-1 text-xs font-black ${job.send_failure_email ? "bg-rose-600 text-white" : "bg-white/10 text-white/55"}`}>Failure: {saving === `${job.job_key}:send_failure_email` ? "Saving…" : job.send_failure_email ? "On" : "Off"}</button>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <button
                        onClick={() => open(job)}
                        className="inline-flex min-w-[88px] items-center justify-center whitespace-nowrap rounded-full border border-white/10 bg-white/[0.08] px-3 py-1.5 text-xs font-black"
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminTableScroll>
        )}
      </AdminSectionCard>
      {selected && (
        <section className="rounded-[1.35rem] border border-white/10 bg-[#101012]/90 p-6 shadow-xl shadow-black/20">
          <div className="flex justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black">{selected.job_name}</h2>
              <p className="text-sm text-white/45">{selected.job_key}</p>
            </div>
            <button
              onClick={() => setSelected(null)}
              className="text-sm font-bold text-white/55"
            >
              Close
            </button>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Info label="Description" value={selected.description} />
            <Info label="Route path" value={selected.route_path} />
            <Info label="Source" value={sourceLabel(selected.source)} />
            <Info label="Schedule hint" value={selected.schedule_hint} />
            <Info
              label="Schedule detected"
              value={selected.schedule_detected ? "Yes" : "No"}
            />
            <Info
              label="Run history"
              value={`${selected.has_run_history ? "Yes" : "No"}; ${selected.run_count || 0} runs`}
            />
            <Info
              label="Latest run"
              value={[selected.latest_run_status, fmt(selected.latest_run_at)]
                .filter(Boolean)
                .join(" — ")}
            />
            <Info
              label="Needs attention"
              value={selected.needs_attention_reason}
            />
            <Info label="Schedule notes" value={selected.schedule_notes} />
            <Info label="Last message" value={selected.last_message} />
            <Info label="Last error" value={selected.last_error} />
            <Info
              label="Email recipients"
              value={
                (selected.email_recipients || []).join(", ") ||
                "Default admin alert email"
              }
            />
          </div>
          <h3 className="mt-6 font-black">Last details</h3>
          <pre className="mt-2 max-h-64 overflow-auto rounded-2xl bg-black/30 p-4 text-xs text-white/65">
            {JSON.stringify(selected.last_details || {}, null, 2)}
          </pre>
          <h3 className="mt-6 font-black">Recent run history</h3>
          <div className="mt-2 grid gap-2">
            {runs.length ? (
              runs.map((r) => (
                <div
                  key={r.id}
                  className="rounded-2xl border border-white/10 bg-black/20 p-3 text-sm"
                >
                  <div className="flex flex-wrap gap-2">
                    {badge(r.status)}
                    <span className="text-white/55">
                      Started {fmt(r.started_at)}
                    </span>
                    <span className="text-white/55">
                      Completed {fmt(r.completed_at || r.finished_at)}
                    </span>
                    <span className="text-white/55">{dur(r.duration_ms)}</span>
                  </div>
                  {r.message && (
                    <p className="mt-2 text-white/70">{r.message}</p>
                  )}
                  {r.error_message && (
                    <p className="mt-2 text-rose-200">{r.error_message}</p>
                  )}
                </div>
              ))
            ) : (
              <p className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/55">
                No run history logged for this job yet.
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <p className="text-xs font-black uppercase tracking-widest text-white/40">
        {label}
      </p>
      <p className="mt-2 whitespace-pre-wrap text-sm text-white/75">
        {value || "—"}
      </p>
    </div>
  );
}
