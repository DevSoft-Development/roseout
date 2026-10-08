import { supabaseAdmin } from "@/lib/supabase-admin";

type Phase13Embeddings = {
  ready?: number;
  failed?: number;
  scanned?: number;
  skippedIneligible?: number;
  candidatePool?: number;
  remainingApprox?: number;
  timeBudgetReached?: boolean;
};

function numberEnv(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) ? value : fallback;
}

async function main() {
  const db = supabaseAdmin as any;
  const { data, error } = await db
    .from("cron_job_runs")
    .select("started_at,status,details")
    .eq("job_key", "search-phase13-maintenance")
    .order("started_at", { ascending: false })
    .limit(1);

  if (error) throw new Error(error.message);
  const row = data?.[0];
  if (!row) throw new Error("search_phase13_run_missing");

  const embeddings = (row.details?.embeddings ?? {}) as Phase13Embeddings;
  const maxAgeMinutes = numberEnv("SEARCH_V3_PHASE13_MAX_AGE_MINUTES", 30);
  const maxRemaining = numberEnv("SEARCH_V3_PHASE13_MAX_REMAINING", 50);
  const minReady = numberEnv("SEARCH_V3_PHASE13_MIN_READY", 4961);
  const ageMinutes = (Date.now() - Date.parse(row.started_at)) / 60000;

  const checks = {
    runSucceeded: row.status === "success",
    fresh: Number.isFinite(ageMinutes) && ageMinutes <= maxAgeMinutes,
    failedZero: Number(embeddings.failed ?? -1) === 0,
    scansCandidates: Number(embeddings.scanned ?? 0) > 0,
    advancesPastIneligible:
      Number(embeddings.skippedIneligible ?? Number.MAX_SAFE_INTEGER) <
      Number(embeddings.candidatePool ?? 0),
    readyAdvanced: Number(embeddings.ready ?? 0) >= minReady,
    remainingWithinGate: Number(embeddings.remainingApprox ?? Number.MAX_SAFE_INTEGER) <= maxRemaining,
    withinTimeBudget: embeddings.timeBudgetReached !== true,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    startedAt: row.started_at,
    ageMinutes,
    thresholds: { maxAgeMinutes, maxRemaining, minReady },
    embeddings,
    checks,
    passed: Object.values(checks).every(Boolean),
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 2;
});
