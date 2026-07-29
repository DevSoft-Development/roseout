import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeClassificationToken, sanitizeClassificationValues } from "./profileClassificationSanitizer";

const table = readFileSync("components/admin/location-tools/SearchProfileReviewTable.tsx", "utf8");
const builder = readFileSync("lib/search/profile/buildLocationSearchProfile.ts", "utf8");

describe("search profile classification enrichment", () => {
  it("rejects addresses and generic fallback labels from taxonomy facets", () => {
    expect(normalizeClassificationToken("5500 Broadway Suite 2B")).toBeNull();
    expect(normalizeClassificationToken("88 Franklin St")).toBeNull();
    expect(sanitizeClassificationValues(["activity", "date night", "romantic", "ice skating"])).toEqual(["ice skating"]);
  });

  it("sanitizes source facets before taxonomy matching and validation", () => {
    expect(builder).toContain("sanitizedSource(source)");
    expect(builder).toContain("features: sorted([...clean.features");
    expect(builder).not.toContain("features: sorted([...(source.features");
  });

  it("shows all issues on hover or focus and supports bulk Google lookup plus rebuild", () => {
    expect(table).toContain("role=\"tooltip\"");
    expect(table).toContain("group-hover:visible");
    expect(table).toContain("group-focus-within:visible");
    expect(table).toContain("Enrich & rebuild");
    expect(table).toContain("/api/admin/locations/google-enrichment/single");
    expect(table).toContain("/rebuild");
    expect(table).toContain("limited to 25 selected profiles");
  });
});
