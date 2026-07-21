import { describe, expect, it } from "vitest";

import {
  extractNamedLocationAnchor,
  isEligibleAnchoredCandidate,
} from "../anchoredNearby";

describe("anchored nearby search", () => {
  it("treats dinner near Gaming Center as a named restaurant anchor query", () => {
    expect(extractNamedLocationAnchor("dinner near gaming center")).toMatchObject({
      rawName: "gaming center",
      normalizedName: "gaming center",
      requestedDomain: "restaurant",
      relationship: "near",
      maxDistanceMiles: 1.5,
    });
  });

  it("accepts canonically classified restaurants without legacy restaurant fields", () => {
    expect(
      isEligibleAnchoredCandidate(
        {
          id: "restaurant-1",
          name: "Dinner Place",
          canonical_search_type: "restaurant",
          is_searchable: true,
          is_hidden: false,
          active: true,
        } as any,
        "restaurant",
      ),
    ).toBe(true);
  });

  it("rejects activity records from an anchored restaurant result set", () => {
    expect(
      isEligibleAnchoredCandidate(
        {
          id: "activity-1",
          name: "Gaming Center",
          canonical_search_type: "activity",
          is_searchable: true,
          is_hidden: false,
          active: true,
        } as any,
        "restaurant",
      ),
    ).toBe(false);
  });
});
