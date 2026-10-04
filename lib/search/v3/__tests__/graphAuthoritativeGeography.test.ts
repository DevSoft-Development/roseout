import { describe, expect, it } from "vitest";

import { RuleBasedSearchV3IntentProvider } from "@/lib/search/v3/intent/ruleBasedIntentProvider";

describe("Search V3 graph-authoritative geography intent", () => {
  const provider = new RuleBasedSearchV3IntentProvider();

  it("extracts a borough-like place as an unresolved anchor instead of hard-coding its type", async () => {
    const intent = await provider.parse({
      requestId: "req-queens",
      query: "Rooftop dinner in Queens",
    });

    expect(intent.anchor).toMatchObject({
      label: "Queens",
      entityType: "unknown",
    });
    expect(intent.constraints.some((constraint) => constraint.key === "borough")).toBe(false);
  });

  it("extracts a zip code as an unresolved graph anchor instead of a hard-coded zip constraint", async () => {
    const intent = await provider.parse({
      requestId: "req-zip",
      query: "Dinner in 11375",
    });

    expect(intent.anchor).toMatchObject({
      label: "11375",
      entityType: "unknown",
    });
    expect(intent.constraints.some((constraint) => constraint.key === "zip_code")).toBe(false);
  });

  it("extracts market and neighborhood names without a static geography dictionary", async () => {
    const longIsland = await provider.parse({
      requestId: "req-long-island",
      query: "Dinner and mini golf on Long Island",
    });
    const gardenCity = await provider.parse({
      requestId: "req-garden-city",
      query: "Sushi and an escape room in Garden City",
    });

    expect(longIsland.anchor?.label).toBe("Long Island");
    expect(gardenCity.anchor?.label).toBe("Garden City");
  });
});
