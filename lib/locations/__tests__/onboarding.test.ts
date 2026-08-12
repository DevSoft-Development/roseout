import { describe, expect, it } from "vitest";
import {
  cleanSearchTerm,
  rankOnboardingLocation,
  toOnboardingLocation,
} from "../onboarding";

describe("business location onboarding search", () => {
  it("sanitizes PostgREST search control characters and caps input", () => {
    expect(cleanSearchTerm("  Haven%,_  Rooftop  ")).toBe("Haven Rooftop");
    expect(cleanSearchTerm("a".repeat(100))).toHaveLength(80);
  });

  it("returns only the public onboarding shape and detects claimed listings", () => {
    expect(
      toOnboardingLocation({
        id: "loc-1",
        restaurant_name: "Haven Rooftop",
        location_type: "restaurant",
        city: "New York",
        owner_user_id: "private-owner-id",
        internal_notes: "never expose this",
      }),
    ).toEqual({
      id: "loc-1",
      name: "Haven Rooftop",
      locationType: "restaurant",
      primaryCategory: null,
      address: null,
      city: "New York",
      state: null,
      zipCode: null,
      phone: null,
      website: null,
      alreadyClaimed: true,
    });
  });

  it("ranks exact and prefix name matches above address-only matches", () => {
    const exact = toOnboardingLocation({ id: "1", name: "Haven", location_type: "activity" });
    const prefix = toOnboardingLocation({ id: "2", name: "Haven Rooftop", location_type: "restaurant" });
    const address = toOnboardingLocation({ id: "3", name: "Elsewhere", address: "1 Haven Way", location_type: "activity" });

    expect(rankOnboardingLocation(exact, "haven")).toBeGreaterThan(
      rankOnboardingLocation(prefix, "haven"),
    );
    expect(rankOnboardingLocation(prefix, "haven")).toBeGreaterThan(
      rankOnboardingLocation(address, "haven"),
    );
  });
});
