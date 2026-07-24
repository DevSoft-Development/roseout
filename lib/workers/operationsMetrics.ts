export type WorkerJobStatus = "queued" | "running" | "succeeded" | "failed" | "dead_letter" | "cancelled" | string;

export type OperationsJob = {
  id?: string;
  job_type?: string;
  status: WorkerJobStatus;
  created_at: string;
  updated_at: string;
  run_after?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  attempt_count?: number | null;
  max_attempts?: number | null;
  lease_owner?: string | null;
  lease_expires_at?: string | null;
  heartbeat_at?: string | null;
};

export const WORKER_METRIC_THRESHOLDS = {
  staleHeartbeatMs: 2 * 60 * 1000,
  queueAttentionMs: 5 * 60 * 1000,
  queueDegradedMs: 15 * 60 * 1000,
  successRateAttention: 90,
  recentWindowMs: 24 * 60 * 60 * 1000,
} as const;

const COMPLETED = new Set(["succeeded", "failed", "dead_letter"]);

function time(value?: string | null) {
  const ms = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(ms) ? ms : null;
}

export function formatElapsedTime(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours ? `${days}d ${remHours}h` : `${days}d`;
}

export function getQueueMetrics(jobs: OperationsJob[], now: number) {
  const queued = jobs.filter((job) => job.status === "queued");
  const runnable = queued.filter((job) => (time(job.run_after) ?? time(job.created_at) ?? now) <= now);
  const scheduled = queued.filter((job) => (time(job.run_after) ?? time(job.created_at) ?? now) > now);
  const oldestRunnable = [...runnable].sort((a, b) => (time(a.run_after) ?? time(a.created_at) ?? now) - (time(b.run_after) ?? time(b.created_at) ?? now))[0] ?? null;
  const nextScheduled = [...scheduled].sort((a, b) => (time(a.run_after) ?? Infinity) - (time(b.run_after) ?? Infinity))[0] ?? null;
  const oldestRunnableAt = oldestRunnable ? (time(oldestRunnable.run_after) ?? time(oldestRunnable.created_at) ?? now) : null;
  const oldestRunnableAgeMs = oldestRunnableAt == null ? null : Math.max(0, now - oldestRunnableAt);
  return { queuedCount: queued.length, runnableCount: runnable.length, scheduledCount: scheduled.length, oldestRunnable, nextScheduled, oldestRunnableAgeMs };
}

export function getLeaseMetrics(jobs: OperationsJob[], now: number, staleHeartbeatMs = WORKER_METRIC_THRESHOLDS.staleHeartbeatMs) {
  const running = jobs.filter((job) => job.status === "running");
  const activeLeases = running.filter((job) => { const expires = time(job.lease_expires_at); return expires != null && expires > now; });
  const expiredLeases = running.filter((job) => { const expires = time(job.lease_expires_at); return expires != null && expires <= now; });
  const recentHeartbeats = running.filter((job) => { const heartbeat = time(job.heartbeat_at); return heartbeat != null && now - heartbeat <= staleHeartbeatMs; });
  const staleHeartbeats = running.filter((job) => { const heartbeat = time(job.heartbeat_at); return heartbeat != null && now - heartbeat > staleHeartbeatMs; });
  const oldestHeartbeat = [...running].filter((job) => time(job.heartbeat_at) != null).sort((a, b) => (time(a.heartbeat_at) ?? Infinity) - (time(b.heartbeat_at) ?? Infinity))[0] ?? null;
  const leaseOwners = [...new Set(running.map((job) => job.lease_owner).filter((owner): owner is string => Boolean(owner)))];
  return { runningCount: running.length, activeLeaseCount: activeLeases.length, expiredLeaseCount: expiredLeases.length, recentHeartbeatCount: recentHeartbeats.length, staleHeartbeatCount: staleHeartbeats.length, oldestHeartbeat, leaseOwners };
}

export function getFailureMetrics(jobs: OperationsJob[], now: number, recentWindowMs = WORKER_METRIC_THRESHOLDS.recentWindowMs) {
  const openFailures = jobs.filter((job) => job.status === "failed" && Number(job.attempt_count ?? 0) < Number(job.max_attempts ?? 0));
  const historicalFailures = jobs.filter((job) => job.status === "failed");
  const deadLetter = jobs.filter((job) => job.status === "dead_letter");
  const cutoff = now - recentWindowMs;
  const failuresLast24h = jobs.filter((job) => (job.status === "failed" || job.status === "dead_letter") && (time(job.completed_at) ?? time(job.updated_at) ?? 0) >= cutoff);
  return { openFailureCount: openFailures.length, historicalFailureCount: historicalFailures.length, deadLetterCount: deadLetter.length, failuresLast24hCount: failuresLast24h.length };
}

export function getSuccessRate(jobs: OperationsJob[], now: number, recentWindowMs = WORKER_METRIC_THRESHOLDS.recentWindowMs) {
  const cutoff = now - recentWindowMs;
  const completedRecent = jobs.filter((job) => COMPLETED.has(job.status) && (time(job.completed_at) ?? time(job.updated_at) ?? 0) >= cutoff);
  const succeeded = completedRecent.filter((job) => job.status === "succeeded").length;
  return { succeeded, completed: completedRecent.length, rate: completedRecent.length ? Math.round((succeeded / completedRecent.length) * 100) : null };
}

export function formatJobDuration(job: OperationsJob, now: number) {
  let start: number | null = null;
  let end: number | null = null;
  if (job.status === "running") { start = time(job.started_at); end = now; }
  else if (job.status === "queued") return "—";
  else if (job.status === "cancelled") { start = time(job.started_at) ?? time(job.created_at); end = time(job.completed_at) ?? time(job.updated_at); }
  else { start = time(job.started_at); end = time(job.completed_at); }
  if (start == null || end == null || end < start) return "—";
  return formatElapsedTime(end - start);
}

export function getHealth(metrics: { queue: ReturnType<typeof getQueueMetrics>; leases: ReturnType<typeof getLeaseMetrics>; failures: ReturnType<typeof getFailureMetrics>; success: ReturnType<typeof getSuccessRate>; }) {
  const queueAge = metrics.queue.oldestRunnableAgeMs ?? 0;
  if (metrics.leases.expiredLeaseCount > 0 || metrics.failures.deadLetterCount > 0 || queueAge > WORKER_METRIC_THRESHOLDS.queueDegradedMs) return "Degraded";
  if (metrics.failures.openFailureCount > 0 || metrics.leases.staleHeartbeatCount > 0 || queueAge > WORKER_METRIC_THRESHOLDS.queueAttentionMs || (metrics.success.rate != null && metrics.success.rate < WORKER_METRIC_THRESHOLDS.successRateAttention)) return "Attention needed";
  return "Healthy";
}
