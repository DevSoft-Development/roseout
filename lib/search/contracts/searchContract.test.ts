import { describe, expect, it } from "vitest";
import {
  deriveInventoryGapStatus,
  isGeographicLandmark,
  queryRequiresRestaurant,
  validateModeAgainstQuery,
} from "./searchContract";

describe("system-wide search contracts", () => {
  it("allows verified same-venue results for mixed requests", () => {
    const result = validateModeAgainstQuery({
      query: "Romantic rooftop dinner with live music in Manhattan",
      mode: "same_venue",
      needsRestaurant: true,
      needsActivity: true,
      sameVenueEvidence: true,
    });
    expect(result.valid).toBe(true);
  });

  it("rejects same-venue mode without dual-role evidence", () => {
    const result = validateModeAgainstQuery({
      query: "Italian restaurant and a comedy show near Times Square",
      mode: "same_venue",
      needsRestaurant: true,
      needsActivity: true,
      sameVenueEvidence: false,
    });
    expect(result.valid).toBe(false);
  });

  it("rejects a single-domain parse when query requires dinner and activity", () => {
    const result = validateModeAgainstQuery({
      query: "Date night near Barclays Center with dinner and an activity",
      mode: "activity_only",
      needsRestaurant: false,
      needsActivity: true,
    });
    expect(result.valid).toBe(false);
  });

  it("does not require restaurants when food language is explicitly negated", () => {
    const query = "I’m not looking for food at all; give me interesting evening activities in Manhattan that work for a date and are open tonight";

    expect(queryRequiresRestaurant(query)).toBe(false);
    expect(validateModeAgainstQuery({
      query,
      mode: "activity_only",
      needsRestaurant: false,
      needsActivity: true,
    }).valid).toBe(true);
  });

  it("still requires restaurants for positive food requests", () => {
    expect(queryRequiresRestaurant("I want dinner and live jazz in Manhattan")).toBe(true);
  });

  it("treats major landmarks as geography", () => {
    expect(isGeographicLandmark("Central Park")).toBe(true);
    expect(isGeographicLandmark("Barclays Center")).toBe(true);
    expect(isGeographicLandmark("The Garden Room")).toBe(false);
  });

  it("distinguishes inventory gaps from retrieval rejection", () => {
    expect(deriveInventoryGapStatus({ required: true, eligibleCount: 0, rawCandidateCount: 0, failureReason: "insufficient_domain_candidates" })).toBe("probable_inventory_gap");
    expect(deriveInventoryGapStatus({ required: true, eligibleCount: 0, rawCandidateCount: 8, rejectedCount: 8, failureReason: "insufficient_domain_candidates" })).toBe("retrieval_or_eligibility_failure");
  });
});
