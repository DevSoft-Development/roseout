import { describe, expect, it } from "vitest";
import { activities, findTaxonomyMatches, matchTaxonomy } from "../index";

describe("taxonomy term boundaries", () => {
  it("does not match spa inside space or makerspace", () => {
    expect(findTaxonomyMatches("MakerSpace NYC").map((entry) => entry.id)).not.toContain("spa");
    expect(matchTaxonomy("event space in Queens", activities)).not.toContain("spa");
  });

  it("still matches explicit spa terms with punctuation and spaces", () => {
    expect(findTaxonomyMatches("blissful headspace spa(brooklyn)").map((entry) => entry.id)).toContain("spa");
    expect(matchTaxonomy("spa in Brooklyn", activities)).toContain("spa");
  });

  it("keeps other short aliases working on real term boundaries", () => {
    const ids = findTaxonomyMatches("sports bar with live music").map((entry) => entry.id);
    expect(ids).toContain("bar");
    expect(ids).toContain("live_music");
  });
});
