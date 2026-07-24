import { describe, expect, it } from "vitest";
import { formatElapsedTime, formatJobDuration, getFailureMetrics, getHealth, getLeaseMetrics, getQueueMetrics, getSuccessRate, type OperationsJob } from "../operationsMetrics";

const now = Date.parse("2026-07-24T17:00:00.000Z");
const job = (overrides: Partial<OperationsJob>): OperationsJob => ({ status: "queued", created_at: "2026-07-24T16:00:00.000Z", updated_at: "2026-07-24T16:00:00.000Z", ...overrides });

describe("worker operations metrics", () => {
  it("uses current time for queued job age", () => { expect(getQueueMetrics([job({ run_after: "2026-07-24T16:45:00.000Z" })], now).oldestRunnableAgeMs).toBe(15 * 60 * 1000); });
  it("does not produce queue age for future scheduled jobs", () => { const metrics = getQueueMetrics([job({ run_after: "2026-07-24T17:30:00.000Z" })], now); expect(metrics.oldestRunnableAgeMs).toBeNull(); expect(metrics.scheduledCount).toBe(1); });
  it("selects the oldest runnable job", () => { const old = job({ id: "old", run_after: "2026-07-24T16:30:00.000Z" }); const newer = job({ id: "new", run_after: "2026-07-24T16:50:00.000Z" }); expect(getQueueMetrics([newer, old], now).oldestRunnable?.id).toBe("old"); });
  it("distinguishes active and expired leases", () => { const metrics = getLeaseMetrics([job({ status: "running", lease_expires_at: "2026-07-24T17:01:00.000Z" }), job({ status: "running", lease_expires_at: "2026-07-24T16:59:00.000Z" })], now); expect(metrics.activeLeaseCount).toBe(1); expect(metrics.expiredLeaseCount).toBe(1); });
  it("detects stale heartbeats", () => { expect(getLeaseMetrics([job({ status: "running", heartbeat_at: "2026-07-24T16:57:30.000Z" })], now).staleHeartbeatCount).toBe(1); });
  it("excludes queued and running jobs from success-rate denominator", () => { const metrics = getSuccessRate([job({ status: "succeeded", completed_at: "2026-07-24T16:00:00.000Z" }), job({ status: "failed", completed_at: "2026-07-24T16:00:00.000Z" }), job({ status: "queued" }), job({ status: "running" })], now); expect(metrics).toMatchObject({ succeeded: 1, completed: 2, rate: 50 }); });
  it("returns unavailable success rate when no completed jobs exist", () => { expect(getSuccessRate([job({ status: "queued" })], now).rate).toBeNull(); });
  it("dead-letter jobs degrade health", () => { const failures = getFailureMetrics([job({ status: "dead_letter" })], now); expect(getHealth({ queue: getQueueMetrics([], now), leases: getLeaseMetrics([], now), failures, success: getSuccessRate([], now) })).toBe("Degraded"); });
  it("historical failures alone do not degrade health", () => { const failures = getFailureMetrics([job({ status: "failed", attempt_count: 3, max_attempts: 3, completed_at: "2026-07-23T16:00:00.000Z" })], now); expect(getHealth({ queue: getQueueMetrics([], now), leases: getLeaseMetrics([], now), failures, success: getSuccessRate([], now) })).toBe("Healthy"); });
  it("formats elapsed seconds, minutes, hours, and days", () => { expect([formatElapsedTime(14_000), formatElapsedTime(180_000), formatElapsedTime(8_040_000), formatElapsedTime(97_200_000)]).toEqual(["14s", "3m", "2h 14m", "1d 3h"]); });
  it("uses current time for running duration", () => { expect(formatJobDuration(job({ status: "running", started_at: "2026-07-24T16:58:00.000Z" }), now)).toBe("2m"); });
  it("counts scheduled queued jobs separately from runnable jobs", () => { const metrics = getQueueMetrics([job({ run_after: "2026-07-24T16:59:00.000Z" }), job({ run_after: "2026-07-24T17:01:00.000Z" })], now); expect(metrics.runnableCount).toBe(1); expect(metrics.scheduledCount).toBe(1); });
});
