import { describe, expect, it } from "vitest";
import {
  displayBoolean,
  displayCoordinate,
  displayDebugJson,
  displayNumber,
  displayValue,
} from "../display-values";

describe("display value normalization", () => {
  it("renders supported scalar values and rejects objects", () => {
    expect(displayValue("ready")).toBe("ready");
    expect(displayValue(true)).toBe("Yes");
    expect(displayValue({ unsafe: true })).toBe("—");
  });

  it("only formats finite numbers and real booleans", () => {
    expect(displayNumber("12.5", { maximumFractionDigits: 1 })).toBe("12.5");
    expect(displayNumber(Number.NaN)).toBe("—");
    expect(displayBoolean(false)).toBe("No");
    expect(displayBoolean("false")).toBe("—");
  });

  it("formats coordinates without grouping", () => {
    expect(displayCoordinate("40.71281234")).toBe("40.712812");
    expect(displayCoordinate({ latitude: 40.7 })).toBe("—");
  });

  it("normalizes every debug leaf before serialization", () => {
    const value: Record<string, unknown> = { count: 2, enabled: true, nested: { missing: null } };
    value.circular = value;
    expect(displayDebugJson(value)).toContain('"count": "2"');
    expect(displayDebugJson(value)).toContain('"enabled": "Yes"');
    expect(displayDebugJson(value)).toContain('"circular": "[Circular]"');
  });
});
