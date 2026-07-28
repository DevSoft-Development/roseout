import { describe, expect, it } from "vitest";
import { formatSearchLabError } from "./searchLabErrors";

describe("Search Lab client errors", () => {
  it("displays the V2 safe error with code, request ID, and engine", () => {
    expect(
      formatSearchLabError({
        error: "Search Core V2 could not retrieve locations.",
        code: "SEARCH_V2_RETRIEVAL_FAILED",
        requestId: "request-123",
        searchCoreOverride: "v2",
      }),
    ).toBe(
      "Search Core V2 could not retrieve locations.\nCode: SEARCH_V2_RETRIEVAL_FAILED\nRequest ID: request-123\nEngine: v2",
    );
  });

  it("uses the generic fallback only without a usable safe error", () => {
    expect(formatSearchLabError(null)).toBe("Search test failed.");
    expect(formatSearchLabError({ error: "" })).toBe("Search test failed.");
  });
});
