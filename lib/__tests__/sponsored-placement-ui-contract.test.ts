import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("sponsored disclosure UI contract", () => {
  it("never calls a sponsored web result Best Match", () => {
    const web = read("app/create/GuidedResultsPageV4.tsx");
    expect(web).toContain("const best = rank === 1 && !sponsored;");
    expect(web).toContain('sponsored ? "Sponsored" : best ? "Best Match"');
  });

  it("preserves disclosure through mobile response and rendering", () => {
    const route = read("app/api/mobile/v1/search/route.ts");
    const cards = read("mobile/components/search/SearchResultCards.tsx");
    expect(route).toContain("sponsored: placement.sponsored");
    expect(route).toContain("campaignId: placement.campaignId");
    expect(cards).toContain('sponsored ? "SPONSORED" : rank === 1 ? "BEST MATCH"');
    expect(cards).toContain("place.sponsored");
  });

  it("preserves sponsored attribution through mobile navigation", () => {
    const navigation = read("mobile/lib/result-navigation.ts");
    expect(navigation).toContain('sponsored: outing.sponsored ? "1" : "0"');
    expect(navigation).toContain('sponsorId: outing.sponsorId || ""');
    expect(navigation).toContain('campaignId: outing.campaignId || ""');
  });
});
