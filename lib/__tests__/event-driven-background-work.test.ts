import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

type Schedule = {
  name: string;
  expression: string;
  function: string;
  body: Record<string, unknown>;
};

describe("event-driven AWS background work", () => {
  const schedules = JSON.parse(read("infra/aws/edge-runtime/schedules.json")) as Schedule[];
  const schedule = (name: string) => schedules.find((entry) => entry.name === name);

  it("keeps 65 schedules but turns idle loops into recovery sweeps", () => {
    expect(schedules).toHaveLength(65);
    expect(schedule("worker-http-response-reconciler")).toMatchObject({
      expression: "cron(0 * * * ? *)",
      function: "aws-db-maintenance",
      body: { operation: "worker_http_response_reconciler" },
    });
    expect(schedule("location-search-profile-worker")).toMatchObject({
      expression: "cron(0 * * * ? *)",
      function: "sqs:background-cron",
      body: { target: "/api/cron/managed?job=location-search-profile-worker" },
    });
    expect(schedule("catalog-enrichment-runner")).toMatchObject({
      expression: "cron(0 * * * ? *)",
      function: "sqs:background-cron",
      body: { target: "/api/cron/managed?job=catalog-enrichment-runner" },
    });
    expect(schedule("location-description-backfill")).toMatchObject({
      expression: "cron(0 * * * ? *)",
      function: "sqs:background-cron",
      body: { target: "/api/cron/managed?job=location-description-backfill" },
    });
    expect(schedule("team-session-watchdog")).toMatchObject({
      expression: "cron(0 * * * ? *)",
      function: "team-session-watchdog",
      body: { source: "cron" },
    });
    expect(schedule("claim-qr-repair-worker")).toMatchObject({
      expression: "cron(0/15 * * * ? *)",
      function: "sqs:background-cron",
      body: { target: "edge:claim-qr-repair-worker" },
    });
    expect(schedule("unified-location-gap-repair")).toMatchObject({
      expression: "cron(0/15 * * * ? *)",
      function: "sqs:background-cron",
      body: { target: "edge:unified-location-gap-repair" },
    });
    expect(schedule("worker-dispatcher-unified")).toMatchObject({
      expression: "cron(0/15 * * * ? *)",
      function: "sqs:background-cron",
      body: {
        target: "edge:worker-dispatcher",
        payload: {
          limit: 25,
          lease_seconds: 300,
          worker_name: "production-unified-worker",
        },
      },
    });
    expect(schedule("search-ml-learning-maintenance")).toMatchObject({
      expression: "cron(0/15 * * * ? *)",
      function: "sqs:background-cron",
      body: { target: "/api/cron/managed?job=search-ml-learning-maintenance" },
    });
  });

  it("preserves the 12-hour team session watchdog threshold", () => {
    const watchdog = read("supabase/functions/team-session-watchdog/index.ts");
    expect(watchdog).toContain("Date.now() - 12 * 60 * 60 * 1000");
    expect(watchdog).toContain('status: "needs_correction"');
    expect(watchdog).toContain('approval_status: "needs_correction"');
  });

  it("wakes Search ML from data changes and self-chains until the learning backlog is drained", () => {
    const lambda = read("infra/aws/lambda/background_work_signal.py");
    const worker = read("infra/aws/lambda/background_cron_worker.py");
    const migration = read("supabase/migrations/20260903003000_event_driven_search_ml_learning.sql");

    expect(lambda).toContain('"search-ml-learning-maintenance": "/api/cron/managed?job=search-ml-learning-maintenance"');
    expect(worker).toContain('"/api/cron/managed?job=search-ml-learning-maintenance"');
    expect(worker).toContain('target.endswith("job=search-ml-learning-maintenance")');
    expect(worker).toContain('value.get("remainingEstimate")');
    expect(worker).toContain('value.get("updated")');
    expect(worker).toContain("remaining > 0 and progressed > 0");

    expect(migration).toContain("search-ml-learning-maintenance");
    expect(migration).toContain("interval '10 seconds'");
    expect(migration).toContain("trg_signal_search_ml_location_change");
    expect(migration).toContain("trg_signal_search_ml_profile_food_change");
    expect(migration).toContain("trg_signal_search_ml_analytics_event");
    expect(migration).toContain("trg_signal_search_ml_negative_feedback");
    expect(migration).toContain("trg_signal_search_ml_outing_change");
    expect(migration).not.toMatch(/cron\.schedule\s*\(/i);
  });

  it("signals only approved jobs and reuses the durable background queue", () => {
    const lambda = read("infra/aws/lambda/background_work_signal.py");
    const baseMigration = read("supabase/migrations/20260902180000_event_driven_background_work_signals.sql");
    const repairMigration = read("supabase/migrations/20260902182500_event_driven_claim_qr_gap_repair.sql");
    const dispatcherMigration = read("supabase/migrations/20260902194000_event_driven_worker_dispatcher.sql");

    expect(lambda).toContain('"location-search-profile-worker": "/api/cron/managed?job=location-search-profile-worker"');
    expect(lambda).toContain('"catalog-enrichment-runner": "/api/cron/managed?job=catalog-enrichment-runner"');
    expect(lambda).toContain('"location-description-backfill": "/api/cron/managed?job=location-description-backfill"');
    expect(lambda).toContain('"claim-qr-repair-worker": "edge:claim-qr-repair-worker"');
    expect(lambda).toContain('"unified-location-gap-repair": "edge:unified-location-gap-repair"');
    expect(lambda).toContain('"worker-dispatcher-unified": "edge:worker-dispatcher"');
    expect(lambda).toContain('"jobType": "background.cron"');
    expect(lambda).toContain('"source": "database-work-signal"');
    expect(lambda).toContain("verify_aws_background_work_signal");

    expect(baseMigration).toContain("net.http_post");
    expect(baseMigration).toContain("aws_background_work_signal_secret");
    expect(baseMigration).toContain("trg_signal_location_search_profile_refresh_work");
    expect(baseMigration).toContain("trg_signal_location_search_profile_run_item_work");
    expect(baseMigration).toContain("trg_signal_location_enrichment_run_work");
    expect(baseMigration).toContain("trg_signal_location_enrichment_item_work");
    expect(baseMigration).toContain("trg_signal_location_description_backfill_work");
    expect(repairMigration).toContain("trg_signal_claim_qr_repair_work");
    expect(repairMigration).toContain("trg_signal_unified_location_gap_repair_work");
    expect(repairMigration).toContain("new.job_type = 'claim.qr_repair'");
    expect(repairMigration).toContain("old.gap_repair_last_checked_at is distinct from new.gap_repair_last_checked_at");
    expect(dispatcherMigration).toContain("trg_signal_worker_dispatcher_work");
    expect(dispatcherMigration).toContain("worker-dispatcher-unified");
    expect(dispatcherMigration).not.toMatch(/cron\.schedule\s*\(/i);
  });

  it("uses worker_jobs as the dispatcher wake authority", () => {
    const enqueue = read("lib/workers/enqueue.ts");
    expect(enqueue).not.toContain("AWS_EVENT_DISPATCH_JOB_TYPES");
    expect(enqueue).not.toContain('invokePlatformBackground("worker-dispatcher"');
  });

  it("chains successful Node and approved Edge batches only while work remains", () => {
    const worker = read("infra/aws/lambda/background_cron_worker.py");
    const schedulerInvoker = read("infra/aws/lambda/edge_scheduler_invoker.py");
    const stack = read("infra/aws/cloudformation/background-cron-runtime.yml");

    expect(worker).toContain("EDGE_ALLOWED_TARGETS");
    expect(worker).toContain('"edge:claim-qr-repair-worker"');
    expect(worker).toContain('"edge:unified-location-gap-repair"');
    expect(worker).toContain('"edge:worker-dispatcher"');
    expect(worker).toContain('target == "edge:worker-dispatcher"');
    expect(worker).toContain('value.get("claimed")');
    expect(worker).toContain('"x-worker-secret": _worker_secret_value()');
    expect(worker).toContain("_build_edge_http_event");
    expect(worker).toContain("EDGE_RUNTIME_FUNCTION_NAME");
    expect(worker).toContain("_should_continue");
    expect(worker).toContain("background_cron_continuation_queued");
    expect(worker).toContain('continuation["source"] = "background-cron-chain"');
    expect(worker).toContain("DelaySeconds=2");
    expect(schedulerInvoker).toContain("BACKGROUND_EDGE_TARGETS");
    expect(schedulerInvoker).toContain('"edge:claim-qr-repair-worker"');
    expect(schedulerInvoker).toContain('"edge:unified-location-gap-repair"');
    expect(schedulerInvoker).toContain('"edge:worker-dispatcher"');
    expect(stack).toContain("EDGE_RUNTIME_FUNCTION_NAME");
    expect(stack).toContain("sqs:SendMessage");
    expect(stack).toContain("MaximumConcurrency: 3");
    expect(stack).not.toContain("ReservedConcurrentExecutions:");
  });

  it("keeps signal verification service-role-only", () => {
    const migration = read("supabase/migrations/20260902180000_event_driven_background_work_signals.sql");
    const repairMigration = read("supabase/migrations/20260902182500_event_driven_claim_qr_gap_repair.sql");
    const dispatcherMigration = read("supabase/migrations/20260902194000_event_driven_worker_dispatcher.sql");
    expect(migration).toContain(
      "revoke all on function public.verify_aws_background_work_signal(text) from public, anon, authenticated",
    );
    expect(migration).toContain(
      "grant execute on function public.verify_aws_background_work_signal(text) to service_role",
    );
    expect(migration).toContain("set search_path = pg_catalog, public, vault");
    expect(repairMigration).toContain(
      "revoke all on function private.signal_claim_qr_repair_work() from public, anon, authenticated",
    );
    expect(repairMigration).toContain(
      "revoke all on function private.signal_unified_location_gap_repair_work() from public, anon, authenticated",
    );
    expect(dispatcherMigration).toContain(
      "revoke all on function private.signal_worker_dispatcher_work() from public, anon, authenticated",
    );
  });
});
