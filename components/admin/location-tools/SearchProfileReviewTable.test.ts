import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("search profile review center", () => {
  it("shows the operational profile fields and bulk actions", () => {
    const table = read("components/admin/location-tools/SearchProfileReviewTable.tsx");
    for (const label of ["Type", "State", "City", "Status", "Domain", "Search terms", "Confidence", "Version", "Generated", "Why review"]) {
      expect(table).toContain(label);
    }
    expect(table).toContain("Verify selected");
    expect(table).toContain("Apply safe corrections");
    expect(table).toContain("Verify anyway");
  });

  it("supports search, severity, and reason filters", () => {
    const page = read("app/admin/dashboard/settings/location-tools/search-profiles/review/page.tsx");
    expect(page).toContain('name="search"');
    expect(page).toContain('name="severity"');
    expect(page).toContain('name="reason"');
    expect(page).toContain("Search Profile Review Center");
  });
});
