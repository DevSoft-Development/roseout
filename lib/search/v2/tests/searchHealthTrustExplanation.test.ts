import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Search Health trust explanation surface", () => {
  it("shows a bounded explanation for production search rows in both admin surfaces", () => {
    for (const path of [
      "app/admin/dashboard/search-health/RecentCreateSearchesPanel.tsx",
      "apps/admin/app/admin/dashboard/search-health/RecentCreateSearchesPanel.tsx",
    ]) {
      const source = read(path);
      expect(source).toContain("Why did this result appear?");
      expect(source).toContain("Interpreted as");
      expect(source).toContain("Restaurant intent");
      expect(source).toContain("Activity intent");
      expect(source).toContain("Geography");
      expect(source).toContain("Pairing note");
      expect(source).toContain("restaurantIntent.cuisineTerms");
      expect(source).toContain("activityIntent.activityTerms");
      expect(source).toContain("metadata.normalizedIntent?.fallbackUsed");
      expect(source).toContain("metadata.fallback_used");
      expect(source).toContain("visibleResultCount <= 0 && pairCount <= 0");
    }
  });

  it("uses recorded search evidence instead of generating a new explanation", () => {
    const source = read("app/admin/dashboard/search-health/RecentCreateSearchesPanel.tsx");
    expect(source).toContain("metadata.normalizedIntent");
    expect(source).toContain("debug.normalizedIntent");
    expect(source).not.toContain("openai");
    expect(source).not.toContain("generateText");
  });
});
