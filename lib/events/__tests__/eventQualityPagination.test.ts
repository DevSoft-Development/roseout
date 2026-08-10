import { describe, expect, it } from "vitest";
import { qualitySweepRanges } from "../ingestion";

describe("Event quality reconciliation pagination", () => {
  it("covers inventories larger than the old 500-row sweep", () => {
    const ranges = qualitySweepRanges({ pageSize: 200, hardLimit: 2_000 });

    expect(ranges.slice(0, 4)).toEqual([
      { from: 0, to: 199 },
      { from: 200, to: 399 },
      { from: 400, to: 599 },
      { from: 600, to: 799 },
    ]);

    expect(ranges.some(({ from, to }) => from <= 633 && to >= 633)).toBe(true);
  });

  it("keeps the reconciliation sweep hard-bounded", () => {
    const ranges = qualitySweepRanges({ pageSize: 200, hardLimit: 2_000 });

    expect(ranges).toHaveLength(10);
    expect(ranges[0]).toEqual({ from: 0, to: 199 });
    expect(ranges.at(-1)).toEqual({ from: 1_800, to: 1_999 });
  });

  it("never creates a range beyond a non-even hard limit", () => {
    expect(qualitySweepRanges({ pageSize: 200, hardLimit: 634 }).at(-1)).toEqual({
      from: 600,
      to: 633,
    });
  });
});
