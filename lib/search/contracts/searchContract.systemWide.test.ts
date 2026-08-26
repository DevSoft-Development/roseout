import { describe, expect, it } from "vitest";
import {
  queryAllowsSameVenue,
  queryRequiresActivity,
  queryRequiresRestaurant,
  validateModeAgainstQuery,
} from "./searchContract";

describe("search contract shared semantics", () => {
  it("recognizes beverage-first open-ended sequences as mixed intent", () => {
    const query = "Girls night: cocktails first, then somewhere social and interesting afterward";

    expect(queryRequiresRestaurant(query)).toBe(true);
    expect(queryRequiresActivity(query)).toBe(true);
    expect(
      validateModeAgainstQuery({
        query,
        mode: "restaurant_only",
        needsRestaurant: false,
        needsActivity: false,
      }).valid,
    ).toBe(false);
  });

  it("recognizes stay-put language as same-venue language", () => {
    const query = "Dinner and a live performance without leaving the venue";
    expect(queryAllowsSameVenue(query)).toBe(true);
  });

  it("recognizes broad something-to-do language after exclusions", () => {
    const query = "Italian food then something fun that isn't bowling, karaoke, an arcade, or mini golf";
    expect(queryRequiresRestaurant(query)).toBe(true);
    expect(queryRequiresActivity(query)).toBe(true);
  });
});
