import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Why this matches trust surfaces", () => {
  it("renders structured explanations on both web consumer surfaces", () => {
    for (const path of [
      "app/create/GuidedResultsPageV4.tsx",
      "apps/consumer/app/create/GuidedResultsPageV4.tsx",
    ]) {
      const source = read(path);
      expect(source).toContain("Why this matches");
      expect(source).toContain("matchReasonDetails");
      expect(source).toContain("structuredSignals");
    }
  });

  it("passes structured reasons through the mobile adapter and renders them", () => {
    for (const path of [
      "app/api/mobile/v1/search/route.ts",
      "apps/consumer/app/api/mobile/v1/search/route.ts",
    ]) {
      expect(read(path)).toContain("matchReasonLabels");
      expect(read(path)).toContain("matchReasons: matchReasonLabels(value)");
    }
    const mobileCards = read("mobile/components/search/SearchResultCards.tsx");
    expect(mobileCards).toContain("WHY THIS MATCHES");
    expect(mobileCards).toContain("matchReasons.slice(0, 5)");
  });
});
