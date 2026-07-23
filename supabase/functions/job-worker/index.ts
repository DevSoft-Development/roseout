import { validateInternalRequest } from "../_shared/workers/auth.ts";
import { createServiceClient } from "../_shared/workers/client.ts";
import { optionsResponse } from "../_shared/workers/cors.ts";
import { log } from "../_shared/workers/logging.ts";
import { json } from "../_shared/workers/response.ts";
import { processJob } from "../_shared/workers/jobs.ts";
import { retryDelaySeconds } from "../_shared/workers/retry.ts";
import type { WorkerJob } from "../_shared/workers/types.ts";

Deno.serve(async (req) => {
  const options = optionsResponse(req); if (options) return options;
  const auth = validateInternalRequest(req); if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({})) as { jobTypes?: string[]; limit?: number; leaseSeconds?: number; timeBudgetMs?: number };
  const supabase = createServiceClient();
  const workerId = `edge-${crypto.randomUUID()}`;
  await supabase.rpc("recover_stale_worker_jobs", { p_stale_seconds: 300 });
  const limit = Math.max(1, Math.min(Number(body.limit ?? 5), 10));
  const { data, error } = await supabase.rpc("claim_worker_jobs", { p_worker: workerId, p_limit: limit, p_job_types: body.jobTypes ?? null, p_lease_seconds: Math.max(30, Math.min(Number(body.leaseSeconds ?? 120), 300)) });
  if (error) return json({ success: false, error: error.message }, { status: 500 });
  const jobs = (Array.isArray(data) ? data : []) as WorkerJob[];
  const summary = { claimed: jobs.length, succeeded: 0, retried: 0, failed: 0, unsupported: 0, jobIds: jobs.map((job) => job.id) };
  for (const job of jobs) {
    try {
      const result = await processJob(job, { supabase, deadline: Date.now() + Math.min(Number(body.timeBudgetMs ?? 45000), 55000), workerId, log: (event, metadata) => log(event, { jobId: job.id, ...metadata }) });
      if (result.progress) await supabase.rpc("update_worker_job_progress", { p_job_id: job.id, p_progress_current: result.progress.current, p_progress_total: result.progress.total ?? null, p_checkpoint: result.checkpoint ?? null, p_result: result.result ?? null });
      await supabase.rpc("complete_worker_job", { p_job_id: job.id, p_result: result.result ?? {} });
      summary.succeeded += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const unsupported = message.startsWith("Unsupported job type");
      await supabase.rpc("fail_worker_job", { p_job_id: job.id, p_error: message, p_retryable: !unsupported, p_backoff_seconds: retryDelaySeconds(job.attempt_count), p_metadata: { unsupported } });
      if (unsupported) summary.unsupported += 1; else summary.retried += 1;
    }
  }
  return json({ success: true, summary });
});
