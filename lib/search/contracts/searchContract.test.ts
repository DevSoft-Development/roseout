import { describe, expect, it } from "vitest";
import {
  deriveInventoryGapStatus,
  isGeographicLandmark,
  queryRequiresActivity,
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

  it("rejects restaurant-only normalization when a sequenced live-entertainment stop is requested", () => {
    const query = "Dinner and drinks in Long Island City, then somewhere close for live entertainment";

    expect(queryRequiresActivity(query)).toBe(true);
    expect(validateModeAgainstQuery({
      query,
      mode: "restaurant_only",
      needsRestaurant: true,
      needsActivity: false,
    }).valid).toBe(false);
  });

  it.each([
    "Dinner then something fun afterward",
    "Brunch followed by something active nearby",
    "Food and something interesting to do next",
    "Dinner then a live performance",
  ])("recognizes broad second-stop activity language: %s", (query) => {
    expect(queryRequiresActivity(query)).toBe(true);
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

  it("does not require activities when activity pairing is explicitly negated", () => {
    const query = "I only want a restaurant for a quiet anniversary dinner in Manhattan, with excellent food and an elegant atmosphere but no activity pairing";

    expect(queryRequiresActivity(query)).toBe(false);
    expect(validateModeAgainstQuery({
      query,
      mode: "restaurant_only",
      needsRestaurant: true,
      needsActivity: false,
    }).valid).toBe(true);
  });

  it.each([
    "Restaurant only in Manhattan",
    "Dinner without an activity",
    "Just a restaurant, no second stop",
    "Do not pair it with an activity",
  ])("recognizes restaurant-only language: %s", (query) => {
    expect(queryRequiresActivity(query)).toBe(false);
  });

  it("still requires restaurants for positive food requests", () => {
    expect(queryRequiresRestaurant("I want dinner and live jazz in Manhattan")).toBe(true);
  });

  it("still requires activities for positive mixed requests", () => {
    expect(queryRequiresActivity("I want dinner and live jazz in Manhattan")).toBe(true);
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
