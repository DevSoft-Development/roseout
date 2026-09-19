import {
  Activity,
  AlertTriangle,
  Boxes,
  Clock3,
  RefreshCw,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { WORKER_CATALOG } from "@/lib/workers/catalog";
import {
  formatElapsedTime,
  formatJobDuration,
  getFailureMetrics,
  getHealth,
  getLeaseMetrics,
  getQueueMetrics,
  getSuccessRate,
} from "@/lib/workers/operationsMetrics";
import {
  AdminActionButton,
  AdminEmptyState,
  AdminKpiCard,
  AdminKpiGrid,
  AdminPageHeader,
  AdminPageShell,
  AdminSearchInput,
  AdminSectionCard,
  AdminStatusBadge,
} from "../../../../../components/admin/AdminDesignSystem";
import { JobActionButtons, RunWorkerButton } from "./WorkerActions";

export const dynamic = "force-dynamic";

type JobRow = {
  id: string;
  job_type: string;
  status: string;
  attempt_count: number;
  max_attempts: number;
  progress_current: number;
  progress_total: number | null;
  last_error: string | null;
  payload?: unknown;
  created_at: string;
  started_at?: string | null;
  updated_at: string;
  completed_at?: string | null;
  run_after?: string | null;
  created_by_label: string | null;
  lease_owner?: string | null;
  lease_expires_at?: string | null;
  heartbeat_at?: string | null;
  cancellation_requested_at?: string | null;
  priority?: number | null;
};

type EventRow = {
  id: string;
  job_id: string;
  event_type: string;
  message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  created_by: string | null;
};

const STATUSES = ["queued", "running", "succeeded", "failed", "dead_letter", "cancelled"];
const SENSITIVE = /token|secret|password|authorization|api_key|service_role_key/i;

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
        key,
        SENSITIVE.test(key) ? "[redacted]" : redact(nested),
      ]),
    );
  }
  return value;
}

function fmt(date?: string | null) {
  return date ? new Date(date).toLocaleString() : "—";
}

function statusTone(status: string): "green" | "amber" | "red" | "blue" | "muted" {
  if (status === "succeeded") return "green";
  if (status === "failed" || status === "dead_letter") return "red";
  if (status === "running") return "blue";
  if (status === "queued") return "amber";
  return "muted";
}

function unsupportedWorkerEvent(events: EventRow[]) {
  return events.find((event) => event.metadata?.code === "UNSUPPORTED_WORKER_JOB_TYPE");
}

function RuntimeConfigurationError({ job, event }: { job: JobRow; event: EventRow }) {
  const metadata = event.metadata || {};
  return (
    <div className="mt-3 rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4 text-xs text-amber-50">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
        <div>
          <strong className="block text-sm">Runtime configuration error</strong>
          <p className="mt-1 text-amber-100/75">
            This worker is available in the Admin catalog but is not registered with the production dispatcher.
          </p>
        </div>
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer font-black text-amber-100">Technical details</summary>
        <dl className="mt-3 grid gap-2 text-amber-50/75 sm:grid-cols-2">
          <div><dt className="font-semibold">Worker key</dt><dd><code>{job.job_type}</code></dd></div>
          <div><dt className="font-semibold">Dispatcher</dt><dd><code>{String(metadata.dispatcher || metadata.worker || "production-cron-dispatcher")}</code></dd></div>
          <div><dt className="font-semibold">Error code</dt><dd><code>{String(metadata.code || "UNSUPPORTED_WORKER_JOB_TYPE")}</code></dd></div>
          <div><dt className="font-semibold">Job ID</dt><dd><code>{job.id}</code></dd></div>
          {metadata.deployment_sha ? <div><dt className="font-semibold">Deployment SHA</dt><dd><code>{String(metadata.deployment_sha)}</code></dd></div> : null}
          <div className="sm:col-span-2">
            <dt className="font-semibold">Raw error</dt>
            <dd><pre className="mt-1 whitespace-pre-wrap rounded-xl bg-black/35 p-3 text-amber-50/70">{event.message || job.last_error || "Unsupported worker job type"}</pre></dd>
          </div>
        </dl>
      </details>
    </div>
  );
}

export default async function WorkerOperationsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  await requireAdminRole(["superadmin", "admin", "experience_team"]);
  const filters = (await searchParams) || {};
  const now = Date.now();
  const dayAgoIso = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const jobSelect =
    "id,job_type,status,attempt_count,max_attempts,progress_current,progress_total,last_error,payload,run_after,created_at,started_at,updated_at,completed_at,created_by_label,lease_owner,lease_expires_at,heartbeat_at,cancellation_requested_at,priority";

  const [
    { data: jobs, error: jobsError },
    { data: metricJobs, error: metricJobsError },
    { data: recentOutcomeJobs, error: recentOutcomeError },
    { data: catalogJobs },
    { data: events },
  ] = await Promise.all([
    getAdminDatabaseClient().from("worker_jobs").select(jobSelect).order("created_at", { ascending: false }).limit(75),
    getAdminDatabaseClient().from("worker_jobs").select(jobSelect).in("status", ["queued", "running", "failed", "dead_letter"]).limit(1000),
    getAdminDatabaseClient().from("worker_jobs").select(jobSelect).in("status", ["succeeded", "failed", "dead_letter"]).gte("updated_at", dayAgoIso).limit(1000),
    getAdminDatabaseClient().from("worker_jobs").select(jobSelect).order("updated_at", { ascending: false }).limit(500),
    getAdminDatabaseClient().from("worker_job_events").select("id,job_id,event_type,message,metadata,created_at,created_by").order("created_at", { ascending: false }).limit(200),
  ]);

  const visibleJobs = (jobs || []) as JobRow[];
  const operationalJobs = [
    ...((metricJobs || []) as JobRow[]),
    ...((recentOutcomeJobs || []) as JobRow[]),
  ].filter((job, index, rows) => rows.findIndex((candidate) => candidate.id === job.id) === index);
  const allEvents = (events || []) as EventRow[];

  const queue = getQueueMetrics(operationalJobs, now);
  const leases = getLeaseMetrics(operationalJobs, now);
  const failures = getFailureMetrics(operationalJobs, now);
  const success = getSuccessRate((recentOutcomeJobs as JobRow[]) || [], now);
  const health = getHealth({ queue, leases, failures, success });
  const lastSuccess = [...((catalogJobs || []) as JobRow[])].find((job) => job.status === "succeeded");

  const catalogByWorker = new Map<string, { latest?: JobRow; lastSuccess?: JobRow; active?: JobRow }>();
  for (const job of (catalogJobs || []) as JobRow[]) {
    const current = catalogByWorker.get(job.job_type) || {};
    if (!current.latest) current.latest = job;
    if (!current.active && (job.status === "running" || job.status === "queued")) current.active = job;
    if (!current.lastSuccess && job.status === "succeeded") current.lastSuccess = job;
    catalogByWorker.set(job.job_type, current);
  }

  const jobTypes = [...new Set(visibleJobs.map((job) => job.job_type))].sort();
  const filtered = visibleJobs.filter(
    (job) =>
      (!filters.status || job.status === filters.status) &&
      (!filters.worker || job.job_type === filters.worker) &&
      (!filters.q ||
        `${job.job_type} ${job.id} ${job.last_error || ""}`
          .toLowerCase()
          .includes(filters.q.toLowerCase())),
  );

  const loadError = jobsError?.message || metricJobsError?.message || recentOutcomeError?.message || null;
  const runningDetail =
    leases.runningCount === 0
      ? "No running jobs"
      : leases.expiredLeaseCount
        ? `${leases.activeLeaseCount} active · ${leases.expiredLeaseCount} expired lease${leases.expiredLeaseCount === 1 ? "" : "s"}`
        : `${leases.activeLeaseCount} active lease${leases.activeLeaseCount === 1 ? "" : "s"}`;

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Operations"
        title="Worker Operations"
        subtitle="Monitor durable background jobs, queue health, leases, retries, manual runs, and execution diagnostics across TheOutHaven."
        badge={
          <AdminStatusBadge tone={health === "Healthy" ? "green" : health === "Degraded" ? "amber" : "red"}>
            {health}
          </AdminStatusBadge>
        }
        actions={
          <>
            <span className="inline-flex min-h-10 items-center rounded-xl border border-white/10 bg-white/[0.035] px-3 text-xs font-bold text-white/45">
              Last refreshed {new Date(now).toLocaleTimeString()}
            </span>
            <AdminActionButton href="/admin/dashboard/operations/workers" variant="primary">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </AdminActionButton>
          </>
        }
      />

      {loadError ? (
        <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4 text-sm font-bold text-amber-100">
          Some worker metrics could not be loaded: {loadError}
        </div>
      ) : null}

      <AdminKpiGrid>
        <AdminKpiCard
          label="Queued"
          value={queue.queuedCount}
          helper={`${queue.runnableCount} ready · ${queue.scheduledCount} scheduled`}
          icon={Clock3}
        />
        <AdminKpiCard label="Running" value={leases.runningCount} helper={runningDetail} icon={Activity} />
        <AdminKpiCard
          label="Open failures"
          value={failures.openFailureCount}
          helper={`${failures.historicalFailureCount} historical failure${failures.historicalFailureCount === 1 ? "" : "s"}`}
          icon={AlertTriangle}
        />
        <AdminKpiCard
          label="24h success rate"
          value={success.rate == null ? "—" : `${success.rate}%`}
          helper={success.rate == null ? "No completed jobs in 24h" : `${success.succeeded} of ${success.completed} completed`}
          icon={ShieldCheck}
        />
      </AdminKpiGrid>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_2.1fr]">
        <AdminSectionCard>
          <div className="border-b border-white/10 px-5 py-4">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-rose-200">Runtime health</p>
            <h2 className="mt-2 text-xl font-black text-white">Queue and lease health</h2>
            <p className="mt-1 text-sm text-white/50">Operational state for runnable work, failures, leases, and heartbeats.</p>
          </div>
          <dl className="divide-y divide-white/10 px-5">
            {[
              ["Runnable queued", queue.runnableCount],
              ["Scheduled queued", queue.scheduledCount],
              ["Currently running", leases.runningCount],
              ["Active leases", leases.activeLeaseCount],
              ["Expired leases", leases.expiredLeaseCount],
              ["Stale heartbeats", leases.staleHeartbeatCount],
              ["Open failures", failures.openFailureCount],
              ["Failures · last 24h", failures.failuresLast24hCount],
              ["Dead-letter jobs", failures.deadLetterCount],
              ["Most recent success", fmt(lastSuccess?.completed_at || lastSuccess?.updated_at)],
              ["Oldest runnable job", queue.oldestRunnableAgeMs == null ? "—" : formatElapsedTime(queue.oldestRunnableAgeMs)],
              ["Next scheduled job", fmt(queue.nextScheduled?.run_after)],
              ["Oldest heartbeat", fmt(leases.oldestHeartbeat?.heartbeat_at)],
              ["Lease owners", leases.leaseOwners.length ? leases.leaseOwners.join(", ") : "—"],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex items-start justify-between gap-4 py-3 text-sm">
                <dt className="text-white/45">{label}</dt>
                <dd className="max-w-[55%] text-right font-bold text-white/80">{String(value)}</dd>
              </div>
            ))}
          </dl>
        </AdminSectionCard>

        <AdminSectionCard>
          <div className="border-b border-white/10 px-5 py-4">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-rose-200">Execution catalog</p>
            <h2 className="mt-2 text-xl font-black text-white">Worker catalog</h2>
            <p className="mt-1 text-sm text-white/50">Known durable workers, cadence, latest state, and manual-run controls.</p>
          </div>
          <div className="grid gap-3 p-4 md:grid-cols-2 sm:p-5">
            {WORKER_CATALOG.map((worker) => {
              const history = catalogByWorker.get(worker.key);
              const planned = worker.status === "planned";
              return (
                <article key={worker.key} className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-black text-white">{worker.label}</h3>
                      <p className="mt-1 text-xs leading-5 text-white/50">{worker.description}</p>
                    </div>
                    <RunWorkerButton jobType={worker.key} disabled={planned} />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <AdminStatusBadge tone="muted">{worker.family}</AdminStatusBadge>
                    <AdminStatusBadge tone={planned ? "amber" : "green"}>{worker.status}</AdminStatusBadge>
                    <AdminStatusBadge tone="muted">{worker.cadence}</AdminStatusBadge>
                  </div>
                  <div className="mt-4 grid gap-2 text-xs text-white/50">
                    {history?.latest ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span>Latest</span>
                        <AdminStatusBadge tone={statusTone(history.latest.status)}>{history.latest.status.replace("_", " ")}</AdminStatusBadge>
                        <span>{fmt(history.latest.updated_at)}</span>
                      </div>
                    ) : (
                      <span>No runs recorded</span>
                    )}
                    {history?.lastSuccess ? <span>Last success {fmt(history.lastSuccess.completed_at || history.lastSuccess.updated_at)}</span> : null}
                    {history?.active ? <span>Active job {history.active.id}</span> : null}
                  </div>
                </article>
              );
            })}
          </div>
        </AdminSectionCard>
      </section>

      <AdminSectionCard>
        <div className="border-b border-white/10 px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-rose-200">Job ledger</p>
              <h2 className="mt-2 text-xl font-black text-white">Background job activity</h2>
              <p className="mt-1 text-sm text-white/50">Search, filter, inspect failures, review payloads, and audit job timelines.</p>
            </div>
            <form className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_170px_190px_auto_auto]">
              <AdminSearchInput name="q" defaultValue={filters.q || ""} placeholder="Search job type, ID, or error" />
              <select
                name="status"
                defaultValue={filters.status || ""}
                className="min-h-10 rounded-xl border border-white/10 bg-[#0b0b0d] px-3 text-sm font-bold text-white outline-none"
              >
                <option value="">All statuses</option>
                {STATUSES.map((status) => <option key={status} value={status}>{status.replace("_", " ")}</option>)}
              </select>
              <select
                name="worker"
                defaultValue={filters.worker || ""}
                className="min-h-10 rounded-xl border border-white/10 bg-[#0b0b0d] px-3 text-sm font-bold text-white outline-none"
              >
                <option value="">All workers</option>
                {jobTypes.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
              <button className="min-h-10 rounded-xl bg-[#e1062a] px-4 text-sm font-black text-white">Apply</button>
              <a href="/admin/dashboard/operations/workers" className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-black text-white/70">Clear</a>
            </form>
          </div>
        </div>

        {filtered.length ? (
          <div className="divide-y divide-white/10">
            {filtered.map((job) => {
              const jobEvents = allEvents
                .filter((event) => event.job_id === job.id)
                .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
              const runtimeError = unsupportedWorkerEvent(jobEvents);
              const runAt = new Date(job.run_after || job.created_at).getTime();
              const queueState =
                job.status === "queued" ? (runAt <= now ? "Ready now" : `Scheduled for ${fmt(job.run_after)}`) : null;
              const leaseExpires = job.lease_expires_at ? new Date(job.lease_expires_at).getTime() : null;
              const leaseState =
                job.status === "running"
                  ? leaseExpires == null
                    ? "No lease recorded"
                    : leaseExpires > now
                      ? "Lease active"
                      : "Lease expired"
                  : "—";

              return (
                <details key={job.id} className="group">
                  <summary className="grid cursor-pointer list-none gap-4 px-4 py-4 transition hover:bg-white/[0.025] marker:hidden sm:px-5 xl:grid-cols-[minmax(0,1.7fr)_135px_120px_130px_150px_auto] xl:items-center">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-rose-100">
                          <Workflow className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-black text-white">{job.job_type}</p>
                          <code className="block truncate text-xs text-white/35">{job.id}</code>
                        </div>
                      </div>
                    </div>
                    <div><p className="text-[10px] font-black uppercase tracking-[0.12em] text-white/35">Status</p><div className="mt-1"><AdminStatusBadge tone={statusTone(job.status)}>{job.status.replace("_", " ")}</AdminStatusBadge></div></div>
                    <div><p className="text-[10px] font-black uppercase tracking-[0.12em] text-white/35">Progress</p><p className="mt-1 text-sm font-black text-white/75">{job.progress_current}/{job.progress_total ?? "?"}</p></div>
                    <div><p className="text-[10px] font-black uppercase tracking-[0.12em] text-white/35">Attempts</p><p className="mt-1 text-sm font-black text-white/75">{job.attempt_count}/{job.max_attempts}</p></div>
                    <div><p className="text-[10px] font-black uppercase tracking-[0.12em] text-white/35">Duration</p><p className="mt-1 text-sm font-black text-white/75">{formatJobDuration(job, now)}</p></div>
                    <div className="justify-self-start xl:justify-self-end"><JobActionButtons id={job.id} status={job.status} /></div>
                  </summary>

                  <div className="border-t border-white/10 bg-black/20 px-4 py-5 sm:px-5">
                    {runtimeError ? <RuntimeConfigurationError job={job} event={runtimeError} /> : null}
                    {job.last_error ? (
                      <div className="mt-3 rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4">
                        <p className="text-xs font-black uppercase tracking-[0.14em] text-rose-100">Last error</p>
                        <pre className="mt-2 max-w-full overflow-x-auto whitespace-pre-wrap text-xs text-rose-100/75">{job.last_error}</pre>
                      </div>
                    ) : null}

                    <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
                      {[
                        ["Schedule", queueState || fmt(job.run_after), `Created ${fmt(job.created_at)}`],
                        ["Lease", leaseState, `${job.lease_owner || "No owner"} · expires ${fmt(job.lease_expires_at)}`],
                        ["Heartbeat", fmt(job.heartbeat_at), `Cancellation ${fmt(job.cancellation_requested_at)}`],
                        ["Priority", job.priority ?? "—", `Created by ${job.created_by_label || "System"}`],
                      ].map(([label, value, helper]) => (
                        <div key={String(label)} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35">{label}</p>
                          <p className="mt-2 text-sm font-black text-white/80">{String(value)}</p>
                          <p className="mt-1 text-xs leading-5 text-white/40">{String(helper)}</p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 grid gap-4 xl:grid-cols-2">
                      <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35">Redacted payload</p>
                        <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-black/35 p-3 text-xs text-white/55">{JSON.stringify(redact(job.payload || {}), null, 2)}</pre>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35">Event timeline</p>
                        <ol className="mt-3 space-y-2">
                          {jobEvents.length ? (
                            jobEvents.map((event) => (
                              <li key={event.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <strong className="text-xs uppercase text-white/80">{event.event_type.replace("_", " ")}</strong>
                                  <time className="text-[11px] text-white/35">{fmt(event.created_at)}</time>
                                </div>
                                <p className="mt-1 text-xs text-white/55">{event.message || "Worker event"}</p>
                                {event.created_by ? <p className="mt-1 text-[11px] text-white/35">Source: {event.created_by}</p> : null}
                                {event.metadata ? (
                                  <details className="mt-2">
                                    <summary className="cursor-pointer text-[11px] font-bold text-white/45">Metadata</summary>
                                    <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-black/30 p-2 text-[11px] text-white/45">{JSON.stringify(redact(event.metadata), null, 2)}</pre>
                                  </details>
                                ) : null}
                              </li>
                            ))
                          ) : (
                            <li className="text-xs text-white/45">No events captured for this job.</li>
                          )}
                        </ol>
                      </div>
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        ) : (
          <div className="p-5">
            <AdminEmptyState
              title="No worker jobs match these filters"
              body="Clear the current filters or search by a broader worker type, job ID, or error message."
              action={<AdminActionButton href="/admin/dashboard/operations/workers">Clear filters</AdminActionButton>}
            />
          </div>
        )}
      </AdminSectionCard>

      <AdminSectionCard className="p-5">
        <div className="flex items-start gap-3">
          <Boxes className="mt-0.5 h-5 w-5 shrink-0 text-rose-100" />
          <div>
            <h2 className="font-black text-white">Operational safety</h2>
            <p className="mt-1 text-sm leading-6 text-white/50">
              Payloads and event metadata remain redacted for sensitive keys. Manual run, retry, cancellation, and worker actions continue to use the existing protected Admin action handlers.
            </p>
          </div>
        </div>
      </AdminSectionCard>
    </AdminPageShell>
  );
}
