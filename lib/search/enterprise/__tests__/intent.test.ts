import { describe, expect, it } from "vitest";
import {
  activityRpcTerms,
  activitySearchTerms,
  deterministicIntentFromQuery,
  normalizeIntent,
} from "../normalize-intent";
import { resolveSearchMarket } from "../markets";
import {
  getEnterpriseIntentFastPathReason,
  parseEnterpriseIntent,
} from "../intent-parser";

describe("enterprise search intent", () => {
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
