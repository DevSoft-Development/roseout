import { describe, expect, it, vi } from "vitest";

vi.mock("../../../supabaseAdmin", () => ({
  supabaseAdmin: { rpc: vi.fn() },
}));

vi.mock("@/lib/search/performance", () => ({
  getSearchSpeedStatus: () => "fast",
  logSearchPerformance: vi.fn(),
}));

import { runEnterpriseSearch } from "../index";
import type { EnterpriseLocation } from "../types";

const photo = "https://example.test/restaurant.jpg";

type RpcCall = { name: string; params: Record<string, any> };

function restaurant(input: Partial<EnterpriseLocation> & { id: string; name: string }): EnterpriseLocation {
  const { id, name, ...rest } = input;
  const row: EnterpriseLocation = {
    id,
    name,
    restaurant_name: name,
    location_type: "restaurant",
    city: "New York",
    borough: "Queens",
    county: "Queens County",
    state: "NY",
    latitude: 40.7282,
    longitude: -73.7949,
    rating: 4.6,
    review_count: 500,
    image_url: photo,
    main_image: photo,
    has_photos: true,
    primary_category: "full service restaurant",
    category: "restaurant",
    google_types: ["restaurant", "food", "point_of_interest"],
    cuisine: "American",
    tags: [],
    description: "Queens restaurant option.",
    ...rest,
  };

  row.search_document = [
    row.name,
    row.restaurant_name,
    row.location_type,
    row.primary_category,
    row.category,
    row.cuisine,
    row.tags,
    row.description,
    row.city,
    row.borough,
    row.county,
    row.state,
    row.google_types,
  ]
    .flat()
    .filter(Boolean)
    .join(" ");

  return row;
}

function makeSupabase(fallbackRows: EnterpriseLocation[] = []) {
  const calls: RpcCall[] = [];
  return {
    calls,
    supabase: {
      rpc: async (name: string, params: Record<string, any>) => {
        calls.push({ name, params });

        if (
          name === "enterprise_search_locations" &&
          params.p_domain === "restaurant" &&
          params.p_neighborhood == null &&
          params.p_borough === "Queens"
        ) {
          return { data: fallbackRows, error: null };
        }

        return { data: [], error: null };
      },
    },
  };
}

function boroughRestaurantLocationCalls(calls: RpcCall[]) {
  return calls.filter(
    (call) =>
      call.name === "enterprise_search_locations" &&
      call.params.p_domain === "restaurant" &&
      call.params.p_neighborhood == null &&
      call.params.p_borough === "Queens",
  );
}

describe("runEnterpriseSearch neighborhood restaurant fallback", () => {
  it("falls back from strict Astoria chicken lunch to nearby Queens restaurant cards", async () => {
    const { supabase } = makeSupabase([
      restaurant({ id: "chicken-1", name: "Queens Hot Chicken", cuisine: "Fried chicken", tags: ["lunch", "chicken", "wings", "hot chicken"] }),
      restaurant({ id: "chicken-2", name: "Queens Wings", cuisine: "Chicken wings", tags: ["lunch", "wings", "fried chicken"] }),
    ]);

    const result = await runEnterpriseSearch("chicken lunch in Astoria", {
      supabase,
      useLLM: false,
      betaDebug: true,
    });

    expect(result.restaurants.length).toBeGreaterThan(0);
    expect(result.renderMode).toBe("restaurant_cards");
    expect(result.reply).toContain("nearby Queens options");
    expect(result.debug?.neighborhoodRecoveryUsed).toBe(true);
    expect(result.debug?.neighborhoodRecoveryFrom).toBe("Astoria");
    expect(result.debug?.neighborhoodRecoveryTo).toBe("Queens");
    expect(result.debug?.neighborhoodRecoveryResultCount).toBe(2);
    expect((result.debug?.originalGeo as any)?.neighborhood).toBe("Astoria");
  });

  it("uses generic sushi terms for strict Astoria fallback without chicken expansion", async () => {
    const { supabase } = makeSupabase([
      restaurant({ id: "sushi-1", name: "Queens Sushi Bar", cuisine: "Sushi", tags: ["sushi"] }),
      restaurant({ id: "sushi-2", name: "Sushi Queens", cuisine: "Japanese sushi", tags: ["sushi", "omakase"] }),
    ]);

    const result = await runEnterpriseSearch("sushi in Astoria", {
      supabase,
      useLLM: false,
      betaDebug: true,
    });

    expect(result.restaurants.length).toBeGreaterThan(0);
    expect(result.debug?.neighborhoodRecoveryUsed).toBe(true);
    expect(result.debug?.neighborhoodRecoveryTerms).toContain("sushi");
    expect(result.debug?.neighborhoodRecoveryTerms).not.toContain("chicken");
    expect(result.debug?.neighborhoodRecoveryTerms).not.toContain("wings");
  });

  it("preserves seafood dinner terms for strict Astoria fallback", async () => {
    const { supabase } = makeSupabase([
      restaurant({ id: "seafood-1", name: "Queens Seafood", cuisine: "Seafood", tags: ["seafood", "dinner"] }),
      restaurant({ id: "seafood-2", name: "Astoria Seafood Annex", cuisine: "Seafood", tags: ["seafood dinner"] }),
    ]);

    const result = await runEnterpriseSearch("seafood dinner in Astoria", {
      supabase,
      useLLM: false,
      betaDebug: true,
    });

    expect(result.restaurants.length).toBeGreaterThan(0);
    expect(result.debug?.neighborhoodRecoveryTerms).toContain("seafood");
    expect(result.debug?.neighborhoodRecoveryTerms).toContain("dinner");
  });

  it("does not fallback when the user asks for Astoria only", async () => {
    const { supabase, calls } = makeSupabase([
      restaurant({ id: "chicken-1", name: "Queens Hot Chicken", cuisine: "Fried chicken", tags: ["lunch", "chicken"] }),
    ]);

    const result = await runEnterpriseSearch("chicken lunch in Astoria only", {
      supabase,
      useLLM: false,
      betaDebug: true,
    });

    expect(boroughRestaurantLocationCalls(calls)).toHaveLength(0);
    expect(result.restaurants).toHaveLength(0);
    expect(result.renderMode).toBe("empty");
    expect(result.debug?.neighborhoodRecoveryUsed).toBe(false);
  });

  it("does not run neighborhood fallback for borough-level Queens searches", async () => {
    const { supabase, calls } = makeSupabase([
      restaurant({ id: "wings-1", name: "Queens Wings", cuisine: "Chicken wings", tags: ["wings", "lunch"] }),
    ]);

    const result = await runEnterpriseSearch("wings lunch in Queens", {
      supabase,
      useLLM: false,
      betaDebug: true,
    });

    expect(boroughRestaurantLocationCalls(calls)).toHaveLength(1);
    expect(result.debug?.neighborhoodRecoveryUsed).toBe(false);
  });

  it("does not use restaurant-only neighborhood fallback for mixed-pairing searches", async () => {
    const { supabase, calls } = makeSupabase([
      restaurant({ id: "mixed-1", name: "Queens Restaurant", cuisine: "American", tags: ["restaurant"] }),
    ]);

    const result = await runEnterpriseSearch("restaurant with activity in Astoria", {
      supabase,
      useLLM: false,
      betaDebug: true,
    });

    expect(boroughRestaurantLocationCalls(calls)).toHaveLength(0);
    expect(result.debug?.neighborhoodRecoveryUsed).toBe(false);
  });
});
