import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(
  "app/api/google/specialty-import/route.ts",
  "utf8",
);

describe("specialty import retrieval query evidence", () => {
  it("keeps retrieval query text out of classification inputs", () => {
    expect(routeSource).toContain(
      'const text = `${merged.name} ${(merged.types || []).join(" ")}`;',
    );
    expect(routeSource).toContain("function buildSearchKeywords(place: any) {");
    expect(routeSource).toContain("function buildDateStyleTags(place: any) {");
    expect(routeSource).toContain("search_keywords: buildSearchKeywords(merged),");
    expect(routeSource).toContain("date_style_tags: buildDateStyleTags(merged),");

    expect(routeSource).not.toContain(
      'const text = `${merged.name} ${query} ${(merged.types || []).join(" ")}`;',
    );
    expect(routeSource).not.toContain(
      'normalizeText(`${place.name} ${query} ${(place.types || []).join(" ")}`)',
    );
    expect(routeSource).not.toContain('normalizeText(`${place.name} ${query}`)');
  });

  it("still allows the query for market inference and Google retrieval", () => {
    expect(routeSource).toContain("inferMarketFromPlace({ requestedArea, query })");
    expect(routeSource).toContain("const finalQuery = customQuery ? customQuery : `${baseQuery} in ${area}`;");
    expect(routeSource).toContain("const places = await googleTextSearch(finalQuery);");
  });
});
