import { describe, expect, it } from "vitest";
import { buildLocationSearchProfile } from "../buildLocationSearchProfile";

const base = {
  id: "unsupported-store-1",
  name: "Perfume Americana Wholesale",
  restaurantName: null,
  activityName: null,
  locationType: "activity",
  activityType: "specialty",
  primaryCategory: "creative",
  categories: ["store"],
  cuisines: [],
  foodTerms: [],
  features: [],
  description: null,
  address: null,
  market: "NYC",
  city: "New York",
  neighborhood: null,
  borough: "Queens",
  county: null,
  state: "NY",
  latitude: 40.75,
  longitude: -73.9,
  active: false,
  searchable: false,
  hidden: true,
  isLowLevel: false,
} as const;

describe("unsupported non-outing review reasons", () => {
  it("keeps unsupported non-outings suppressed without double-flagging low confidence", () => {
    const profile = buildLocationSearchProfile(base);

    expect(profile.confidence).toBeLessThanOrEqual(0.2);
    expect(profile.exclusions).toContain("unsupported_non_outing");
    expect(profile.reviewReasons).toContain("unsupported_non_outing");
    expect(profile.reviewReasons).not.toContain("low_confidence");
    expect(profile.needsReview).toBe(true);
  });
});
