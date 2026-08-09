import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildLocationSearchProfile } from "../buildLocationSearchProfile";

const source = (overrides: Record<string, unknown>) => ({
  id: "00000000-0000-4000-8000-000000000001",
  name: "Example",
  restaurantName: null,
  activityName: null,
  locationType: null,
  activityType: null,
  primaryCategory: null,
  categories: [],
  cuisines: [],
  foodTerms: [],
  features: [],
  description: null,
  address: null,
  market: null,
  city: null,
  neighborhood: null,
  borough: null,
  county: null,
  state: null,
  latitude: null,
  longitude: null,
  active: true,
  searchable: true,
  hidden: false,
  isLowLevel: false,
  ...overrides,
} as any);

describe("canonical profile domain correctness", () => {
  it("gives restaurant identity precedence and maps cuisine/category evidence", () => {
    const profile = buildLocationSearchProfile(source({
      name: "Thai Garden",
      restaurantName: "Thai Garden",
      locationType: "restaurant",
      primaryCategory: "thai",
      cuisines: ["thai"],
    }));

    expect(profile.primaryDomain).toBe("restaurant");
    expect(profile.restaurantCategories).toContain("restaurant");
    expect(profile.restaurantCategories).toContain("thai");
    expect(profile.cuisines).toContain("thai");
  });

  it("keeps generic alcohol and bar amenities out of nightlife for restaurants using canonical feature ids", () => {
    const profile = buildLocationSearchProfile(source({
      name: "Neighborhood Bistro",
      restaurantName: "Neighborhood Bistro",
      locationType: "restaurant",
      primaryCategory: "french",
      categories: ["serves alcohol"],
      features: ["bar", "cocktails"],
    }));

    expect(profile.primaryDomain).toBe("restaurant");
    expect(profile.supportedDomains).not.toContain("nightlife");
    expect(profile.nightlifeCategories).toEqual([]);
    expect(profile.features).toContain("cocktails");
    expect(profile.features).not.toContain("serves_alcohol");
    expect(profile.reviewReasons).not.toContain("unknown_taxonomy_id:serves_alcohol");
  });

  it("treats machine-form structured tags as authoritative canonical evidence", () => {
    const profile = buildLocationSearchProfile(source({
      name: "Martin Lawrence Galleries",
      activityName: "Martin Lawrence Galleries",
      locationType: "activity",
      activityType: "cultural",
      primaryCategory: "cultural",
      categories: ["art_gallery"],
    }));

    expect(profile.activityCategories).toContain("gallery");
    expect(profile.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: "gallery", strength: "authoritative" }),
    ]));
    expect(profile.confidence).toBeGreaterThanOrEqual(0.55);
    expect(profile.reviewReasons).not.toContain("low_confidence");
  });

  it("treats explicit speakeasy tags as authoritative nightlife evidence", () => {
    const profile = buildLocationSearchProfile(source({
      name: "The Hidden Door",
      activityName: "The Hidden Door",
      locationType: "activity",
      activityType: "nightlife",
      primaryCategory: "nightlife",
      categories: ["speakeasy"],
    }));

    expect(profile.primaryDomain).toBe("nightlife");
    expect(profile.nightlifeCategories).toContain("speakeasy");
    expect(profile.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: "speakeasy", strength: "authoritative" }),
    ]));
    expect(profile.confidence).toBeGreaterThanOrEqual(0.55);
    expect(profile.reviewReasons).not.toContain("low_confidence");
  });

  it("allows explicit bar-oriented restaurant identities to retain nightlife support", () => {
    const profile = buildLocationSearchProfile(source({
      name: "Harbor Sports Bar",
      restaurantName: "Harbor Sports Bar",
      locationType: "restaurant",
      primaryCategory: "sports_bar",
      categories: ["sports_bar"],
    }));

    expect(profile.primaryDomain).toBe("restaurant");
    expect(profile.supportedDomains).toContain("nightlife");
    expect(profile.nightlifeCategories).toContain("bar");
  });

  it.each([
    ["La Bestia Billiard", "games", "billiards"],
    ["K1 Speed Mount Kisco", "games", "go_karting"],
    ["Laser Spot NYC", "games", "laser_tag"],
    ["FUTURE Virtual Reality", "activity", "virtual_reality"],
    ["24 DIY Studio", "creative", "craft_workshop"],
    ["Garden City Swimming Pool", "outdoor", "swimming"],
    ["Classic Harbor Line", "creative", "boat_tour"],
    ["Hall des Lumières", "cultural", "immersive_exhibit"],
    ["Catch Air Queens", "birthday", "indoor_playground"],
  ])("maps %s to %s", (name, category, expected) => {
    const profile = buildLocationSearchProfile(source({
      name,
      activityName: name,
      locationType: "activity",
      activityType: category,
      primaryCategory: category,
    }));
    expect(profile.activityCategories).toContain(expected);
    expect(profile.canonicalTerms.length).toBeGreaterThan(0);
  });

  it("marks retail and non-public records unsupported rather than usable activities", () => {
    const profile = buildLocationSearchProfile(source({
      name: "CB I Hate Perfume - Not Open to the Public",
      activityName: "CB I Hate Perfume - Not Open to the Public",
      locationType: "activity",
      activityType: "creative",
      primaryCategory: "creative",
    }));

    expect(profile.exclusions).toContain("unsupported_non_outing");
    expect(profile.reviewReasons).toContain("unsupported_non_outing");
    expect(profile.needsReview).toBe(true);
    expect(profile.activityCategories).toEqual([]);
  });

  it("targets only contaminated restaurant and termless activity profiles", () => {
    const migration = readFileSync("supabase/migrations/20260730103000_rebuild_domain_contaminated_profiles.sql", "utf8");
    expect(migration).toContain("cardinality(p.restaurant_categories)");
    expect(migration).toContain("cardinality(p.nightlife_categories)");
    expect(migration).toContain("cardinality(p.canonical_terms)");
    expect(migration).not.toContain("all_eligible");
  });

  it("strict evaluator uses served slots and primary domain, never supported_domains", () => {
    const route = readFileSync("app/api/admin/search-quality/replay/route.ts", "utf8");
    expect(route).toContain("primaryDomainOf");
    expect(route).toContain("slotMismatches");
    expect(route).not.toContain("supported_domains");
  });
});
