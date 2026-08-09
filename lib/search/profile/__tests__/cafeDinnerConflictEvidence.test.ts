import { describe, expect, it } from "vitest";
import { buildLocationSearchProfile } from "../buildLocationSearchProfile";

const source = (overrides: Record<string, unknown>) => ({
  id: "00000000-0000-4000-8000-000000000123",
  name: "Example Restaurant",
  restaurantName: "Example Restaurant",
  activityName: null,
  locationType: "restaurant",
  activityType: null,
  primaryCategory: "restaurant",
  categories: ["restaurant"],
  cuisines: [],
  foodTerms: [],
  features: [],
  description: null,
  address: "1 Main St",
  market: "NYC CORE",
  city: "New York",
  neighborhood: null,
  borough: "Manhattan",
  county: null,
  state: "NY",
  latitude: 40.75,
  longitude: -73.98,
  active: true,
  searchable: true,
  hidden: false,
  isLowLevel: false,
  ...overrides,
} as any);

describe("cafe dinner conflict evidence", () => {
  it("does not flag a restaurant when cafe and dinner exist only as supporting keywords", () => {
    const profile = buildLocationSearchProfile(source({
      features: ["cafe", "dinner"],
    }));

    expect(profile.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: "cafe", strength: "supporting" }),
      expect.objectContaining({ value: "dinner", strength: "supporting" }),
    ]));
    expect(profile.reviewReasons).not.toContain("cafe_dinner_conflict");
  });

  it("keeps the conflict when cafe identity is authoritative but dinner is only supporting", () => {
    const profile = buildLocationSearchProfile(source({
      primaryCategory: "cafe",
      categories: ["restaurant", "cafe"],
      features: ["dinner"],
    }));

    expect(profile.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: "cafe", strength: "authoritative" }),
      expect.objectContaining({ value: "dinner", strength: "supporting" }),
    ]));
    expect(profile.reviewReasons).toContain("cafe_dinner_conflict");
  });
});
