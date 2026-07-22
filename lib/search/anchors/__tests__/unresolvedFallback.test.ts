import { describe, expect, it } from "vitest";
import { buildUnresolvedAnchorFallbackQuery } from "../unresolvedFallback";

describe("buildUnresolvedAnchorFallbackQuery", () => {
  it("falls back to a semantic mixed query for an unknown restaurant anchor", () => {
    expect(
      buildUnresolvedAnchorFallbackQuery({
        rawAnchorText: "gaming center",
        requestedDomain: "restaurant",
      }),
    ).toBe("dinner and gaming center");
  });

  it("preserves an anchored qualifier", () => {
    expect(
      buildUnresolvedAnchorFallbackQuery({
        rawAnchorText: "gaming center",
        requestedDomain: "restaurant",
        qualifier: "seafood",
      }),
    ).toBe("seafood and gaming center");
  });

  it("uses an activity fallback when activities were requested", () => {
    expect(
      buildUnresolvedAnchorFallbackQuery({
        rawAnchorText: "unknown landmark",
        requestedDomain: "activity",
      }),
    ).toBe("something fun and unknown landmark");
  });
});
