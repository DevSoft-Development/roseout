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
const vercelConfig = readFileSync("vercel.json", "utf8");

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

  it("schedules the edge queue nightly while preserving the every-minute worker", () => {
    expect(cronRouteSource).toContain("/functions/v1/nightly-search-profile-queue");
    expect(cronRouteSource).toContain("limit: 1500");
    expect(vercelConfig).toContain('"path": "/api/cron/nightly-search-profile-queue"');
    expect(vercelConfig).toContain('"schedule": "30 6 * * *"');
    expect(vercelConfig).toContain('"path": "/api/cron/location-search-profile-worker"');
    expect(vercelConfig).toContain('"schedule": "* * * * *"');
  });
});
