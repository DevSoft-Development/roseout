import { describe, expect, it } from "vitest";
import { GOLDEN_SEARCH_QUERIES } from "./goldenQueries";
import { buildLaunchGates, canIncreaseProfileRollout } from "./launchGates";

describe("Search API prelaunch phase 2", () => {
  it("ships a broad golden query suite", () => {
    expect(GOLDEN_SEARCH_QUERIES.length).toBeGreaterThanOrEqual(20);
    expect(new Set(GOLDEN_SEARCH_QUERIES.map((item) => item.category)).size).toBeGreaterThanOrEqual(8);
    expect(GOLDEN_SEARCH_QUERIES.some((item) => (item.expectations.minimumPairs ?? 0) > 0)).toBe(true);
  });

  it("blocks rollout increases when a critical gate fails", () => {
    const result = canIncreaseProfileRollout({ total: 100, successRate: 99.8, wrongDomainRate: 3, geographyLeakageRate: 0, pairedQuerySuccessRate: 90, noResultRegressionRate: 0, legacyFallbackRate: 5, p95LatencyMs: 2000, contractFailureCount: 0 });
    expect(result.allowed).toBe(false);
    expect(result.gates.find((gate) => gate.key === "wrongDomainRate")?.passed).toBe(false);
  });

  it("allows rollout increases only when all critical gates pass", () => {
    const metrics = { total: 100, successRate: 99.8, wrongDomainRate: 1, geographyLeakageRate: 0.5, pairedQuerySuccessRate: 90, noResultRegressionRate: 1, legacyFallbackRate: 8, p95LatencyMs: 2500, contractFailureCount: 0 };
    expect(buildLaunchGates(metrics).every((gate) => gate.passed)).toBe(true);
    expect(canIncreaseProfileRollout(metrics).allowed).toBe(true);
  });
});
