import { describe, expect, it } from "vitest";
import { activities, activityRetrievalTerms, canonicalTaxonomy, matchTaxonomy, validateCanonicalTaxonomy } from ".";

describe("canonical taxonomy", () => {
  it("is internally valid", () => expect(validateCanonicalTaxonomy()).toEqual([]));

  it("derives generic activity retrieval from canonical entries", () => {
    expect(activityRetrievalTerms("bowling")).toContain("bowling");
    expect(canonicalTaxonomy.some((item) => item.id === "live_music")).toBe(true);
    expect(activityRetrievalTerms("live_music")).toContain("jazz");
    expect(canonicalTaxonomy.some((item) => item.id === "party_venue")).toBe(true);
    expect(activityRetrievalTerms("party_venue")).toContain("party venue");
    expect(activityRetrievalTerms("party_venue")).not.toContain("event venue");
  });

  it("supports rock climbing intent without a broad climbing alias", () => {
    expect(matchTaxonomy("indoor rock climbing date", activities)).toContain("rock_climbing");
    expect(matchTaxonomy("bouldering gym", activities)).toContain("rock_climbing");
    expect(activityRetrievalTerms("rock_climbing")).toContain("climbing gym");
    expect(activityRetrievalTerms("rock_climbing")).not.toContain("climbing");
  });

  it("supports scavenger hunt intent", () => {
    expect(matchTaxonomy("scavenger hunt in Manhattan", activities)).toContain("scavenger_hunt");
    expect(matchTaxonomy("city treasure hunt", activities)).toContain("scavenger_hunt");
    expect(activityRetrievalTerms("scavenger_hunt")).toContain("scavenger hunts");
  });
});
