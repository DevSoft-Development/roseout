import { describe, expect, it } from "vitest";
import { buildSearchIntentCacheKey } from "../searchIntentCache";

describe("search intent cache key", () => {
  it("includes query, geo, parser version, and model", () => {
    const key = buildSearchIntentCacheKey({
      rawQuery: "Best bar to watch the Knicks game in Harlem",
      geo: {
        neighborhood: "Harlem",
        borough: "Manhattan",
        city: "New York",
        state: "NY",
      },
      parserVersion: "intent-v4-fast-model",
      model: "gpt-4o-mini",
    });

    expect(key).toContain("best bar to watch the knicks game in harlem");
    expect(key).toContain("Harlem,Manhattan,New York,NY");
    expect(key).toContain("intent-v4-fast-model");
    expect(key).toContain("gpt-4o-mini");
  });
});
