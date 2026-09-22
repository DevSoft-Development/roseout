import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("sponsored placement disclosure contract", () => {
  it("keeps web sponsored results from being presented as best match", () => {
    const web = read("app/create/GuidedResultsPageV4.tsx");
    expect(web).toContain("const best = rank === 1 && !sponsored");
    expect(web).toContain('sponsored ? "Sponsored" : best ? "Best Match"');
    expect(web).toContain('isSponsored(location) ? "Sponsored" : label');
  });

  it("applies promotions to the mobile canonical payload and preserves disclosure fields", () => {
    const route = read("app/api/mobile/v1/search/route.ts");
    expect(route).toContain("applySearchPromotions");
    expect(route).toContain("sponsored:");
    expect(route).toContain("sponsorId:");
    expect(route).toContain("placementType:");
  });

  it("renders Sponsored on mobile cards", () => {
    const cards = read("mobile/components/search/SearchResultCards.tsx");
    expect(cards).toContain('outing.sponsored ? "SPONSORED"');
    expect(cards).toContain("place.sponsored");
  });
});
