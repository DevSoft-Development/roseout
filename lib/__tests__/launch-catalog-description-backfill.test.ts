import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("Launch catalog factual description backfill", () => {
  it("uses Google structured facts and rejects promotional copy", () => {
    const health = source("lib/admin/location-launch-health.ts");

    expect(health).toContain("google_primary_type");
    expect(health).toContain("google_types");
    expect(health).toContain("google_meal_periods");
    expect(health).toContain("Do not copy, reconstruct, paraphrase, or imitate Google editorial summaries");
    expect(health).toContain("Do not market, praise, recommend, embellish, infer");
    expect(health).toContain("PROMOTIONAL_FILLER");
    expect(health).not.toContain('["vibe_tags", row.vibe_tags]');
    expect(health).not.toContain("google_rating");
    expect(health).not.toContain("google_user_rating_count");
  });

  it("skips thin records instead of generating filler and never overwrites existing descriptions", () => {
    const health = source("lib/admin/location-launch-health.ts");

    expect(health).toContain('"insufficient_verified_facts"');
    expect(health).toContain('description_backfill_status: "skipped"');
    expect(health).toContain('.is("description", null)');
  });

  it("persists provenance and resumable processing state", () => {
    const health = source("lib/admin/location-launch-health.ts");
    const migration = source("supabase/migrations/20260817021800_location_description_backfill_state.sql");

    expect(health).toContain('LOCATION_DESCRIPTION_SOURCE = "ai_google_structured_facts_v1"');
    expect(health).toContain("description_backfill_status");
    expect(health).toContain("description_backfill_checked_at");
    expect(migration).toContain("description_backfill_source");
    expect(migration).toContain("locations_description_backfill_pending_idx");
  });

  it("runs on database work signals with a durable 30-minute AWS recovery sweep", () => {
    const health = source("lib/admin/location-launch-health.ts");
    const cron = source("app/api/cron/location-description-backfill/route.ts");
    const schedules = JSON.parse(source("infra/aws/edge-runtime/schedules.json")) as Array<{
      name: string;
      expression: string;
      function: string;
      body: Record<string, unknown>;
    }>;
    const signalMigration = source("supabase/migrations/20260902180000_event_driven_background_work_signals.sql");
    const vercel = JSON.parse(source("vercel.json")) as {
      crons: Array<{ path: string; schedule: string }>;
    };

    expect(cron).toContain('phase: "public"');
    expect(cron).not.toContain('phase: "hidden"');
    expect(schedules).toContainEqual(expect.objectContaining({
      name: "location-description-backfill",
      expression: "cron(0/30 * * * ? *)",
      function: "sqs:background-cron",
      body: { target: "/api/cron/managed?job=location-description-backfill" },
    }));
    expect(signalMigration).toContain("trg_signal_location_description_backfill_work");
    expect(vercel.crons.some((entry) => entry.path.includes("location-description-backfill"))).toBe(false);
    expect(health).toContain("if (!health.descriptions.publicPhaseComplete)");
  });

  it("adds a first-class admin launch health page and dashboard link", () => {
    const page = source("app/admin/dashboard/launch-catalog/page.tsx");
    const client = source("app/admin/dashboard/launch-catalog/LaunchCatalogClient.tsx");
    const dashboard = source("app/admin/dashboard/page.tsx");

    expect(page).toContain("Launch Catalog Health");
    expect(client).toContain("Google-structured facts");
    expect(client).toContain("Run next 25");
    expect(client).toContain("Run hidden batch");
    expect(dashboard).toContain('/admin/dashboard/launch-catalog');
  });
});
