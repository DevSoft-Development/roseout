import { describe, expect, it } from "vitest";
import {
  detectVenueRelationship,
  extractNegativeConstraints,
  extractSubjectivePreferences,
} from "./languageUnderstanding";

describe("search language semantic regressions", () => {
  it("recognizes eat, drinks, and live music at somewhere as a same-venue request", () => {
    const relationship = detectVenueRelationship(
      "Find somewhere in Brooklyn where we can eat, have drinks and listen to live music",
    );

    expect(relationship.type).toBe("same_venue_required");
    expect(relationship.evidence).toContain("feature_bound_to_restaurant");
  });

  it("preserves explicit activity exclusions", () => {
    const negatives = extractNegativeConstraints(
      "Sushi and something fun after, but not an arcade",
    );

    expect(negatives.activity).toContain("arcade");
  });

  it("understands conversation-friendly moderate-budget language", () => {
    const preferences = extractSubjectivePreferences(
      "I want something quiet enough to talk and not crazy expensive",
    );

    expect(preferences.noise).toBe("quiet");
    expect(preferences.budget).toBe("moderate");
    expect(preferences.vibes).toContain("conversation_friendly");
  });

  it("understands nothing-too-expensive as moderate rather than unconstrained", () => {
    const preferences = extractSubjectivePreferences(
      "I want a nice date tonight around Forest Hills with dinner and hookah, nothing too expensive",
    );

    expect(preferences.budget).toBe("moderate");
  });
});
