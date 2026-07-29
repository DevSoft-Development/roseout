import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("app/admin/dashboard/settings/location-tools/search-profiles/review/page.tsx", "utf8");
const table = readFileSync("components/admin/location-tools/SearchProfileReviewTable.tsx", "utf8");

describe("Search Profile Review Center layout", () => {
  it("uses compact labeled filters instead of stretching controls vertically", () => {
    expect(page).toContain("xl:grid-cols-[minmax(280px,1.4fr)_180px_minmax(240px,1fr)_auto]");
    expect(page).toContain("h-11 w-full min-w-0");
    expect(page).toContain("whitespace-nowrap");
  });

  it("uses responsive review cards instead of an over-wide table", () => {
    expect(table).toContain("xl:grid-cols-[32px_minmax(220px,1.4fr)");
    expect(table).not.toContain("min-w-[1250px]");
    expect(table).not.toContain("<table");
  });

  it("keeps the core review context and bulk workflow visible", () => {
    for (const label of ["Classification", "Why review", "Confidence", "Verify selected", "Apply safe corrections", "Review & apply"]) {
      expect(table).toContain(label);
    }
  });
});
