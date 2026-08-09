import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("app/api/cron/google-meal-service-repair/route.ts", "utf8");

describe("Google meal-service repair scope", () => {
  it("excludes intentionally suppressed profiles before Google lookup", () => {
    expect(route).toContain('"hidden_inactive_eligibility_conflict"');
    expect(route).toContain('"unsupported_non_outing"');
    expect(route).toContain("SUPPRESSED_REVIEW_REASONS");
    expect(route).toContain("actionableProfiles");
    expect(route).toContain("!reasons.some((reason) => SUPPRESSED_REVIEW_REASONS.has(reason))");
  });
});
