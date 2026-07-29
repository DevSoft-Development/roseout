import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  "app/admin/dashboard/settings/location-tools/search-profiles/review/page.tsx",
  "utf8",
);

describe("search profile review queue location loading", () => {
  it("loads location ids in bounded batches instead of one oversized PostgREST query", () => {
    expect(source).toContain("LOCATION_LOOKUP_BATCH_SIZE = 100");
    expect(source).toContain("loadLocationsInBatches");
    expect(source).toContain("locationIds.slice(start, start + LOCATION_LOOKUP_BATCH_SIZE)");
    expect(source).toContain('.in("id", batch)');
    expect(source).not.toContain('.in("id", locationIds)');
  });
});
