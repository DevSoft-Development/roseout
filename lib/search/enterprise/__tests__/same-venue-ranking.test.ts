import { describe, expect, it } from "vitest";
import { normalizeIntent } from "../normalize-intent";
import { searchEnterpriseLane } from "../rpc";
import { rankRestaurantResults } from "../ranking";
import type { EnterpriseLocation } from "../types";

function record(
  input: Partial<EnterpriseLocation> & { name: string },
): EnterpriseLocation {
  return {
    id: input.name,
    location_type: "restaurant",
    primary_category: "restaurant",
    restaurant_name: input.name,
    rating: 4.4,
    review_count: 100,
    city: "New York",
    state: "NY",
    borough: "Manhattan",
    is_searchable: true,
    ...input,
  };
}

function rankedNames(query: string, records: EnterpriseLocation[]) {
  const intent = normalizeIntent(query);
  (intent as any).sameVenuePreferred = true;
  return rankRestaurantResults(
    records.map((item) => ({ ...item })),
    intent,
  ).map((item) => item.name);
}

describe("same-venue food intent ranking", () => {
  it.each([
    [
      "Mediterranean Dinner with hookah",
      record({
        name: "Sahra Mediterranean Cuisine",
        cuisine: "Mediterranean",
        search_document: "Mediterranean dinner restaurant",
      }),
      record({
        name: "Mira Mediterranean & Hookah Lounge",
        cuisine: "Mediterranean",
        search_document: "Mediterranean hookah lounge dinner shisha cocktails",
      }),
      "Mira Mediterranean & Hookah Lounge",
    ],
    [
      "Italian dinner with live music",
      record({
        name: "Bella Italian Kitchen",
        cuisine: "Italian",
        search_document: "Italian dinner restaurant",
      }),
      record({
        name: "Bella Italian Supper Club",
        cuisine: "Italian",
        search_document: "Italian dinner live music jazz cocktails",
      }),
      "Bella Italian Supper Club",
    ],
    [
      "seafood restaurant with rooftop views",
      record({
        name: "Harbor Seafood",
        cuisine: "Seafood",
        search_document: "seafood restaurant dinner",
      }),
      record({
        name: "Harbor Rooftop Seafood",
        cuisine: "Seafood",
        search_document: "seafood restaurant rooftop skyline views cocktails",
      }),
      "Harbor Rooftop Seafood",
    ],
    [
      "coffee shop with outdoor seating",
      record({
        name: "Daily Grind Coffee",
        search_document: "coffee cafe pastries",
      }),
      record({
        name: "Garden Coffee Cafe",
        search_document: "coffee cafe outdoor seating patio garden pastries",
      }),
      "Garden Coffee Cafe",
    ],
    [
      "brunch with bottomless mimosas",
      record({
        name: "Sunday Brunch House",
        search_document: "brunch breakfast pancakes",
      }),
      record({
        name: "Sunday Social Brunch",
        search_document: "brunch bottomless mimosas cocktails group brunch",
      }),
      "Sunday Social Brunch",
    ],
    [
      "pizza with arcade games",
      record({
        name: "Queens Pizza",
        search_document: "pizza Italian slices",
      }),
      record({
        name: "Arcade Pizza Bar",
        search_document: "pizza arcade games drinks bar",
      }),
      "Arcade Pizza Bar",
    ],
    [
      "hookah lounge with food",
      record({
        name: "Cozy Hookah Lounge",
        search_document: "hookah shisha lounge",
      }),
      record({
        name: "Mira Mediterranean & Hookah Lounge",
        search_document: "hookah shisha lounge Mediterranean food dinner",
      }),
      "Mira Mediterranean & Hookah Lounge",
    ],
  ])(
    "ranks combined same-venue match first for %s",
    (query, a, b, expected) => {
      expect(rankedNames(query, [a, b])[0]).toBe(expected);
    },
  );
});

describe("same-venue RPC term preservation", () => {
  it("preserves explicit primary and secondary terms before the RPC cap", async () => {
    const intent = normalizeIntent("Mediterranean Dinner with hookah");
    (intent as any).sameVenuePreferred = true;
    const calls: any[] = [];
    const supabase = {
      rpc: async (_name: string, params: any) => {
        calls.push(params);
        return { data: [], error: null };
      },
    } as any;
    const debug: any = { rpcCalls: [], errors: [] };

    await searchEnterpriseLane(supabase, intent, "restaurant", debug);

    const terms = calls[0].p_search_terms;
    expect(terms).toContain("mediterranean");
    expect(terms).toContain("hookah");
    expect(terms).not.toEqual(["middle eastern"]);
    expect(debug.sameVenueBalancedTermsPreserved).toBe(true);
  });
});

describe("food + hookah same-location ranking regressions", () => {
  it("ranks Mira above a generic Mediterranean lounge for Mediterranean dinner and hookah", () => {
    expect(
      rankedNames("Mediterranean dinner and hookah", [
        record({
          name: "Generic Mediterranean Lounge",
          cuisine: "Mediterranean",
          search_document: "mediterranean dinner lounge restaurant",
        }),
        record({
          name: "Mira Mediterranean & Hookah Lounge",
          cuisine: "Mediterranean",
          search_document: "mediterranean dinner hookah shisha lounge restaurant",
        }),
      ])[0],
    ).toBe("Mira Mediterranean & Hookah Lounge");
  });
});
