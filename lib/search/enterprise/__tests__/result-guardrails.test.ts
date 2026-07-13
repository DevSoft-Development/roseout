import { describe, expect, it } from "vitest";
import { applyResultGuardrails } from "../resultGuardrails";

function location(overrides: Record<string, unknown>) {
  return {
    id: String(overrides.id ?? Math.random()),
    location_type: "activity",
    name: "Activity",
    ...overrides,
  } as any;
}

function result(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    restaurants: [],
    activities: [],
    pairs: [],
    matched_locations: [],
    render_mode: "activity_cards",
    reply: "Found matches.",
    card_counts: {
      restaurants: 0,
      activities: 0,
      matched_locations: 0,
      pairs: 0,
    },
    debug: {},
    ...overrides,
  } as any;
}

describe("final result guardrails", () => {
  it("removes adult-leaning weak matches from teen searches", () => {
    const guarded = applyResultGuardrails(
      result({
        activities: [
          location({ id: "arcade", name: "Gatcha", activity_type: "games", tags: ["arcade"] }),
          location({ id: "spa", name: "Wildflower Spa", activity_type: "wellness", tags: ["spa"] }),
          location({ id: "perfume", name: "MA PERFUME", activity_type: "creative", search_keywords: ["perfume making"] }),
        ],
      }),
      "Fun activities with my teenage son in Queens",
    );

    expect(guarded.activities.map((row: any) => row.id)).toEqual(["arcade"]);
    expect((guarded.debug as any).minorAudienceRemovedCount).toBe(2);
  });

  it("keeps an adult-leaning activity when explicitly requested", () => {
    const guarded = applyResultGuardrails(
      result({
        activities: [
          location({ id: "perfume", name: "MA PERFUME", search_keywords: ["perfume making"] }),
        ],
      }),
      "Perfume-making activity with my teenage daughter",
    );

    expect(guarded.activities).toHaveLength(1);
  });

  it("removes nightlife cards and pairs from generic relaxed searches", () => {
    const museum = location({ id: "museum", name: "Queens Museum", activity_type: "museum" });
    const lounge = location({ id: "lounge", name: "Sky Lounge", activity_type: "lounge" });
    const restaurant = { id: "restaurant", location_type: "restaurant", name: "Dinner Spot" } as any;
    const guarded = applyResultGuardrails(
      result({
        activities: [museum, lounge],
        pairs: [
          { restaurant, activity: museum },
          { restaurant, activity: lounge },
        ],
        debug: {
          activityTerms: ["museum", "club", "rooftop", "bowling"],
          normalizedIntent: {
            activityIntent: {
              activityTerms: ["museum", "lounge", "park"],
              categoryTerms: ["club", "gallery"],
              featureTerms: ["rooftop", "scenic"],
            },
          },
        },
      }),
      "Casual dinner and a relaxed activity in Long Island City",
    );

    expect(guarded.activities.map((row: any) => row.id)).toEqual(["museum"]);
    expect(guarded.pairs).toHaveLength(1);
    expect((guarded.debug as any).activityTerms).toEqual(["museum", "bowling"]);
    expect((guarded.debug as any).guardrailPairRemovedCount).toBe(1);
  });

  it("preserves nightlife when the relaxed query explicitly asks for it", () => {
    const lounge = location({ id: "lounge", name: "Quiet Lounge", activity_type: "lounge" });
    const guarded = applyResultGuardrails(
      result({ activities: [lounge] }),
      "A relaxed lounge with live music",
    );

    expect(guarded.activities).toHaveLength(1);
  });
});
