import { describe, expect, it } from "vitest";
import { extractNegativeConstraints } from "../planner/languageUnderstanding";
import { normalizeNaturalLanguageForPlanner } from "../planner/naturalLanguageNormalization";
import { deterministicParse } from "../planner/deterministicParser";

describe("system-wide language contracts", () => {
  it("treats every item in a coordinated negative list as an exclusion", () => {
    const negatives = extractNegativeConstraints(
      "Sushi in Queens, then something fun nearby, but no arcades, bowling, or karaoke.",
    );

    expect(negatives.activity).toEqual(
      expect.arrayContaining(["arcade", "bowling", "karaoke"]),
    );
  });

  it("handles coordinated restaurant exclusions across commas and conjunctions", () => {
    const negatives = extractNegativeConstraints(
      "Dinner in Brooklyn, but no seafood, sushi, or steak.",
    );

    expect(negatives.restaurant).toEqual(
      expect.arrayContaining(["seafood", "sushi", "steak"]),
    );
  });

  it("treats contraction-based taxonomy lists as exclusions", () => {
    const negatives = extractNegativeConstraints(
      "Korean food and something fun afterward that isn't an arcade, museum, or movie theater.",
    );

    expect(negatives.activity).toEqual(
      expect.arrayContaining(["arcade", "museum", "movie"]),
    );
  });

  it("preserves generic outdoor avoidance as an activity exclusion", () => {
    const negatives = extractNegativeConstraints(
      "Brunch followed by something active nearby, but nothing outdoors and no bowling.",
    );

    expect(negatives.activity).toEqual(
      expect.arrayContaining(["outdoor", "bowling"]),
    );
  });

  it("normalizes open-ended postposed activity language into a real second stop", () => {
    const normalized = normalizeNaturalLanguageForPlanner(
      "Dinner in Queens and something interesting to do afterward",
    );

    expect(normalized).toMatch(/then something interesting to do activity/i);
    const parsed = deterministicParse({ query: normalized } as any);
    expect(parsed.restaurantSignal).toBe(true);
    expect(parsed.activitySignal).toBe(true);
    expect(parsed.sequence).toBe("restaurant_first");
  });

  it("normalizes live entertainment into an activity lane", () => {
    const normalized = normalizeNaturalLanguageForPlanner(
      "Dinner in Long Island City, then somewhere close for live entertainment",
    );

    expect(normalized).toMatch(/live entertainment activity/i);
    const parsed = deterministicParse({ query: normalized } as any);
    expect(parsed.restaurantSignal).toBe(true);
    expect(parsed.activitySignal).toBe(true);
    expect(parsed.sequence).toBe("restaurant_first");
  });

  it("uses a service lane for beverage-first sequential outings without inventing food intent globally", () => {
    const normalized = normalizeNaturalLanguageForPlanner(
      "Girls night with cocktails and something creative to do afterward",
    );

    expect(normalized).toMatch(/cocktails restaurant/i);
    expect(normalized).toMatch(/then something creative to do activity/i);
    const parsed = deterministicParse({ query: normalized } as any);
    expect(parsed.restaurantSignal).toBe(true);
    expect(parsed.activitySignal).toBe(true);
    expect(parsed.sequence).toBe("restaurant_first");
  });

  it("does not turn a standalone drinks request into a restaurant lane", () => {
    const normalized = normalizeNaturalLanguageForPlanner("Cocktails in Astoria tonight");
    expect(normalized).not.toMatch(/cocktails restaurant/i);
  });
});
