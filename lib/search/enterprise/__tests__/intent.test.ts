import { describe, expect, it } from "vitest";
import {
  activityRpcTerms,
  activitySearchTerms,
  deterministicIntentFromQuery,
  normalizeIntent,
  restaurantSearchTerms,
} from "../normalize-intent";
import { resolveSearchMarket } from "../markets";
import { hasNearMeIntent, stripNearMeIntent } from "../../near-me";
import {
  getEnterpriseIntentFastPathReason,
  parseEnterpriseIntent,
  parseEnterpriseIntentFastPath,
} from "../intent-parser";

describe("enterprise search intent", () => {
  it("strips near-me language before restaurant intent parsing", () => {
    const cleanedDinner = stripNearMeIntent("Dinner near me");
    const dinnerIntent = normalizeIntent(cleanedDinner);

    expect(hasNearMeIntent("Dinner near me")).toBe(true);
    expect(cleanedDinner).toBe("Dinner");
    expect(dinnerIntent.searchType).toBe("restaurant");
    expect(dinnerIntent.wantsPairing).toBe(false);

    const cleanedSeafood = stripNearMeIntent("seafood near me");
    const seafoodIntent = normalizeIntent(cleanedSeafood);
    expect(cleanedSeafood).toBe("seafood");
    expect(restaurantSearchTerms(seafoodIntent)).not.toContain("near me");
    expect(seafoodIntent.searchType).toBe("restaurant");
  });

  it("keeps date-night near-me queries as pair intent after location words are stripped", () => {
    const cleaned = stripNearMeIntent("date night near me");
    const intent = normalizeIntent(cleaned);

    expect(cleaned).toBe("date night");
    expect(intent.searchType).toBe("mixed_outing");
    expect(intent.wantsPairing).toBe(true);
  });

  for (const query of [
    "restaurant with activity walking distance",
    "dinner and activity nearby",
    "restaurant and things to do walking distance",
    "dinner with something to do after",
  ]) {
    it(`parses generic mixed outing without the LLM for ${query}`, () => {
      const intent = deterministicIntentFromQuery(query);
      expect(intent.searchType).toBe("mixed_outing");
      expect(intent.needsRestaurant).toBe(true);
      expect(intent.needsActivity).toBe(true);
      expect(intent.wantsPairing).toBe(true);
      expect(activitySearchTerms(intent).length).toBeGreaterThan(0);
    });
  }

  for (const { query, distanceMode } of [
    { query: "date night within walking distance", distanceMode: "walking" },
    { query: "date night close by", distanceMode: "nearby" },
    { query: "date night dinner and activity", distanceMode: "any" },
    { query: "date night dinner then drinks nearby", distanceMode: "nearby" },
  ] as const) {
    it(`fast-paths clear date-night mixed outing phrases for ${query}`, async () => {
      const parsed = await parseEnterpriseIntent(query, { useLLM: true });

      expect(parsed.intentParserSource).toBe("fast_path");
      expect(parsed.usedLlm).toBe(false);
      expect(parsed.fastPathMatched).toBe(true);
      expect(parsed.fastPathReason).toBe(
        "matched date-night mixed outing fast path",
      );
      expect(parsed.intent.searchType).toBe("mixed_outing");
      expect(parsed.intent.primaryDomain).toBe("mixed");
      expect(parsed.intent.needsRestaurant).toBe(true);
      expect(parsed.intent.needsActivity).toBe(true);
      expect(parsed.intent.wantsPairing).toBe(true);
      expect(parsed.intent.pairingPreference?.distanceMode).toBe(distanceMode);
      expect(parsed.intentParserSource).not.toBe("deterministic_fallback");
    });
  }

  it("fast-paths generic required activity searches without missing activity signal", async () => {
    const parsed = await parseEnterpriseIntent(
      "restaurant with activity walking distance",
      { useLLM: true },
    );
    expect([
      "fast_path",
      "fast_path_timeout_fallback",
      "fast_path_plus_llm",
    ]).toContain(parsed.intentParserSource);
    expect(parsed.fastPathMatched).toBe(true);
    expect(String(parsed.fastPathReason)).not.toBe("missing_activity_signal");
    expect(
      getEnterpriseIntentFastPathReason(
        "restaurant with activity walking distance",
      ),
    ).not.toBe("missing_activity_signal");
    expect(parsed.intent.searchType).toBe("mixed_outing");
    expect(activitySearchTerms(parsed.intent).length).toBeGreaterThan(0);
  });

  it("keeps generic walking activity searches pair-required with a 60-minute cap", () => {
    const intent = deterministicIntentFromQuery(
      "restaurant with activity walking distance",
    );
    expect(intent.searchType).toBe("mixed_outing");
    expect(intent.primaryDomain).toBe("mixed");
    expect(intent.pairingPreference?.requiresPairing).toBe(true);
    expect(intent.pairingPreference?.distanceMode).toBe("walking");
    expect(intent.pairingPreference?.maxPairWalkingMinutes).toBe(60);
    expect(activitySearchTerms(intent).length).toBeGreaterThan(0);
  });

  it("respects explicit generic walking minutes", () => {
    const intent = deterministicIntentFromQuery(
      "restaurant and activity 30 minute walk",
    );
    expect(intent.pairingPreference?.distanceMode).toBe("walking");
    expect(intent.pairingPreference?.maxPairWalkingMinutes).toBe(30);
  });

  it("broadens casual relaxed activity searches", () => {
    const intent = deterministicIntentFromQuery(
      "casual dinner and relaxed activity",
    );
    const terms = activitySearchTerms(intent);
    expect(intent.searchType).toBe("mixed_outing");
    for (const term of [
      "relaxed activity",
      "lounge",
      "arcade",
      "bowling",
      "mini golf",
      "gallery",
    ])
      expect(terms).toContain(term);
  });

  for (const query of [
    "steak dinner and rooftop drinks after",
    "steak dinner and rooftop drinks 30 minute walk apart",
  ]) {
    it(`fast-paths rooftop drinks as activity after steak dinner for ${query}`, async () => {
      const parsed = await parseEnterpriseIntent(query, { useLLM: true });
      const restaurantTerms = restaurantSearchTerms(parsed.intent);
      const activityTerms = [
        ...parsed.intent.activityIntent.activityTerms,
        ...parsed.intent.activityIntent.categoryTerms,
        ...parsed.intent.activityIntent.featureTerms,
      ];

      expect(parsed.intentParserSource).toBe("fast_path");
      expect(parsed.fastPathMatched).toBe(true);
      expect(parsed.intent.searchType).toBe("mixed_outing");
      expect(parsed.intent.primaryDomain).toBe("mixed");
      expect(parsed.intent.needsRestaurant).toBe(true);
      expect(parsed.intent.needsActivity).toBe(true);
      expect(parsed.intent.wantsPairing).toBe(true);
      expect(restaurantTerms).toEqual(expect.arrayContaining(["dinner", "steak"]));
      expect(activityTerms).toEqual(
        expect.arrayContaining([
          "rooftop drinks",
          "rooftop bar",
          "rooftop lounge",
          "skyline lounge",
          "terrace bar",
          "cocktails",
          "drinks",
        ]),
      );
      for (const rooftopRestaurantTerm of [
        "rooftop restaurant",
        "skyline",
        "skyline views",
        "terrace",
      ]) {
        expect(restaurantTerms).not.toContain(rooftopRestaurantTerm);
      }
    });
  }


  it("normalizes rooftop vibes in the restaurant lane with rooftop feature terms", () => {
    const intent = normalizeIntent("rooftop vibes", {
      searchType: "restaurant",
      primaryDomain: "restaurant",
      needsRestaurant: true,
      needsActivity: false,
    });

    expect(intent.needsRestaurant).toBe(true);
    expect(intent.needsActivity).toBe(false);
    expect(intent.restaurantIntent.featureTerms).toEqual(
      expect.arrayContaining(["rooftop", "rooftop restaurant"]),
    );
    expect(
      intent.restaurantIntent.featureTerms.some((term) =>
        ["skyline", "views"].includes(term),
      ),
    ).toBe(true);
    expect(restaurantSearchTerms(intent)).not.toContain("vibes");
  });

  it("keeps rooftop drinks after dinner on the activity side", () => {
    const intent = normalizeIntent("rooftop drinks after dinner");
    const restaurantTerms = restaurantSearchTerms(intent);
    const activityTerms = [
      ...intent.activityIntent.activityTerms,
      ...intent.activityIntent.categoryTerms,
      ...intent.activityIntent.featureTerms,
    ];

    expect(intent.needsRestaurant).toBe(true);
    expect(intent.needsActivity).toBe(true);
    expect(activityTerms).toEqual(expect.arrayContaining(["rooftop", "cocktails"]));
    expect(restaurantTerms).not.toContain("rooftop restaurant");
    expect(restaurantTerms).not.toContain("skyline views");
  });

  it("parses rooftop drinks after steak dinner as a mixed outing", () => {
    const intent = normalizeIntent("steak dinner and rooftop drinks after");
    expect(intent.searchType).toBe("mixed_outing");
    expect(intent.needsRestaurant).toBe(true);
    expect(intent.needsActivity).toBe(true);
    expect(intent.wantsPairing).toBe(true);
    expect([
      ...intent.restaurantIntent.foodTerms,
      ...intent.restaurantIntent.mealTerms,
    ]).toContain("steak");
    expect(intent.restaurantIntent.mealTerms).toContain("dinner");
    const activityTerms = [
      ...intent.activityIntent.activityTerms,
      ...intent.activityIntent.categoryTerms,
      ...intent.activityIntent.featureTerms,
    ];
    for (const term of [
      "rooftop bar",
      "rooftop lounge",
      "rooftop drinks",
      "cocktails",
      "lounge",
      "bar",
    ]) {
      expect(activityTerms).toContain(term);
    }
  });

  it("parses walking minutes", () => {
    const intent = normalizeIntent(
      "steak dinner and rooftop drinks 30 minute walk apart",
    );
    expect(intent.pairingPreference).toEqual({
      requiresPairing: true,
      distanceMode: "walking",
      maxPairDistanceMiles: 1.5,
      maxPairWalkingMinutes: 30,
      requireWalkablePair: true,
    });
  });

  it("parses strict walking and explicit Queens geo", () => {
    const intent = normalizeIntent(
      "steak dinner and rooftop drinks 1 minute walk apart in Queens",
    );
    expect(intent.pairingPreference?.distanceMode).toBe("walking");
    expect(intent.pairingPreference?.maxPairWalkingMinutes).toBe(1);
    expect(intent.pairingPreference?.maxPairDistanceMiles).toBe(0.1);
    expect(intent.pairingPreference?.requireWalkablePair).toBe(true);
    expect(intent.geo.borough).toBe("Queens");
    expect(resolveSearchMarket({ geo: intent.geo }).marketApplied).toBe(false);
  });
  it("cleans broad nightlife terms from sports-watch normalized intent", () => {
    const intent = normalizeIntent(
      "Best bar to watch the Knicks game in Harlem",
      {
        searchType: "activity",
        primaryDomain: "activity",
        needsRestaurant: false,
        needsActivity: true,
        wantsPairing: false,
        activityIntent: {
          activityTerms: [
            "nightlife",
            "lounge",
            "bar",
            "rooftop lounge",
            "club",
            "dance club",
            "dancing",
            "live dj",
            "speakeasy",
            "sports bar",
          ],
          categoryTerms: ["sports bar"],
          featureTerms: ["tv"],
          vibeTerms: [],
          negativeTerms: [],
          alternativeGroups: [],
        },
      } as any,
    );

    expect(intent.activityIntent.activityTerms).toContain("sports bar");
    expect(intent.activityIntent.activityTerms).toContain("sport lounge");
    expect(intent.activityIntent.activityTerms).toContain("watch party");
    expect(intent.activityIntent.activityTerms).not.toContain("nightlife");
    expect(intent.activityIntent.activityTerms).not.toContain("rooftop lounge");
    expect(intent.activityIntent.activityTerms).not.toContain("club");
    expect(intent.activityIntent.activityTerms).not.toContain("dance club");
    expect(intent.activityIntent.activityTerms).not.toContain("live dj");
    expect(intent.activityIntent.activityTerms).not.toContain("speakeasy");
  });

  it("removes broad nightlife terms from sports-watch activity rpc terms", () => {
    const intent = normalizeIntent(
      "Best bar to watch the Knicks game in Harlem",
      {
        searchType: "activity",
        primaryDomain: "activity",
        needsRestaurant: false,
        needsActivity: true,
        wantsPairing: false,
        activityIntent: {
          activityTerms: [
            "nightlife",
            "lounge",
            "bar",
            "rooftop lounge",
            "club",
            "dance club",
            "live dj",
            "speakeasy",
            "sports bar",
          ],
          categoryTerms: ["sports bar"],
          featureTerms: ["tv"],
          vibeTerms: [],
          negativeTerms: [],
          alternativeGroups: [],
        },
      } as any,
    );

    const rpcTerms = activityRpcTerms(intent);

    expect(rpcTerms.terms).toContain("sports bar");
    expect(rpcTerms.terms).toContain("sport lounge");
    expect(rpcTerms.terms).toContain("watch party");
    expect(rpcTerms.terms).not.toContain("nightlife");
    expect(rpcTerms.terms).not.toContain("rooftop lounge");
    expect(rpcTerms.terms).not.toContain("club");
    expect(rpcTerms.terms).not.toContain("dance club");
    expect(rpcTerms.terms).not.toContain("live dj");
    expect(rpcTerms.terms).not.toContain("speakeasy");
    expect(rpcTerms.removedForSportsWatchIntent).toEqual(
      expect.arrayContaining([
        "nightlife",
        "rooftop lounge",
        "club",
        "dance club",
        "live dj",
        "speakeasy",
      ]),
    );
  });
});

describe("hybrid intent parsing", () => {
  it("fast-path parses sports-watch activity searches without requiring a pairing connector", async () => {
    const { parseEnterpriseIntentFastPath } = await import("../intent-parser");
    const intent = parseEnterpriseIntentFastPath(
      "Best bar to watch the Knicks game in Harlem",
    );

    expect(intent).toBeTruthy();
    expect(intent?.searchType).toBe("activity");
    expect(intent?.primaryDomain).toBe("activity");
    expect(intent?.needsActivity).toBe(true);
    expect(intent?.needsRestaurant).toBe(false);
    expect(intent?.wantsPairing).toBe(false);
    expect(intent?.activityIntent?.categoryTerms).toContain("sports bar");
    expect(intent?.activityIntent?.featureTerms).toContain("tv");
    expect(intent?.activityIntent?.activityTerms?.join(" ")).toMatch(
      /sports bar|watch party|knicks game/i,
    );
  });

  it("reports sports-watch fast-path reason", () => {
    const reason = getEnterpriseIntentFastPathReason(
      "bar with TVs for NBA game",
    );

    expect(reason).toBe("matched sports-watch activity fast path");
  });

  it("keeps activity-only preIntent when LLM tries to over-expand it", async () => {
    const { mergeLlmIntentWithPreIntent } = await import("../normalize-intent");
    const merged = mergeLlmIntentWithPreIntent({
      rawQuery: "Best bar to watch the Knicks game in Harlem",
      preIntent: {
        rawQuery: "Best bar to watch the Knicks game in Harlem",
        searchType: "activity",
        primaryDomain: "activity",
        needsRestaurant: false,
        needsActivity: true,
        wantsPairing: false,
        activityIntent: {
          activityTerms: ["sports bar", "knicks game"],
          categoryTerms: ["sports bar"],
          featureTerms: ["tv"],
          vibeTerms: [],
          negativeTerms: [],
          alternativeGroups: [],
        },
      } as any,
      llmIntent: {
        rawQuery: "Best bar to watch the Knicks game in Harlem",
        searchType: "mixed_outing",
        primaryDomain: "mixed",
        needsRestaurant: true,
        needsActivity: true,
        wantsPairing: true,
        activityIntent: {
          activityTerms: ["rooftop lounge"],
          categoryTerms: [],
          featureTerms: [],
          vibeTerms: [],
          negativeTerms: [],
          alternativeGroups: [],
        },
      } as any,
    });

    expect((merged as any).searchType).toBe("activity");
    expect((merged as any).needsRestaurant).toBe(false);
    expect((merged as any).activityIntent.categoryTerms).toContain(
      "sports bar",
    );
    expect((merged as any).activityIntent.featureTerms).toContain("tv");
  });
});

describe("fast path expansion batch fixes", () => {
  it("cleans relaxed no-club activity terms and adds negative terms", () => {
    const intent = normalizeIntent("casual dinner relaxed activity no club", {
      searchType: "mixed_outing",
      primaryDomain: "mixed",
      needsRestaurant: true,
      needsActivity: true,
      wantsPairing: true,
      activityIntent: {
        activityTerms: [
          "nightlife",
          "rooftop lounge",
          "club",
          "dance club",
          "dancing",
          "live dj",
          "speakeasy",
          "arcade",
        ],
        categoryTerms: [],
        featureTerms: [],
        vibeTerms: [],
        negativeTerms: [],
        alternativeGroups: [],
      },
    } as any);

    for (const term of [
      "nightlife",
      "rooftop lounge",
      "club",
      "dance club",
      "dancing",
      "live dj",
      "speakeasy",
    ]) {
      expect(intent.activityIntent.activityTerms).not.toContain(term);
      expect(activityRpcTerms(intent).terms).not.toContain(term);
    }

    expect(intent.activityIntent.activityTerms).toContain("relaxed activity");
    expect(intent.activityIntent.negativeTerms).toEqual(
      expect.arrayContaining(["club", "dance club", "nightclub", "dj"]),
    );
    expect(activityRpcTerms(intent).removedForRelaxedIntent).toEqual(
      expect.arrayContaining(["nightlife", "rooftop lounge", "club"]),
    );
  });

  it("fast-paths relaxed mixed outings and skips LLM enhancement", async () => {
    const parsed = await parseEnterpriseIntent(
      "casual dinner relaxed activity no club",
      { useLLM: true },
    );

    expect(parsed.intentParserSource).toBe("fast_path");
    expect(parsed.usedLlm).toBe(false);
    expect(parsed.debug.llmEnhancementUsed).toBe(false);
    expect(parsed.debug.llm_ms).toBe(0);
    expect(parsed.fastPathReason).toBe("matched relaxed mixed outing fast path");
  });

  for (const query of [
    "rooftop drinks in Harlem",
    "cocktail bar in Queens",
    "comedy show in Manhattan",
    "karaoke in Harlem",
    "hookah lounge with music",
  ]) {
    it(`fast-paths activity-only obvious query: ${query}`, () => {
      expect(getEnterpriseIntentFastPathReason(query)).toBe(
        "matched activity-only fast path",
      );
    });
  }

  for (const query of [
    "best steakhouse in Manhattan",
    "brunch spot in Brooklyn",
    "sushi near me",
    "birthday dinner restaurant",
  ]) {
    it(`fast-paths restaurant-only obvious query: ${query}`, () => {
      expect(getEnterpriseIntentFastPathReason(query)).toBe(
        "matched restaurant-only fast path",
      );
    });
  }

  for (const query of [
    "pub to watch football in Manhattan",
    "bar with big screens in Harlem",
    "casual bar to watch basketball",
  ]) {
    it(`fast-paths sports-watch phrase: ${query}`, () => {
      expect(getEnterpriseIntentFastPathReason(query)).toBe(
        "matched sports-watch activity fast path",
      );
    });
  }

  it("keeps broad chicken lunch intent broad for restaurant-only searches", async () => {
    const parsed = await parseEnterpriseIntent("chicken lunch in Astoria", {
      useLLM: true,
    });

    expect(parsed.intentParserSource).toBe("fast_path");
    expect(parsed.fastPathReason).toBe("matched restaurant-only fast path");
    expect(parsed.intent.searchType).toBe("restaurant");
    expect(parsed.intent.needsRestaurant).toBe(true);
    expect(parsed.intent.needsActivity).toBe(false);
    expect(parsed.intent.wantsPairing).toBe(false);

    expect(parsed.intent.geo.raw).toBe("Astoria");
    expect(parsed.intent.geo.borough).toBe("Queens");
    expect(parsed.intent.geo.state).toBe("NY");

    const terms = restaurantSearchTerms(parsed.intent);

    expect(terms).toEqual(
      expect.arrayContaining([
        "lunch",
        "chicken",
        "fried chicken",
        "hot chicken",
        "wings",
      ]),
    );

    expect(terms).not.toEqual(["lunch", "fried chicken"]);
    expect(activitySearchTerms(parsed.intent)).toEqual([]);
  });

  it("recognizes chicken in Astoria as a restaurant-only fast path", async () => {
    const parsed = await parseEnterpriseIntent("chicken in Astoria", {
      useLLM: true,
    });

    expect(parsed.intentParserSource).toBe("fast_path");
    expect(parsed.fastPathReason).toBe("matched restaurant-only fast path");
    expect(parsed.intent.searchType).toBe("restaurant");
    expect(parsed.intent.needsRestaurant).toBe(true);
    expect(parsed.intent.needsActivity).toBe(false);

    const terms = restaurantSearchTerms(parsed.intent);

    expect(terms).toEqual(
      expect.arrayContaining([
        "chicken",
        "fried chicken",
        "hot chicken",
        "wings",
      ]),
    );
  });

  it("keeps phrase RPC terms without adding noisy single-word tokens", () => {
    const intent = normalizeIntent("bar with tvs watch party game day mini golf live music", {
      searchType: "activity",
      primaryDomain: "activity",
      needsRestaurant: false,
      needsActivity: true,
      wantsPairing: false,
      activityIntent: {
        activityTerms: [
          "bar with tvs",
          "watch party",
          "game day",
          "mini golf",
          "live music",
        ],
        categoryTerms: [],
        featureTerms: [],
        vibeTerms: [],
        negativeTerms: [],
        alternativeGroups: [],
      },
    } as any);
    const terms = activityRpcTerms(intent).terms;

    for (const phrase of [
      "bar with tvs",
      "watch party",
      "game day",
      "mini golf",
      "live music",
    ]) {
      expect(terms).toContain(phrase);
    }
    for (const noisy of ["with", "watch", "party", "day", "mini", "live"]) {
      expect(terms).not.toContain(noisy);
    }
  });
});

describe("merged cleanup and national sports-watch fixes", () => {
  for (const [query, reason] of [
    ["dinner and paint and sip after", "matched explicit mixed outing fast path"],
    ["seafood restaurant and live jazz nearby", "matched explicit mixed outing fast path"],
    ["cocktail bar for date night no loud music", "matched activity-only venue fast path"],
    ["speakeasy with romantic vibes", "matched activity-only venue fast path"],
    ["paint and sip for date night", "matched activity-only fast path"],
  ] as const) {
    it(`uses expected fast path order for ${query}`, () => {
      expect(getEnterpriseIntentFastPathReason(query)).toBe(reason);
    });
  }

  for (const query of ["casual brunch spot in Queens", "cozy restaurant for first date"]) {
    it(`zeroes activity terms for restaurant-only query: ${query}`, () => {
      const intent = normalizeIntent(query);
      expect(intent.searchType).toBe("restaurant");
      expect(intent.needsActivity).toBe(false);
      expect(activitySearchTerms(intent)).toEqual([]);
    });
  }

  it("zeroes restaurant terms for activity-only venue vibe queries", () => {
    const intent = normalizeIntent("cocktail bar for date night no loud music");
    expect(intent.searchType).toBe("activity");
    expect(intent.needsRestaurant).toBe(false);
    expect(intent.restaurantIntent.mealTerms).toEqual([]);
  });

  it("removes standalone junk tokens while preserving useful phrases", () => {
    const intent = normalizeIntent("paint and sip, mini golf, watch party, game day date night", {
      searchType: "activity",
      primaryDomain: "activity",
      needsRestaurant: false,
      needsActivity: true,
      wantsPairing: false,
      activityIntent: {
        activityTerms: ["paint and sip", "paint", "and", "sip", "mini golf", "mini", "golf", "watch party", "watch", "party", "game day", "game", "day", "date night", "date", "night"],
        categoryTerms: [],
        featureTerms: [],
        vibeTerms: [],
        negativeTerms: [],
        alternativeGroups: [],
      },
    } as any);
    const terms = activitySearchTerms(intent);
    for (const phrase of ["paint and sip", "mini golf", "watch party", "game day"]) expect(terms).toContain(phrase);
    for (const junk of ["paint", "and", "sip", "mini", "golf", "watch", "party", "game", "day", "date", "night"]) expect(terms).not.toContain(junk);
  });

  for (const query of [
    "bar to watch the Lakers game in Brooklyn",
    "Lakers game near me",
    "sports bar showing Warriors game",
    "where can I watch Celtics in Manhattan",
    "bar with TVs for Cowboys game",
    "Eagles watch party in Queens",
    "Dodgers game at a bar",
    "NBA bar in Queens",
    "where can I watch basketball in Manhattan",
    "football bar not too crowded",
    "sports bar with wings and TVs",
  ]) {
    it(`detects national sports-watch search: ${query}`, () => {
      const intent = parseEnterpriseIntentFastPath(query);
      expect(getEnterpriseIntentFastPathReason(query)).toBe("matched sports-watch activity fast path");
      expect(intent?.searchType).toBe("activity");
      expect(intent?.needsRestaurant).toBe(false);
      expect(intent?.needsActivity).toBe(true);
      const terms = [
        ...(intent?.activityIntent?.activityTerms ?? []),
        ...(intent?.activityIntent?.categoryTerms ?? []),
        ...(intent?.activityIntent?.featureTerms ?? []),
      ];
      for (const blocked of ["skating", "golf", "gym", "watch", "party", "game", "day", "live", "screen", "night", "viewing"]) expect(terms).not.toContain(blocked);
    });
  }

  it("adds team-specific sports-watch terms for non-local teams", () => {
    const intent = parseEnterpriseIntentFastPath("sports bar showing the Cowboys game near me");
    expect(intent?.activityIntent?.activityTerms).toContain("cowboys game");
  });

  it("keeps mini golf expansion separate from sports-watch and active recreation", () => {
    const intent = normalizeIntent("mini golf or arcade near me");
    const terms = activitySearchTerms(intent);
    expect(terms).toEqual(expect.arrayContaining(["mini golf", "arcade", "games"]));
    for (const blocked of ["sports bar", "watch party", "gym", "skating", "climbing"]) expect(terms).not.toContain(blocked);
  });
});

describe("final cleanup architecture regressions", () => {
  it("finalCleanTermList removes token pollution but preserves phrases", async () => {
    const { finalCleanTermList, ACTIVITY_ALLOWED_SINGLE_WORDS } = await import("../normalize-intent");
    const terms = finalCleanTermList(
      [
        "paint and sip", "paint", "and", "sip",
        "mini golf", "mini", "golf",
        "watch party", "watch", "party",
        "game day", "game", "day",
        "raw bar", "raw", "bar",
        "date night", "date", "night",
      ],
      ACTIVITY_ALLOWED_SINGLE_WORDS,
    );

    for (const phrase of ["paint and sip", "mini golf", "watch party", "game day", "raw bar", "date night"]) {
      expect(terms).toContain(phrase);
    }
    for (const junk of ["paint", "and", "sip", "mini", "golf", "watch", "party", "game", "day", "raw", "date", "night"]) {
      expect(terms).not.toContain(junk);
    }
    expect(terms).toContain("bar");
  });

  it("cleans sports-watch final activity terms for non-local teams", () => {
    const intent = normalizeIntent("Lakers watch party near Brooklyn");
    const terms = activityRpcTerms(intent).terms;

    for (const expected of ["lakers game", "watch party", "sports bar", "bar with tvs"]) {
      expect(terms).toContain(expected);
    }
    for (const junk of ["lakers", "with", "watch", "party", "game", "day", "night", "live", "viewing", "and", "grill", "sport", "sports"]) {
      expect(terms).not.toContain(junk);
    }
  });

  for (const query of [
    "dinner and mini golf after in Queens",
    "sushi dinner then karaoke in Brooklyn",
    "cocktail bar for date night no loud music",
    "comedy club for date night near Times Square",
  ]) {
    it(`skips LLM for high-confidence fast path: ${query}`, async () => {
      const parsed = await parseEnterpriseIntent(query, { useLLM: true });
      expect(parsed.intentParserSource).toBe("fast_path");
      expect(parsed.usedLlm).toBe(false);
      expect(parsed.debug.llm_ms).toBe(0);
      expect(parsed.debug.fallback_llm_ms).toBeNull();
    });
  }

  it("does not add relaxed activity alternatives to quiet bar venue searches", () => {
    const intent = normalizeIntent("quiet bar with cocktails in Manhattan");
    const terms = activitySearchTerms(intent);
    expect(terms).toEqual(expect.arrayContaining(["cocktail bar", "cocktails", "bar", "lounge", "quiet"]));
    for (const overexpanded of ["board games", "arcade", "mini golf", "bowling", "museum", "paint and sip"]) {
      expect(terms).not.toContain(overexpanded);
    }
  });

  it("keeps rooftop no-club venue terms without broad relaxed alternatives", () => {
    const intent = normalizeIntent("rooftop drinks with views but not a club");
    const terms = activitySearchTerms(intent);
    expect(terms).toEqual(expect.arrayContaining(["rooftop bar", "rooftop drinks", "rooftop cocktails", "terrace bar", "terrace lounge", "skyline bar", "skyline lounge", "views", "outdoor bar", "cocktails", "drinks", "bar"]));
    expect(intent.activityIntent.negativeTerms).toEqual(expect.arrayContaining(["club", "nightclub", "dancing", "dj", "live dj"]));
    for (const overexpanded of ["board games", "mini golf", "museum", "paint and sip"]) {
      expect(terms).not.toContain(overexpanded);
    }
  });

  it("fast-paths speakeasy romantic vibes as activity-only", async () => {
    const parsed = await parseEnterpriseIntent("speakeasy for romantic vibes in Brooklyn", { useLLM: true });
    expect(parsed.intentParserSource).toBe("fast_path");
    expect(parsed.fastPathReason).toBe("matched activity-only venue fast path");
    expect(parsed.intent.searchType).toBe("activity");
    expect(parsed.intent.needsRestaurant).toBe(false);
    expect(activitySearchTerms(parsed.intent)).toEqual(expect.arrayContaining(["speakeasy", "cocktail bar", "cocktails", "bar", "lounge", "romantic"]));
    expect(restaurantSearchTerms(parsed.intent)).toEqual([]);
  });

  it("fast-paths rooftop restaurant with skyline views as restaurant-only", async () => {
    const parsed = await parseEnterpriseIntent("rooftop restaurant with skyline views", { useLLM: true });
    expect(parsed.intentParserSource).toBe("fast_path");
    expect(parsed.fastPathReason).toBe("matched restaurant-only fast path");
    expect(parsed.intent.searchType).toBe("restaurant");
    expect(parsed.intent.needsActivity).toBe(false);
    expect(parsed.debug.llm_ms).toBe(0);
    expect(restaurantSearchTerms(parsed.intent)).toEqual(expect.arrayContaining(["restaurant", "rooftop restaurant", "rooftop", "skyline", "skyline views", "scenic views", "terrace", "outdoor dining"]));
    expect(activitySearchTerms(parsed.intent)).toEqual([]);
  });

  describe("rooftop restaurant dinner intent", () => {
    for (const query of [
      "rooftop restaurant in queens",
      "rooftop dining queens",
      "restaurant with rooftop views in queens",
      "outdoor rooftop dinner queens",
      "dinner with skyline views queens",
    ]) {
      it(`fast-paths ${query} as restaurant-only rooftop dining`, async () => {
        const parsed = await parseEnterpriseIntent(query, { useLLM: true });

        expect(parsed.intentParserSource).toBe("fast_path");
        expect(parsed.fastPathReason).toBe("matched restaurant-only fast path");
        expect(parsed.intent.searchType).toBe("restaurant");
        expect(parsed.intent.needsRestaurant).toBe(true);
        expect(parsed.intent.needsActivity).toBe(false);
        expect(parsed.intent.wantsPairing).toBe(false);
        expect(parsed.debug.llm_ms).toBe(0);
        expect(restaurantSearchTerms(parsed.intent)).toEqual(expect.arrayContaining([
          "restaurant",
          "rooftop",
          "rooftop restaurant",
          "rooftop dining",
          "terrace",
          "outdoor dining",
          "skyline views",
          "views",
          "roof deck",
        ]));
        expect(activitySearchTerms(parsed.intent)).toEqual([]);
      });
    }

    it("fast-paths rooftop dinner in Queens as restaurant-only without waiting on the LLM", async () => {
      const parsed = await parseEnterpriseIntent("rooftop dinner in queens", { useLLM: true });
      const terms = restaurantSearchTerms(parsed.intent);

      expect(parsed.intentParserSource).toBe("fast_path");
      expect(parsed.fastPathReason).toBe("matched restaurant-only fast path");
      expect(parsed.intent.searchType).toBe("restaurant");
      expect(parsed.intent.primaryDomain).toBe("restaurant");
      expect(parsed.intent.needsRestaurant).toBe(true);
      expect(parsed.intent.needsActivity).toBe(false);
      expect(parsed.intent.wantsPairing).toBe(false);
      expect(parsed.debug.llm_ms).toBe(0);
      expect(parsed.intent.geo.borough).toBe("Queens");
      expect(terms).toEqual(expect.arrayContaining([
        "restaurant",
        "dinner",
        "rooftop",
        "rooftop restaurant",
        "rooftop dining",
        "terrace",
        "outdoor dining",
        "skyline",
        "skyline views",
        "scenic views",
      ]));
      expect(activitySearchTerms(parsed.intent)).toEqual([]);
    });

    it("normalizes dinner on a rooftop in Queens as restaurant features, not food or activity", () => {
      const intent = normalizeIntent("dinner on a rooftop in queens");

      expect(intent.searchType).toBe("restaurant");
      expect(intent.needsRestaurant).toBe(true);
      expect(intent.needsActivity).toBe(false);
      expect(intent.restaurantIntent.mealTerms).toContain("dinner");
      expect(intent.restaurantIntent.featureTerms).toEqual(expect.arrayContaining([
        "rooftop",
        "terrace",
        "skyline",
        "views",
      ]));
      expect(intent.restaurantIntent.foodTerms).not.toContain("rooftop");
      expect(activitySearchTerms(intent)).toEqual([]);
    });

    it("keeps steak dinner and rooftop drinks after as mixed outing with rooftop on the activity side", async () => {
      const parsed = await parseEnterpriseIntent("steak dinner and rooftop drinks after", { useLLM: true });
      const restaurantTerms = restaurantSearchTerms(parsed.intent);
      const activityTerms = activitySearchTerms(parsed.intent);

      expect(parsed.intent.searchType).toBe("mixed_outing");
      expect(parsed.intent.needsRestaurant).toBe(true);
      expect(parsed.intent.needsActivity).toBe(true);
      expect(restaurantTerms).toEqual(expect.arrayContaining(["steak", "dinner"]));
      expect(activityTerms).toEqual(expect.arrayContaining([
        "rooftop drinks",
        "rooftop bar",
        "rooftop lounge",
      ]));
      expect(restaurantTerms).not.toContain("rooftop restaurant");
      expect(restaurantTerms).not.toContain("rooftop dining");
      expect(restaurantTerms).not.toContain("roof deck");
    });
  });
});

describe("single-venue with intent regressions", () => {
  const singleVenueCases = [
    {
      query: "bar with wings nyc",
      food: ["wings", "chicken wings"],
      categories: ["bar", "sports bar", "pub"],
      features: ["bar food"],
    },
    {
      query: "sports bar with burgers in Queens",
      food: ["burger", "burgers"],
      categories: ["sports bar", "bar", "pub"],
      borough: "Queens",
    },
    {
      query: "restaurant with hookah in Queens",
      food: [],
      categories: ["restaurant"],
      features: ["hookah", "lounge"],
      borough: "Queens",
    },
    {
      query: "seafood restaurant with live music",
      food: ["seafood"],
      categories: ["restaurant"],
      features: ["live music", "music"],
    },
    {
      query: "pizza place with games",
      food: ["pizza"],
      categories: ["place"],
      features: ["games", "arcade", "pool", "billiards"],
    },
    {
      query: "vegan restaurant with cocktails",
      food: ["vegan", "plant based"],
      categories: ["restaurant"],
      features: ["drinks", "cocktails", "bar"],
    },
    {
      query: "halal restaurant with outdoor seating",
      food: ["halal", "halal food", "halal restaurant"],
      categories: ["restaurant", "halal restaurant"],
      features: ["outdoor seating", "patio"],
    },
  ];

  for (const testCase of singleVenueCases) {
    it(`keeps ${testCase.query} as one restaurant/venue search`, async () => {
      const parsed = await parseEnterpriseIntent(testCase.query, { useLLM: false });
      expect(parsed.debug.singleVenueWithIntentUsed).toBe(true);
      expect(parsed.intent.searchType).toBe("restaurant");
      expect(parsed.intent.primaryDomain).toBe("restaurant");
      expect(parsed.intent.needsRestaurant).toBe(true);
      expect(parsed.intent.needsActivity).toBe(false);
      expect(parsed.intent.wantsPairing).toBe(false);
      expect(parsed.intent.activityIntent.activityTerms).toEqual([]);
      expect(parsed.intent.pairingPreference?.requiresPairing).toBe(false);
      expect(parsed.intent.restaurantIntent.foodTerms).toEqual(
        expect.arrayContaining(testCase.food),
      );
      expect(parsed.intent.restaurantIntent.categoryTerms).toEqual(
        expect.arrayContaining(testCase.categories),
      );
      if (testCase.features?.length) {
        expect(parsed.intent.restaurantIntent.featureTerms).toEqual(
          expect.arrayContaining(testCase.features),
        );
      }
      if (testCase.borough) expect(parsed.intent.geo.borough).toBe(testCase.borough);
      expect(activitySearchTerms(parsed.intent)).toEqual([]);
      expect(restaurantSearchTerms(parsed.intent).length).toBeGreaterThan(0);
    });
  }

  for (const query of [
    "wings then bar",
    "chicken dinner and lounge after",
    "dinner before a show",
  ]) {
    it(`keeps true sequence query mixed: ${query}`, () => {
      const intent = normalizeIntent(query);
      expect(intent.searchType).toBe("mixed_outing");
      expect(intent.needsRestaurant).toBe(true);
      expect(intent.needsActivity).toBe(true);
      expect(intent.wantsPairing).toBe(true);
    });
  }
});

describe("restaurant cuisine feature fast path", () => {
  const cases = [
    "Seafood rooftop restaurant",
    "Italian rooftop restaurant",
    "Mexican restaurant with outdoor dining",
    "Sushi restaurant with skyline views",
    "Steakhouse with rooftop dining",
    "Caribbean restaurant with terrace",
    "Thai restaurant with patio",
    "Mediterranean restaurant with outdoor seating",
    "Soul food restaurant with live music",
  ];

  it.each(cases)("keeps %s as restaurant-only", async (query) => {
    const parsed = await parseEnterpriseIntent(query, { useFastPath: true });

    expect(parsed.intent.searchType).toBe("restaurant");
    expect(parsed.intent.primaryDomain).toBe("restaurant");
    expect(parsed.intent.needsRestaurant).toBe(true);
    expect(parsed.intent.needsActivity).toBe(false);
    expect(parsed.intent.wantsPairing).toBe(false);
    expect(parsed.intent.restaurantIntent.featureTerms.length).toBeGreaterThan(0);
    expect(parsed.intent.activityIntent.activityTerms).toEqual([]);
  });

  it("keeps rooftop drinks as activity intent", async () => {
    const parsed = await parseEnterpriseIntent("rooftop drinks", { useFastPath: true });

    expect(parsed.intent.needsActivity).toBe(true);
    expect(parsed.intent.primaryDomain).not.toBe("restaurant");
  });

  it("keeps rooftop bar as activity intent", async () => {
    const parsed = await parseEnterpriseIntent("rooftop bar", { useFastPath: true });

    expect(parsed.intent.needsActivity).toBe(true);
    expect(parsed.intent.primaryDomain).not.toBe("restaurant");
  });
});


describe("broad occasion outing intent", () => {
  it("fast-paths date night in nyc as a mixed outing without LLM wait", async () => {
    const parsed = await parseEnterpriseIntent("date night in nyc", { useLLM: true });

    expect(parsed.intentParserSource).toBe("fast_path");
    expect(parsed.usedLlm).toBe(false);
    expect(parsed.fastPathMatched).toBe(true);
    expect(parsed.fastPathReason).toBe("broad_occasion_mixed_outing");
    expect(parsed.debug.llm_ms).toBe(0);
    expect(parsed.intent.searchType).toBe("mixed_outing");
    expect(parsed.intent.primaryDomain).toBe("mixed");
    expect(parsed.intent.needsRestaurant).toBe(true);
    expect(parsed.intent.needsActivity).toBe(true);
    expect(parsed.intent.wantsPairing).toBe(true);
    expect(parsed.intent.occasion).toBe("date night");
    expect(parsed.intent.timeContext).toBe("date night");
    expect(parsed.intent.restaurantIntent.mealTerms).toEqual(
      expect.arrayContaining(["date night", "dinner"]),
    );
    expect(parsed.intent.activityIntent.activityTerms).toEqual(
      expect.arrayContaining(["activity", "things to do"]),
    );
  });

  it("keeps date night in nyc restaurant-only when the restaurant lane is explicit", async () => {
    const parsed = await parseEnterpriseIntent("date night in nyc", {
      useLLM: false,
      body: { selectedSearchLane: "restaurant" },
    });

    expect(parsed.debug.selectedSearchLane).toBe("restaurant");
    expect(parsed.intent.searchType).toBe("restaurant");
    expect(parsed.intent.primaryDomain).toBe("restaurant");
    expect(parsed.intent.needsRestaurant).toBe(true);
    expect(parsed.intent.needsActivity).toBe(false);
    expect(parsed.intent.wantsPairing).toBe(false);
  });

  it("keeps explicit date night restaurant searches restaurant-only", async () => {
    const parsed = await parseEnterpriseIntent("date night restaurant in nyc", {
      useLLM: false,
    });

    expect(parsed.intent.searchType).toBe("restaurant");
    expect(parsed.intent.needsRestaurant).toBe(true);
    expect(parsed.intent.needsActivity).toBe(false);
  });

  it("allows date ideas with no food signal to stay activity-only", async () => {
    const parsed = await parseEnterpriseIntent("date ideas in nyc", {
      useLLM: false,
    });

    expect(parsed.intent.searchType).toBe("activity");
    expect(parsed.intent.needsRestaurant).toBe(false);
    expect(parsed.intent.needsActivity).toBe(true);
  });

  for (const query of [
    "girls night in queens",
    "birthday night out in manhattan",
    "steak dinner date night",
  ]) {
    it(`parses ${query} as a mixed outing`, async () => {
      const parsed = await parseEnterpriseIntent(query, { useLLM: true });

      expect(parsed.intentParserSource).toBe("fast_path");
      expect(parsed.fastPathReason).toBe("broad_occasion_mixed_outing");
      expect(parsed.intent.searchType).toBe("mixed_outing");
      expect(parsed.intent.primaryDomain).toBe("mixed");
      expect(parsed.intent.needsRestaurant).toBe(true);
      expect(parsed.intent.needsActivity).toBe(true);
      expect(parsed.intent.wantsPairing).toBe(true);
    });
  }
});
