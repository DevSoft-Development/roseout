import { describe, expect, it } from "vitest";
import {
  deriveHealthStatuses,
  extractGeoValues,
  extractIntentValues,
  extractPerformanceTimings,
  flattenJson,
  formatUnknown,
  redactSensitive,
  resolveExplorerSection,
} from "../search-explorer";

describe("search explorer utilities", () => {
  it("redacts sensitive metadata recursively while preserving arrays", () => {
    expect(
      redactSensitive({ token: "bad", nested: [{ api_key: "bad", safe: 2 }] }),
    ).toEqual({
      token: "[REDACTED]",
      nested: [{ api_key: "[REDACTED]", safe: 2 }],
    });
  });

  it("flattens nested paths including arrays and null", () => {
    expect(
      flattenJson(
        { telemetry: { stages: [{ ms: 12 }], note: null } },
        "metadata",
      ),
    ).toEqual([
      { path: "metadata.telemetry.stages[0].ms", key: "ms", value: 12 },
      { path: "metadata.telemetry.note", key: "note", value: null },
    ]);
  });

  it("derives statuses defensively", () => {
    expect(
      deriveHealthStatuses({
        success: false,
        had_issue: true,
        speed_status: "slow",
        metadata: { partialResultsReturned: true },
      }),
    ).toEqual(["Failed", "Issue", "Slow", "Partial Results"]);
    expect(deriveHealthStatuses({ success: true })).toEqual(["Healthy"]);
  });

  it("extracts top-level and nested timings without inventing missing values", () => {
    const timings = extractPerformanceTimings({
      timing_ms: 450,
      metadata: { performance: { intentMs: 23 } },
    });
    expect(timings.total).toBe(450);
    expect(timings.intent).toBe(23);
    expect(timings.geo).toBeNull();
  });

  it("handles null and legacy shapes", () => {
    expect(formatUnknown(null)).toBe("—");
    expect(
      extractIntentValues({
        metadata: null,
        debug: { normalizedIntent: { needsActivity: true } },
      }).needsActivity,
    ).toBe(true);
    expect(
      extractGeoValues({ metadata: { geo: { latitude: 40.7 } } }).latitude,
    ).toBe(40.7);
  });

  it("validates deep-link sections", () => {
    expect(resolveExplorerSection("metadata")).toBe("metadata");
    expect(resolveExplorerSection("made-up")).toBe("summary");
    expect(resolveExplorerSection(undefined)).toBe("summary");
  });
});
