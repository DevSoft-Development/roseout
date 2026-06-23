import { describe, expect, it, vi } from "vitest";

vi.mock("../../../supabaseAdmin", () => ({
  supabaseAdmin: { rpc: vi.fn() },
}));

vi.mock("@/lib/search/performance", () => ({
  getSearchSpeedStatus: () => "fast",
  logSearchPerformance: vi.fn(),
}));

vi.mock("../searchHealthLogger", () => ({
  logSearchHealthEvent: vi.fn(),
}));

vi.mock("@/lib/ml/locationMlScores", () => ({
  getLocationMlScoreMap: async () => new Map(),
}));

vi.mock("@/lib/ml/intentScoreLoaders", () => ({
  getLocationIntentScoreMap: async () => new Map(),
  getPairScoreMap: async () => new Map(),
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

function activity(input: Partial<EnterpriseLocation> & { id: string; name: string }): EnterpriseLocation {
  const { id, name, ...rest } = input;
  const row: EnterpriseLocation = {
    id,
    name,
    activity_name: name,
    location_type: "activity",
    city: "New York",
    borough: "Queens",
    county: "Queens County",
    state: "NY",
    latitude: 40.729,
    longitude: -73.795,
    rating: 4.6,
    review_count: 500,
    image_url: photo,
    main_image: photo,
    has_photos: true,
    primary_category: "hookah lounge",
    category: "lounge",
    activity_type: "hookah_lounge",
    google_types: ["bar", "point_of_interest"],
    tags: ["hookah", "shisha", "lounge"],
    description: "Hookah lounge with shisha.",
    ...rest,
  };

  row.search_document = [
    row.name,
    row.activity_name,
    row.location_type,
    row.primary_category,
    row.category,
    row.activity_type,
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

describe("runEnterpriseSearch single-venue with behavior", () => {
  it("does not create pairs or activity copy for bar with wings", async () => {
    const calls: RpcCall[] = [];
    const supabase = {
      rpc: async (name: string, params: Record<string, any>) => {
        calls.push({ name, params });
        if (params.p_domain !== "restaurant") return { data: [], error: null };
        return {
          data: [
            restaurant({
              id: "bar-wings",
              name: "Queens Sports Bar Wings",
              borough: "Queens",
              county: "Queens County",
              primary_category: "sports bar pub restaurant",
              cuisine: "American bar food chicken wings",
              tags: ["bar", "sports bar", "pub", "wings", "chicken wings"],
              description: "Sports-bar-style pub serving wings and bar food.",
            }),
          ],
          error: null,
        };
      },
    };

    const result = await runEnterpriseSearch("bar with wings nyc", {
      supabase,
      useLLM: false,
      betaDebug: true,
    });

    expect(result.debug?.singleVenueWithIntentUsed).toBe(true);
    expect(result.debug?.pair_count).toBe(0);
    expect(result.pairs).toHaveLength(0);
    expect(result.activities).toHaveLength(0);
    expect(result.renderMode).toBe("restaurant_cards");
    expect(result.reply).not.toContain("restaurant and activity options");
    expect(result.reply).toMatch(/bars|sports-bar-style spots/i);
    expect(result.reply).toMatch(/wings/i);
    expect(calls.some((call) => call.params.p_domain === "activity")).toBe(false);
  });
});

describe("runEnterpriseSearch restaurant cuisine + feature recovery", () => {
  function makeRecoverySupabase(handler: (name: string, params: Record<string, any>, index: number) => EnterpriseLocation[]) {
    const calls: RpcCall[] = [];
    return {
      calls,
      supabase: {
        rpc: async (name: string, params: Record<string, any>) => {
          calls.push({ name, params });
          return { data: handler(name, params, calls.length - 1), error: null };
        },
      },
    };
  }

  it("recovers restaurant cards with food-first terms when combined food + feature matching is empty", async () => {
    const seafoodRows = [
      restaurant({ id: "seafood-1", name: "Harbor Seafood", cuisine: "Seafood", tags: ["seafood", "fish", "restaurant"] }),
      restaurant({ id: "seafood-2", name: "Lobster House", cuisine: "Seafood", tags: ["lobster", "crab", "restaurant"] }),
    ];
    const { supabase } = makeRecoverySupabase((name, params) => {
      if (name !== "enterprise_search_recovery") return [];
      const terms = params.p_search_terms as string[];
      const foodFirst = terms.includes("seafood") && !terms.includes("rooftop");
      return foodFirst ? seafoodRows : [];
    });

    const result = await runEnterpriseSearch("Seafood rooftop restaurant", {
      supabase,
      useLLM: false,
      betaDebug: true,
    });

    expect(result.restaurants).toHaveLength(2);
    expect(result.activities).toHaveLength(0);
    expect(result.renderMode).toBe("restaurant_cards");
    expect(result.debug?.restaurantRecoveryUsed).toBe(true);
    expect(result.debug?.restaurantRecoverySucceeded).toBe(true);
    expect(result.debug?.restaurantRecoveryReason).toBe("restaurant_food_first_recovery");
    expect((result.debug?.restaurantRecoveryTermsTried as string[][] | undefined)?.length).toBeGreaterThan(1);
    expect(result.debug?.restaurantRecoveryAttemptResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: "restaurant_food_first_recovery",
          filteredCount: 2,
          relaxedFeature: true,
        }),
      ]),
    );
  });

  it("recovers restaurant cards with feature-first terms when food-first recovery is empty", async () => {
    const rooftopRows = [
      restaurant({
        id: "rooftop-1",
        name: "Sky Terrace Dining",
        cuisine: "American",
        tags: ["rooftop", "terrace", "skyline views", "restaurant"],
        description: "Restaurant with rooftop terrace and skyline views.",
      }),
    ];
    const { supabase } = makeRecoverySupabase((name, params) => {
      if (name !== "enterprise_search_recovery") return [];
      const terms = params.p_search_terms as string[];
      const featureFirst = terms.includes("rooftop") && !terms.includes("seafood");
      return featureFirst ? rooftopRows : [];
    });

    const result = await runEnterpriseSearch("Seafood rooftop restaurant", {
      supabase,
      useLLM: false,
      betaDebug: true,
    });

    expect(result.restaurants).toHaveLength(1);
    expect(result.activities).toHaveLength(0);
    expect(result.renderMode).toBe("restaurant_cards");
    expect(result.debug?.restaurantRecoveryUsed).toBe(true);
    expect(result.debug?.restaurantRecoverySucceeded).toBe(true);
    expect(result.debug?.restaurantRecoveryReason).toBe("restaurant_feature_first_recovery");
    expect(result.debug?.restaurantRecoveryAttemptResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: "restaurant_feature_first_recovery",
          filteredCount: 1,
          relaxedFood: true,
        }),
      ]),
    );
  });


  it("recovers restaurant cards for rooftop vibes with rooftop feature-only recovery", async () => {
    const rooftopRows = Array.from({ length: 12 }, (_, index) =>
      restaurant({
        id: `rooftop-vibes-${index + 1}`,
        name: `Rooftop Vibes ${index + 1}`,
        cuisine: "American",
        tags: ["rooftop", "terrace", "skyline views", "restaurant", "dinner"],
        description: "Restaurant with rooftop terrace and skyline views.",
      }),
    );
    const { supabase } = makeRecoverySupabase((name, params) => {
      if (name !== "enterprise_search_recovery") return [];
      const terms = params.p_search_terms as string[];
      const rooftopFeatureRecovery =
        terms.includes("restaurant") &&
        terms.includes("dinner") &&
        terms.includes("rooftop restaurant") &&
        terms.includes("skyline views") &&
        terms.includes("outdoor dining");
      return rooftopFeatureRecovery ? rooftopRows : [];
    });

    const result = await runEnterpriseSearch("rooftop vibes", {
      supabase,
      useLLM: false,
      betaDebug: true,
    });

    expect(result.restaurants).toHaveLength(12);
    expect(result.activities).toHaveLength(0);
    expect(result.renderMode).toBe("restaurant_cards");
    expect(result.debug?.restaurantRecoveryUsed).toBe(true);
    expect(result.debug?.restaurantRecoverySucceeded).toBe(true);
    expect(result.debug?.restaurantRecoveryReason).toBe(
      "restaurant_rooftop_feature_only_recovery",
    );
    expect(result.debug?.restaurantRecoveryAttemptResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: "restaurant_rooftop_feature_only_recovery",
          filteredCount: 12,
        }),
      ]),
    );
  });
});

describe("runEnterpriseSearch mixed outing generic meal restaurant lane", () => {
  const dinnerRows = [
    restaurant({
      id: "dinner-1",
      name: "Queens Dinner Spot",
      tags: ["dinner", "date night", "restaurant"],
      description: "Full-service dinner spot near hookah lounges.",
    }),
  ];
  const hookahRows = [
    activity({
      id: "hookah-1",
      name: "Queens Hookah Lounge",
      latitude: 40.7295,
      longitude: -73.7952,
    }),
  ];

  it("expands generic dinner terms before restaurant RPC for dinner then hookah", async () => {
    const calls: RpcCall[] = [];
    const supabase = {
      rpc: async (name: string, params: Record<string, any>) => {
        calls.push({ name, params });
        if (name !== "enterprise_search_locations") return { data: [], error: null };
        if (params.p_domain === "activity") return { data: hookahRows, error: null };
        if (
          params.p_domain === "restaurant" &&
          params.p_search_terms.includes("dinner spot") &&
          params.p_search_terms.includes("date night")
        ) {
          return { data: dinnerRows, error: null };
        }
        return { data: [], error: null };
      },
    };

    const result = await runEnterpriseSearch("dinner then hookah", {
      supabase,
      useLLM: false,
      betaDebug: true,
    });

    expect(result.debug?.searchType).toBe("mixed_outing");
    expect(result.debug?.needsRestaurant).toBe(true);
    expect(result.debug?.needsActivity).toBe(true);
    expect(result.debug?.restaurantTermsExpandedForGenericMeal).toBe(true);
    expect(result.debug?.restaurantTermsBeforeExpansion).toContain("dinner");
    expect(result.debug?.restaurantTermsAfterExpansion).toEqual(
      expect.arrayContaining([
        "restaurant",
        "dining",
        "dinner spot",
        "date night",
        "food",
      ]),
    );
    expect(result.restaurants.length).toBeGreaterThan(0);
    expect(result.activities.length).toBeGreaterThan(0);
    expect(result.pairs.length).toBeGreaterThan(0);
    expect(result.primaryResultType).toBe("pairs");
    expect(result.debug?.noPairsReason).toBeNull();
    expect(calls.some((call) => call.params.p_search_terms?.includes("dinner spot"))).toBe(true);
  });

  it("uses non-fatal mixed-outing restaurant recovery when first dinner lane is empty", async () => {
    const calls: RpcCall[] = [];
    const supabase = {
      rpc: async (name: string, params: Record<string, any>) => {
        calls.push({ name, params });
        if (name !== "enterprise_search_locations") return { data: [], error: null };
        if (params.p_domain === "activity") return { data: hookahRows, error: null };
        if (params.p_domain === "restaurant" && params.p_limit === 80) {
          return { data: dinnerRows, error: null };
        }
        return { data: [], error: null };
      },
    };

    const result = await runEnterpriseSearch("dinner then hookah", {
      supabase,
      useLLM: false,
      betaDebug: true,
    });

    expect(result.reply).toBeTruthy();
    expect(result.debug?.mixedOutingRestaurantRecoveryAttempted).toBe(true);
    expect(result.debug?.mixedOutingRestaurantRecoveryUsed).toBe(true);
    expect(result.debug?.mixedOutingRestaurantRecoveryCount).toBeGreaterThan(0);
    expect(result.restaurants.length).toBeGreaterThan(0);
    expect(result.activities.length).toBeGreaterThan(0);
    expect(result.pairs.length).toBeGreaterThan(0);
    expect(result.debug?.noPairsReason).not.toBe("no_restaurant_results_for_required_pair");
  });
});


describe("runEnterpriseSearch broad occasion outings", () => {
  it("runs both lanes for date night in nyc on the automatic create flow", async () => {
    const calls: RpcCall[] = [];
    const supabase = {
      rpc: async (name: string, params: Record<string, any>) => {
        calls.push({ name, params });
        return { data: [], error: null };
      },
    };

    const result = await runEnterpriseSearch("date night in nyc", {
      supabase,
      useLLM: true,
      betaDebug: true,
      body: { selectedSearchLane: "auto" },
    });

    const normalizedIntent = result.debug?.normalizedIntent as any;

    expect(result.debug?.intentParserSource).toBe("fast_path");
    expect(result.debug?.fastPathReason).toBe("broad_occasion_mixed_outing");
    expect(result.debug?.selectedSearchLane).toBe("auto");
    expect(normalizedIntent?.searchType).toBe("mixed_outing");
    expect(normalizedIntent?.needsRestaurant).toBe(true);
    expect(normalizedIntent?.needsActivity).toBe(true);
    expect(normalizedIntent?.wantsPairing).toBe(true);
    expect(calls.some((call) => call.params.p_domain === "restaurant")).toBe(true);
    expect(calls.some((call) => call.params.p_domain === "activity")).toBe(true);
  });
});
