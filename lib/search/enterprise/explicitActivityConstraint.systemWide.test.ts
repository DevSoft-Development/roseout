import { describe, expect, it } from "vitest";
import { resolveExplicitActivityConstraint } from "./explicitActivityConstraint";

describe("explicit activity constraint search-wide semantics", () => {
  it("never promotes a fully negated activity list into positive requirements", () => {
    const constraint = resolveExplicitActivityConstraint(
      "Italian food followed by something fun that isn't bowling, karaoke, an arcade, or mini golf",
    );

    expect(constraint.applied).toBe(false);
    expect(constraint.requestedIds).toEqual([]);
  });

  it("preserves real positive activity intent while removing excluded categories", () => {
    const constraint = resolveExplicitActivityConstraint(
      "Sushi then mini golf, but no bowling or karaoke",
    );

    expect(constraint.applied).toBe(true);
    expect(constraint.requestedIds).toEqual(["mini_golf"]);
  });

  it("does not let a specific hookah-lounge exclusion suppress unrelated lounge intent", () => {
    const constraint = resolveExplicitActivityConstraint(
      "Dinner then a lounge with live music, but no hookah lounges",
    );

    expect(constraint.requestedIds).toEqual(expect.arrayContaining(["lounge", "live_music"]));
    expect(constraint.requestedIds).not.toContain("hookah");
  });

  it("does not promote modifier-scoped negatives into positive activity requirements", () => {
    const constraint = resolveExplicitActivityConstraint(
      "Dinner then something interesting, but no clubs or loud bars",
    );

    expect(constraint.requestedIds).not.toContain("bar");
    expect(constraint.requestedIds).not.toContain("nightclub");
  });
});
