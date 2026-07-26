import { describe, expect, it } from "vitest";

const slowStatuses = new Set(["slow", "critical", "failed", "timeout", "degraded"]);

function isSlow(timingMs: number | null, speedStatus: string | null) {
  return Number(timingMs ?? 0) > 5000 || slowStatuses.has(String(speedStatus ?? "").toLowerCase());
}

function normalizeQuery(value: string | null | undefined) {
  return String(value ?? "").toLowerCase().trim().replace(/\s+/g, " ");
}

describe("Search Health enterprise dashboard helpers", () => {
  it("normalizes equivalent queries for health-event correlation", () => {
    expect(normalizeQuery("  Chicken   lunch in Astoria ")).toBe("chicken lunch in astoria");
    expect(normalizeQuery("Chicken lunch in Astoria")).toBe("chicken lunch in astoria");
  });

  it("classifies slow searches from timing or degraded status", () => {
    expect(isSlow(5001, "fast")).toBe(true);
    expect(isSlow(1200, "degraded")).toBe(true);
    expect(isSlow(1200, "fast")).toBe(false);
  });
});
