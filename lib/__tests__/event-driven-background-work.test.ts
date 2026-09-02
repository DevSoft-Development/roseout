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

  it("keeps 65 schedules but turns idle minute loops into recovery sweeps", () => {
    expect(schedules).toHaveLength(65);
    expect(schedule("worker-http-response-reconciler")).toMatchObject({
      expression: "cron(0/15 * * * ? *)",
      function: "aws-db-maintenance",
      body: { operation: "worker_http_response_reconciler" },
    });
    expect(schedule("location-search-profile-worker")).toMatchObject({
      expression: "cron(0/15 * * * ? *)",
      function: "sqs:background-cron",
      body: { target: "/api/cron/managed?job=location-search-profile-worker" },
    });
    expect(schedule("catalog-enrichment-runner")).toMatchObject({
      expression: "cron(0/15 * * * ? *)",
      function: "sqs:background-cron",
      body: { target: "/api/cron/managed?job=catalog-enrichment-runner" },
    });
    expect(schedule("location-description-backfill")).toMatchObject({
      expression: "cron(0/30 * * * ? *)",
      function: "sqs:background-cron",
      body: { target: "/api/cron/managed?job=location-description-backfill" },
    });
  });

  it("keeps active search learning at one minute until its backlog is cleared", () => {
    expect(schedule("search-ml-learning-maintenance")).toMatchObject({
      expression: "cron(* * * * ? *)",
      function: "node:/api/cron/managed?job=search-ml-learning-maintenance",
    });
  });

  it("signals only approved jobs and reuses the durable background queue", () => {
    const lambda = read("infra/aws/lambda/background_work_signal.py");
    const migration = read("supabase/migrations/20260902180000_event_driven_background_work_signals.sql");

    expect(lambda).toContain('"location-search-profile-worker": "/api/cron/managed?job=location-search-profile-worker"');
    expect(lambda).toContain('"catalog-enrichment-runner": "/api/cron/managed?job=catalog-enrichment-runner"');
    expect(lambda).toContain('"location-description-backfill": "/api/cron/managed?job=location-description-backfill"');
    expect(lambda).toContain('"jobType": "background.cron"');
    expect(lambda).toContain('"source": "database-work-signal"');
    expect(lambda).toContain("verify_aws_background_work_signal");

    expect(migration).toContain("net.http_post");
    expect(migration).toContain("aws_background_work_signal_secret");
    expect(migration).toContain("trg_signal_location_search_profile_refresh_work");
    expect(migration).toContain("trg_signal_location_search_profile_run_item_work");
    expect(migration).toContain("trg_signal_location_enrichment_run_work");
    expect(migration).toContain("trg_signal_location_enrichment_item_completion");
    expect(migration).toContain("trg_signal_location_description_backfill_work");
    expect(migration).not.toMatch(/cron\.schedule\s*\(/i);
  });

  it("keeps signal verification service-role-only", () => {
    const migration = read("supabase/migrations/20260902180000_event_driven_background_work_signals.sql");
    expect(migration).toContain(
      "revoke all on function public.verify_aws_background_work_signal(text) from public, anon, authenticated",
    );
    expect(migration).toContain(
      "grant execute on function public.verify_aws_background_work_signal(text) to service_role",
    );
    expect(migration).toContain("set search_path = pg_catalog, public, vault");
  });
});
