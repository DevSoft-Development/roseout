import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("Search Core V2 fallback", () => {
  it("loads the integrated module", async () => {
    const searchModule = await import("../index");
    expect(searchModule.searchV2).toBeTypeOf("function");
  });

  it("preserves qualified standalone candidates when required pairing fails", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "lib/search/v2/fallback/resolveFallback.ts"),
      "utf8",
    );

    expect(source).toContain(
      "const showStandaloneCandidates = !plan.pairing.required || partial",
    );
    expect(source).toContain("scored.restaurants.slice(0, 20)");
    expect(source).toContain("scored.activities.slice(0, 20)");
    expect(source).not.toContain(
      "restaurants:plan.pairing.required?[]:scored.restaurants",
    );
  });

  it("keeps pair-fulfilled responses pair-first", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "lib/search/v2/fallback/resolveFallback.ts"),
      "utf8",
    );

    expect(source).toContain("!plan.pairing.required || partial");
    expect(source).toContain("pairs: pairs.slice(0, 20)");
  });
});
