import type { JobHandler, WorkerJob, WorkerContext } from "./types.ts";
import { retryDelaySeconds } from "./retry.ts";

const boundedNoop = (family: string): JobHandler => async (job, ctx) => { ctx.log("worker.handler.deferred", { jobId: job.id, jobType: job.job_type, family }); return { progress: { current: 1, total: 1 }, checkpoint: { deferredAt: new Date().toISOString() }, result: { deferred: true, family } }; };

export const handlers: Record<string, JobHandler> = {
  "search.anchor.reconcile": boundedNoop("search-anchor-reconciliation"),
  "search.qa.batch": boundedNoop("search-health-batch-qa"),
  "search.parity.evaluate": boundedNoop("search-parity-shadow"),
  "search.maintenance": boundedNoop("search-maintenance"),
  "ml.booking_likelihood.recalculate": boundedNoop("booking-likelihood"),
  "ml.location_scores.recalculate": boundedNoop("location-scores"),
  "ml.pair_compatibility.recalculate": boundedNoop("pair-compatibility"),
  "ml.duplicate_detection.recalculate": boundedNoop("duplicate-detection"),
  "location.chain_classify": boundedNoop("chain-classification"),
  "location.backfill": boundedNoop("location-backfill"),
  "import.google_places": boundedNoop("google-places-import"),
  "import.nyc_restaurants": boundedNoop("nyc-restaurants-import"),
  "import.osm_activities": boundedNoop("osm-activities-import"),
  "enrichment.google_metadata": boundedNoop("google-metadata"),
  "enrichment.google_photos": boundedNoop("google-photos"),
  "notification.deliver": boundedNoop("notification-delivery"),
};

export async function processJob(job: WorkerJob, ctx: WorkerContext) { const handler = handlers[job.job_type]; if (!handler) throw new Error(`Unsupported job type: ${job.job_type}`); if (Date.now() > ctx.deadline) return { retryAfterSeconds: retryDelaySeconds(job.attempt_count), checkpoint: job.checkpoint, result: { deferred: "time_budget" } }; return handler(job, ctx); }
