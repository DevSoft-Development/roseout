import { describe, expect, it } from "vitest";
import { activityRetrievalTerms, canonicalTaxonomy, validateCanonicalTaxonomy } from ".";
describe("canonical taxonomy", () => { it("is internally valid", () => expect(validateCanonicalTaxonomy()).toEqual([])); it("derives generic activity retrieval from canonical entries", () => { expect(activityRetrievalTerms("bowling")).toContain("bowling"); expect(canonicalTaxonomy.some((item) => item.id === "live_music")).toBe(true); }); });
