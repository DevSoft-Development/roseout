import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("app/api/cron/search-ml-learning-maintenance/route.ts", "utf8");

describe("Search ML learning maintenance tag backfill", () => {
  it("paginates Supabase reads beyond the default 1,000-row response cap", () => {
    expect(route).toContain("const SUPABASE_PAGE_SIZE = 1000;");
    expect(route).toContain("async function fetchAllLocationMlAttributes(maxRows: number)");
    expect(route).toContain("async function fetchAllSearchableLocations(maxRows: number)");
    expect(route.match(/\.range\(from, to\)/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("uses stable ordering for paged reads", () => {
    expect(route).toContain('.order("calculated_at", { ascending: true })');
    expect(route).toContain('.order("location_id", { ascending: true })');
    expect(route).toContain('.order("updated_at", { ascending: false })');
    expect(route).toContain('.order("id", { ascending: true })');
  });

  it("reports remaining work from the actual pending candidate set", () => {
    expect(route).toContain("const pending = locationRows.map");
    expect(route).toContain("remainingEstimate: Math.max(0, pending.length - updated)");
  });
});
