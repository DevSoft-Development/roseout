import { describe, expect, it } from "vitest";
import { buildSearchPlan } from "./buildSearchPlan";
import { enrichSearchPlan } from "./enrichSearchPlan";

async function plan(query: string) {
  return enrichSearchPlan(await buildSearchPlan({ input: { query } }));
}

describe("Search V2 venue capability enrichment", () => {
  it("keeps restaurant with hookah as one restaurant capability", async () => {
    const result = await plan("restaurant with hookah in Forest Hills");
    expect(result.restaurant.required).toBe(true);
    expect(result.restaurant.features).toContain("hookah");
    expect(result.activity.required).toBe(false);
    expect(result.activity.categories).not.toContain("hookah");
    expect(result.pairing.required).toBe(false);
    expect(result.mode).toBe("restaurant_only");
  });

  it("treats hookah and restaurant as a venue capability unless another stop is stated", async () => {
    const result = await plan("hookah and restaurant in Forest Hills");
    expect(result.restaurant.features).toContain("hookah");
    expect(result.activity.required).toBe(false);
    expect(result.relationship?.type).toBe("same_venue_required");
  });

  it("preserves dinner then hookah as a two-stop sequential outing", async () => {
    const result = await plan("dinner then hookah in Forest Hills");
    expect(result.restaurant.required).toBe(true);
    expect(result.activity.required).toBe(true);
    expect(result.activity.categories).toContain("hookah");
    expect(result.pairing.required).toBe(true);
    expect(result.relationship?.type).toBe("sequential");
  });

  it("does not leak rooftop preference into the activity lane of a guided mixed outing", async () => {
    const result = await plan("Plan a restaurant and activity outing. date night in Brooklyn Location: Brooklyn. Preferences: Rooftop. Return the best options, ranked by fit.");
    expect(result.restaurant.features).toContain("rooftop");
    expect(result.activity.required).toBe(true);
    expect(result.activity.features).not.toContain("rooftop");
    expect(result.activity.categories).not.toContain("lounge");
  });

  it("keeps true activities paired", async () => {
    const result = await plan("dinner and bowling in Queens");
    expect(result.restaurant.required).toBe(true);
    expect(result.activity.required).toBe(true);
    expect(result.activity.categories).toContain("bowling");
    expect(result.pairing.required).toBe(true);
  });
});
