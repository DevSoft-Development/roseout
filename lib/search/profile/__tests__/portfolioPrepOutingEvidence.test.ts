import { describe, expect, it } from "vitest";
import { buildLocationSearchProfile } from "../buildLocationSearchProfile";

const base = {
  id: "portfolio-art-1",
  name: "Test Art School",
  restaurantName: null,
  activityName: null,
  locationType: "activity",
  activityType: "creative",
  primaryCategory: "creative",
  categories: ["art"],
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
  active: true,
  searchable: true,
  hidden: false,
  isLowLevel: false,
} as const;

describe("portfolio prep outing evidence", () => {
  it.each([
    "Ashcan Art | High School Portfolio Prep, Adult Art Classes Flushing",
    "Ashcan Studio of Art | Portfolio Prep NYC, Adult Art Classes NYC",
  ])("keeps explicit adult art classes eligible: %s", (name) => {
    const profile = buildLocationSearchProfile({ ...base, name });

    expect(profile.exclusions).not.toContain("unsupported_non_outing");
    expect(profile.reviewReasons).not.toContain("unsupported_non_outing");
  });

  it.each([
    "Oogie Art - College Art Portfolio Prep School NYC",
    "PI Art | Portfolio Prep, Art Competition, F1 Visa Art School NYC",
  ])("keeps portfolio-prep-only schools excluded: %s", (name) => {
    const profile = buildLocationSearchProfile({ ...base, name });

    expect(profile.exclusions).toContain("unsupported_non_outing");
    expect(profile.reviewReasons).toContain("unsupported_non_outing");
  });
});
