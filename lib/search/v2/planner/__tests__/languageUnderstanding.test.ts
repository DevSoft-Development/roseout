import { describe, expect, it } from "vitest";
import {
  ambiguityReasons,
  detectVenueRelationship,
  extractNegativeConstraints,
  extractSubjectivePreferences,
} from "../languageUnderstanding";

describe("Search V2 language understanding", () => {
  it.each([
    ["restaurant with hookah in Forest Hills", "same_venue_required"],
    ["hookah restaurant in Forest Hills", "same_venue_required"],
    ["dinner then hookah in Forest Hills", "sequential"],
    ["restaurant near a hookah lounge", "proximity"],
    ["dinner and bowling in Queens", "any"],
    ["dinner and bowling at different places", "separate_venues"],
  ])("maps %s to %s", (query, relationship) => {
    expect(detectVenueRelationship(query).type).toBe(relationship);
  });

  it("captures negative activity and food constraints", () => {
    const out = extractNegativeConstraints("date night in Queens but no bowling and no seafood");
    expect(out.activity).toContain("bowling");
    expect(out.restaurant).toContain("seafood");
  });

  it("captures subjective preferences as soft signals", () => {
    const out = extractSubjectivePreferences("somewhere romantic and quiet where we can actually talk, not too expensive");
    expect(out.vibes).toContain("romantic");
    expect(out.vibes).toContain("conversation_friendly");
    expect(out.noise).toBe("quiet");
    expect(out.budget).toBe("moderate");
  });

  it("flags ambiguous mixed-domain and requests for LLM clarification", () => {
    const relationship = detectVenueRelationship("hookah and restaurant in Forest Hills");
    expect(
      ambiguityReasons("hookah and restaurant in Forest Hills", relationship, true, true),
    ).toContain("mixed_domains_joined_by_ambiguous_and");
  });

  it("does not mark an explicit same-venue query as ambiguous mixed domains", () => {
    const relationship = detectVenueRelationship("restaurant with hookah in Forest Hills");
    expect(
      ambiguityReasons("restaurant with hookah in Forest Hills", relationship, true, true),
    ).not.toContain("mixed_domains_joined_by_ambiguous_and");
  });
});
