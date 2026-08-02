import { describe, expect, it } from "vitest";

function rankProductionQueries(rows: Array<Record<string, any>>) {
  const grouped = new Map<string, any>();
  for (const row of rows) {
    const normalized = String(row.query ?? "").trim().replace(/\s+/g, " ");
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    const current = grouped.get(key) ?? {
      query: normalized,
      frequency: 0,
      priorQualityFailures: 0,
      priorTechnicalFailures: 0,
      lastSeenAt: row.created_at,
    };
    current.frequency += 1;
    current.priorQualityFailures += row.quality_success === false ? 1 : 0;
    current.priorTechnicalFailures += row.technical_success === false ? 1 : 0;
    grouped.set(key, current);
  }
  return [...grouped.values()].sort((a, b) =>
    b.priorQualityFailures - a.priorQualityFailures ||
    b.priorTechnicalFailures - a.priorTechnicalFailures ||
    b.frequency - a.frequency,
  );
}

describe("production replay review", () => {
  it("deduplicates equivalent queries and preserves frequency", () => {
    const ranked = rankProductionQueries([
      { query: "Dinner and bowling in Astoria", quality_success: true },
      { query: "  Dinner   and bowling in Astoria ", quality_success: true },
    ]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].frequency).toBe(2);
  });

  it("prioritizes recurring quality failures before raw frequency", () => {
    const ranked = rankProductionQueries([
      { query: "common success", quality_success: true },
      { query: "common success", quality_success: true },
      { query: "important failure", quality_success: false },
    ]);
    expect(ranked[0].query).toBe("important failure");
  });

  it("requires a complete clean review before the canary can start", () => {
    const canaryReady = ({ persisted, total, failed, p95 }: any) =>
      persisted === total && failed === 0 && p95 <= 3000;
    expect(canaryReady({ persisted: 100, total: 100, failed: 0, p95: 1800 })).toBe(true);
    expect(canaryReady({ persisted: 99, total: 100, failed: 0, p95: 1800 })).toBe(false);
    expect(canaryReady({ persisted: 100, total: 100, failed: 1, p95: 1800 })).toBe(false);
    expect(canaryReady({ persisted: 100, total: 100, failed: 0, p95: 3200 })).toBe(false);
  });
});
