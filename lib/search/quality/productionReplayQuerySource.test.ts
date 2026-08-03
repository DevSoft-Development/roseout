import { describe, expect, it } from "vitest";

function replayQuery(row: Record<string, unknown>) {
  return String(row.query ?? row.normalized_query ?? row.raw_query ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

describe("production replay query source", () => {
  it("prefers the canonical query column", () => {
    expect(replayQuery({
      query: "Dinner and bowling in Astoria",
      normalized_query: "normalized fallback",
      raw_query: "raw fallback",
    })).toBe("Dinner and bowling in Astoria");
  });

  it("supports normalized production logs", () => {
    expect(replayQuery({
      query: null,
      normalized_query: "  Dinner   near Gaming City  ",
      raw_query: "raw fallback",
    })).toBe("Dinner near Gaming City");
  });

  it("supports legacy raw-query logs", () => {
    expect(replayQuery({
      query: null,
      normalized_query: null,
      raw_query: "Rooftop dinner in Queens",
    })).toBe("Rooftop dinner in Queens");
  });
});
