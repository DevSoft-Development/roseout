import { describe, expect, it } from "vitest";
import { inferHomepagePlanType } from "./inferHomepagePlanType";

describe("inferHomepagePlanType", () => {
  it.each([
    "best steak and lobster in nyc",
    "seafood restaurant in Queens",
    "brunch in Brooklyn",
    "Italian dinner tonight",
  ])("keeps food-only searches restaurant-only: %s", (query) => {
    expect(inferHomepagePlanType(query)).toBe("restaurant");
  });

  it.each([
    "bowling in Queens",
    "escape room near me",
    "museum in Manhattan",
  ])("keeps activity-only searches activity-only: %s", (query) => {
    expect(inferHomepagePlanType(query)).toBe("activity");
  });

  it.each([
    "steak dinner and bowling",
    "sushi and karaoke near me",
    "brunch and something to do afterward",
    "date night",
  ])("uses outing mode when both domains are requested or the request is ambiguous: %s", (query) => {
    expect(inferHomepagePlanType(query)).toBe("outing");
  });
});
