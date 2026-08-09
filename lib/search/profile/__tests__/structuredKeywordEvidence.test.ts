import { describe, expect, it } from "vitest";
import { buildLocationSearchProfile } from "../buildLocationSearchProfile";

const source = (features: string[]) => ({
  id: "00000000-0000-4000-8000-000000000099",
  name: "Creative Venue",
  restaurantName: null,
  activityName: "Creative Venue",
  locationType: "activity",
  activityType: "creative",
  primaryCategory: "creative",
  categories: ["activity", "creative"],
  cuisines: [],
  foodTerms: [],
  features,
  description: null,
  address: null,
  market: null,
  city: "New York",
  neighborhood: null,
  borough: null,
  county: null,
  state: "NY",
  latitude: null,
  longitude: null,
  active: true,
  searchable: true,
  hidden: false,
  isLowLevel: false,
} as any);

describe("structured outing keyword evidence", () => {
  it.each([
    ["art class in manhattan", "art_class"],
    ["cooking class in brooklyn", "cooking_class"],
    ["dance class in bronx", "dance_class"],
    ["paint and sip in queens", "paint_and_sip"],
    ["diy workshop in staten island", "craft_workshop"],
  ])("promotes %s to authoritative %s evidence", (keyword, expected) => {
    const profile = buildLocationSearchProfile(source([keyword]));

    expect(profile.activityCategories).toContain(expected);
    expect(profile.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: expected, strength: "authoritative" }),
    ]));
    expect(profile.confidence).toBeGreaterThanOrEqual(0.55);
    expect(profile.reviewReasons).not.toContain("low_confidence");
  });

  it("promotes exact features when taxonomy explicitly allows feature evidence", () => {
    const profile = buildLocationSearchProfile(source(["live music"]));

    expect(profile.activityCategories).toContain("live_music");
    expect(profile.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: "live_music", strength: "authoritative" }),
    ]));
    expect(profile.confidence).toBeGreaterThanOrEqual(0.55);
    expect(profile.reviewReasons).not.toContain("supporting_only_live_music");
    expect(profile.reviewReasons).not.toContain("low_confidence");
  });

  it("does not promote a generic one-word keyword with an anchor", () => {
    const profile = buildLocationSearchProfile(source(["concert in manhattan"]));
    expect(profile.evidence).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ value: "live_music", strength: "authoritative" }),
    ]));
  });
});
