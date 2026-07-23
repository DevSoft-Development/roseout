import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type WorkerJobType =
  | "search.anchor.reconcile"
  | "search.qa.batch"
  | "search.parity.evaluate"
  | "search.maintenance"
  | "ml.booking_likelihood.recalculate"
  | "ml.location_scores.recalculate"
  | "ml.pair_compatibility.recalculate"
  | "ml.duplicate_detection.recalculate"
  | "location.chain_classify"
  | "location.backfill"
  | "import.google_places"
  | "import.nyc_restaurants"
  | "import.osm_activities"
  | "enrichment.google_metadata"
  | "enrichment.google_photos"
  | "notification.deliver";

type EnqueueOptions = {
  jobType: WorkerJobType;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  priority?: number;
  maxAttempts?: number;
  createdByLabel?: string;
};

export async function enqueueWorkerJob(options: EnqueueOptions) {
  const { data, error } = await supabaseAdmin.rpc("enqueue_worker_job", {
    p_job_type: options.jobType,
    p_payload: options.payload,
    p_payload_version: 1,
    p_idempotency_key: options.idempotencyKey,
    p_priority: options.priority ?? 100,
    p_max_attempts: options.maxAttempts ?? 5,
    p_created_by_label: options.createdByLabel ?? "next-admin-api",
  });
  if (error) throw new Error(error.message);
  return data as { id: string; job_type: string; status: string; idempotency_key: string | null };
}

export function acceptedJobResponse(job: { id: string; job_type: string; status: string; idempotency_key?: string | null }) {
  return NextResponse.json(
    { success: true, accepted: true, jobId: job.id, jobType: job.job_type, status: job.status, idempotencyKey: job.idempotency_key },
    { status: 202 },
  );
}

export function dateBucket(request: NextRequest, fallback = new Date()) {
  return request.nextUrl.searchParams.get("date") || fallback.toISOString().slice(0, 10);
}
