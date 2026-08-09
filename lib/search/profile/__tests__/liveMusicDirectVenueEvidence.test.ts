import { describe, expect, it } from "vitest";
import { buildLocationSearchProfile } from "../buildLocationSearchProfile";

function source(categories: string[]) {
  return {
    id: "00000000-0000-4000-8000-000000000135",
    name: "Direct Music Venue",
    restaurantName: null,
    activityName: "Direct Music Venue",
    locationType: "activity",
    activityType: "activity",
    primaryCategory: "activity",
    categories,
    cuisines: [],
    foodTerms: [],
    features: [],
    description: null,
    address: "123 Main St",
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
  } as any;
}

describe("direct live-music venue evidence", () => {
  it.each(["live_music_venue", "concert_hall"])(
    "promotes structured %s classification to authoritative live_music evidence",
    (category) => {
      const profile = buildLocationSearchProfile(source([category]));

      expect(profile.activityCategories).toContain("live_music");
      expect(profile.evidence).toEqual(expect.arrayContaining([
        expect.objectContaining({ value: "live_music", strength: "authoritative" }),
      ]));
      expect(profile.reviewReasons).not.toContain("supporting_only_live_music");
      expect(profile.confidence).toBeGreaterThanOrEqual(0.55);
    },
  );

  it("keeps generic concert text from becoming authoritative without a structured venue type", () => {
    const profile = buildLocationSearchProfile({
      ...source([]),
      description: "Occasional concert performances are hosted here.",
    });

    expect(profile.activityCategories).toContain("live_music");
    expect(profile.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: "live_music", strength: "supporting" }),
    ]));
    expect(profile.reviewReasons).toContain("supporting_only_live_music");
  });
});
