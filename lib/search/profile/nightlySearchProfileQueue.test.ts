import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const edgeSource = readFileSync(
  "supabase/functions/nightly-search-profile-queue/index.ts",
  "utf8",
);
const migrationSource = readFileSync(
  "supabase/migrations/20260729214000_add_nightly_search_profile_queue_rpc.sql",
  "utf8",
);
const cronRouteSource = readFileSync(
  "app/api/cron/nightly-search-profile-queue/route.ts",
  "utf8",
);
const vercelConfig = JSON.parse(readFileSync("vercel.json", "utf8")) as {
  crons: Array<{ path: string; schedule: string }>;
};
const awsSchedules = JSON.parse(
  readFileSync("infra/aws/edge-runtime/schedules.json", "utf8"),
) as Array<{
  name: string;
  expression: string;
  function: string;
  body: Record<string, unknown>;
}>;

describe("nightly search profile edge queue", () => {
  it("runs classification queue creation inside a Supabase Edge Function", () => {
    expect(edgeSource).toContain("Deno.serve");
    expect(edgeSource).toContain("enqueue_nightly_location_search_profile_run");
    expect(edgeSource).toContain('request.headers.get("x-cron-secret")');
    expect(edgeSource).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("queues a large prioritized run without overlapping another nightly run", () => {
    expect(migrationSource).toContain("pg_advisory_xact_lock");
    expect(migrationSource).toContain("active_run_exists");
    expect(migrationSource).toContain("p_limit integer default 1500");
    expect(migrationSource).toContain("p.location_id is null");
    expect(migrationSource).toContain("p.needs_review = true");
    expect(migrationSource).toContain("p.verified_at is null");
    expect(migrationSource).toContain("limit v_limit");
  });

  it("keeps the nightly queue scheduled while AWS owns the every-minute worker", () => {
    expect(cronRouteSource).toContain("/functions/v1/nightly-search-profile-queue");
    expect(cronRouteSource).toContain("limit: 1500");
    expect(vercelConfig.crons).toContainEqual({
      path: "/api/cron/managed?job=nightly-search-profile-queue",
      schedule: "45 7 * * *",
    });
    expect(vercelConfig.crons.some(({ path }) => path.includes("location-search-profile-worker"))).toBe(false);
    expect(awsSchedules).toContainEqual({
      name: "location-search-profile-worker",
      expression: "cron(* * * * ? *)",
      function: "node:/api/cron/managed?job=location-search-profile-worker",
      body: {},
    });
  });
});
