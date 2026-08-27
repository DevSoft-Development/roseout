import { describe, expect, it } from "vitest";
import { detectVenueRelationship } from "../planner/languageUnderstanding";

describe("hookah relationship precision", () => {
  it("keeps explicit possession wording as a same-venue requirement", () => {
    expect(detectVenueRelationship("restaurant that has hookah in Forest Hills").type).toBe(
      "same_venue_required",
    );
  });

  it("keeps hookah restaurant wording as a same-venue requirement", () => {
    expect(detectVenueRelationship("hookah restaurant in Forest Hills").type).toBe(
      "same_venue_required",
    );
  });
});
