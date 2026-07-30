import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("profile backfill live progress contract", () => {
  it("schedules the worker every minute and exposes a GET handler for Vercel cron", () => {
    const vercel = JSON.parse(read("vercel.json")) as {
      crons: Array<{ path: string; schedule: string }>;
    };
    expect(vercel.crons).toContainEqual({
      path: "/api/cron/location-search-profile-worker",
      schedule: "* * * * *",
    });

    const route = read("app/api/cron/location-search-profile-worker/route.ts");
    expect(route).toContain("export async function GET");
    expect(route).toContain("processProfileRunBatch");
  });

  it("uses the database run-item success status and reconciles parent counters", () => {
    const processor = read("lib/search/profile/profileRunProcessor.ts");
    const migration = read("supabase/migrations/20260729120000_search_foundation_v3.sql");

    expect(migration).toContain("'pending','processing','succeeded','failed','skipped','cancelled'");
    expect(processor).toContain('status: "succeeded"');
    expect(processor).not.toContain('status: "completed"');
    expect(processor).toContain('item.status === "succeeded"');
    expect(processor).toContain("processed_count");
    expect(processor).toContain("succeeded_count");
    expect(processor).toContain("failed_count");
    expect(processor).toContain("needs_review_count");
    expect(processor).toContain('status: completed ?');
    expect(processor).toContain("completed_at");
  });

  it("polls active run pages and disables caching", () => {
    const page = read(
      "app/admin/dashboard/settings/location-tools/search-profiles/runs/[runId]/page.tsx",
    );
    const refresh = read("components/admin/location-tools/ProfileRunLiveRefresh.tsx");
    expect(page).toContain('export const dynamic = "force-dynamic"');
    expect(page).toContain("ProfileRunLiveRefresh");
    expect(refresh).toContain("window.setInterval(refresh, 3000)");
    expect(refresh).toContain("router.refresh()");
  });
});
