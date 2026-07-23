import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-worker-secret",
};

type WorkerJob = {
  id: string;
  job_type: string;
  payload: Record<string, unknown>;
  attempt_count: number;
  max_attempts: number;
};

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const expectedSecret = Deno.env.get("WORKER_INTERNAL_SECRET");
  const suppliedSecret = request.headers.get("x-worker-secret");

  if (!expectedSecret || suppliedSecret !== expectedSecret) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(
      { error: "Missing Supabase environment variables" },
      500,
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const workerName = `worker-dispatcher-${crypto.randomUUID()}`;

  const { data: jobs, error: claimError } = await supabase.rpc(
    "claim_worker_jobs",
    {
      p_worker: workerName,
      p_limit: 5,
      p_job_types: null,
      p_lease_seconds: 120,
    },
  );

  if (claimError) {
    console.error("Unable to claim jobs", claimError);

    return jsonResponse(
      {
        error: "Unable to claim jobs",
        details: claimError.message,
      },
      500,
    );
  }

  const claimedJobs = (jobs ?? []) as WorkerJob[];
  const results: Array<Record<string, unknown>> = [];

  for (const job of claimedJobs) {
    try {
      await processJob(job);

      const { error: completeError } = await supabase.rpc(
        "complete_worker_job",
        {
          p_job_id: job.id,
          p_result: {
            processed_by: workerName,
            processed_at: new Date().toISOString(),
          },
        },
      );

      if (completeError) {
        throw completeError;
      }

      results.push({
        job_id: job.id,
        job_type: job.job_type,
        status: "succeeded",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);

      console.error(`Job ${job.id} failed`, error);

      const { error: failureError } = await supabase.rpc(
        "fail_worker_job",
        {
          p_job_id: job.id,
          p_error: message,
          p_retryable: true,
          p_backoff_seconds: 60,
          p_metadata: {
            worker: workerName,
            job_type: job.job_type,
          },
        },
      );

      if (failureError) {
        console.error(
          `Unable to record failure for job ${job.id}`,
          failureError,
        );
      }

      results.push({
        job_id: job.id,
        job_type: job.job_type,
        status: "failed",
        error: message,
      });
    }
  }

  return jsonResponse({
    worker: workerName,
    claimed: claimedJobs.length,
    results,
  });
});

async function processJob(job: WorkerJob): Promise<void> {
  switch (job.job_type) {
    case "health.check":
      console.log("Health-check job processed", job.id);
      return;

    /*
     * Add real job handlers here:
     *
     * case "search.qa":
     *   await processSearchQa(job);
     *   return;
     *
     * case "search.parity":
     *   await processSearchParity(job);
     *   return;
     *
     * case "location.enrichment":
     *   await processLocationEnrichment(job);
     *   return;
     */

    default:
      throw new Error(`Unsupported worker job type: ${job.job_type}`);
  }
}