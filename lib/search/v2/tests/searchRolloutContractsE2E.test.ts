import { describe, expect, it } from "vitest";
import { searchV2 } from "../index";
import { buildSearchPlan } from "../planner/buildSearchPlan";
import { buildRetrievalRequests } from "../retrieval/buildRetrievalRequests";
import { buildProfileRpcParams } from "../retrieval/retrieveProfileLocations";

function profileLocation(domain: "restaurant" | "activity", id: string) {
  return {
    id,
    name: domain === "restaurant" ? "Dinner Venue" : "After Dinner Venue",
    location_type: domain,
    active: true,
    is_searchable: true,
    is_hidden: false,
    is_low_level: false,
    latitude: domain === "restaurant" ? 40.75 : 40.751,
    longitude: domain === "restaurant" ? -73.98 : -73.981,
    rating: 4.6,
    review_count: 250,
  };
}

function supabaseForProfiles() {
  const calls: Array<{ name: string; params: Record<string, unknown> }> = [];
  return {
    calls,
    client: {
      rpc: async (name: string, params: Record<string, unknown>) => {
        calls.push({ name, params });
        if (name === "enterprise_search_profile_locations") {
          const domain = params.p_domain as "restaurant" | "activity";
          return { data: [profileLocation(domain, `${domain}-${calls.length}`)], error: null };
        }
        return { data: null, error: null };
      },
    },
  };
}

describe("search rollout contracts end to end", () => {
  it("recognizes previously missing geography and never emits a composite exact market", async () => {
    for (const [query, neighborhood, market] of [
      ["Dinner and a movie in Forest Hills", "Forest Hills", "NYC"],
      ["Family-friendly dinner and activity in Bayside", "Bayside", "NYC"],
      ["Romantic date night in Soho with dinner and cocktails", "Soho", "NYC"],
      ["Dinner and mini golf on Long Island", null, "LONG_ISLAND"],
    ] as const) {
      const plan = await buildSearchPlan({ input: { query } });
      expect(plan.geo.neighborhood).toBe(neighborhood);
      expect(plan.geo.market).toBe(market);
      for (const request of buildRetrievalRequests(plan)) {
        expect(buildProfileRpcParams(request).p_market).not.toBe("NYC_LONG_ISLAND");
      }
    }

    const broad = await buildSearchPlan({ input: { query: "Something fun tonight" } });
    expect(broad.geo.market).toBeNull();
    expect(broad.geo.latitude).toBe(40.758);
    expect(broad.geo.longitude).toBe(-73.9855);
    expect(broad.geo.radiusMiles).toBe(45);
  });

  it("produces a complete canonical pair for meal plus cocktails", async () => {
    const { client, calls } = supabaseForProfiles();
    const response = await searchV2({
      query: "Girls night dinner with cocktails in Williamsburg",
      supabase: client as never,
      rolloutOverride: { mode: "primary", canaryPercent: 100, strictNoFallback: true },
    });

    expect(response.searchPlan.restaurant.required).toBe(true);
    expect(response.searchPlan.activity.required).toBe(true);
    expect(response.searchPlan.activity.categories).toContain("lounge");
    expect(response.pairs.length).toBeGreaterThan(0);
    expect(response.restaurants.length).toBeGreaterThan(0);
    expect(response.activities.length).toBeGreaterThan(0);
    expect(response.retrieval.legacyFallbackUsed).toBe(false);
    expect(calls.filter((call) => call.name === "enterprise_search_profile_locations").map((call) => call.params.p_domain)).toEqual(expect.arrayContaining(["restaurant", "activity"]));
  });

  it("routes wings to restaurants and expands established profile vocabulary", async () => {
    const plan = await buildSearchPlan({ input: { query: "Bar with wings NYC" } });
    expect(plan.restaurant.required).toBe(true);
    expect(plan.activity.required).toBe(false);
    const request = buildRetrievalRequests(plan).find((item) => item.desiredRole === "restaurant");
    expect(request).toBeDefined();
    const params = buildProfileRpcParams(request!);
    expect(params.p_categories).toEqual(expect.arrayContaining(["wings", "chicken", "fried chicken", "sports bar", "bar food"]));
  });

  it("keeps canonical evidence through final scoring when raw rows omit requested terms", async () => {
    const { client } = supabaseForProfiles();
    const response = await searchV2({
      query: "Steak dinner and rooftop drinks in Midtown",
      supabase: client as never,
      rolloutOverride: { mode: "primary", canaryPercent: 100, strictNoFallback: true },
    });

    expect(response.pairs.length).toBeGreaterThan(0);
    expect(response.pairs[0]?.matchReasons.join(" ")).toMatch(/canonical profile evidence preserved in scoring/i);
    expect(response.retrieval.legacyFallbackUsed).toBe(false);
  });
});