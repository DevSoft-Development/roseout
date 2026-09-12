import { describe, expect, it } from "vitest";
import { resolvePlanTypeWithSearchV2 } from "./resolvePlanTypeWithSearchV2";

describe("resolvePlanTypeWithSearchV2", () => {
  it("keeps the reported steak and lobster search restaurant-only", async () => {
    await expect(resolvePlanTypeWithSearchV2("best steak and lobster in nyc")).resolves.toBe("restaurant");
  });

  it("keeps activity-only requests activity-only", async () => {
    await expect(resolvePlanTypeWithSearchV2("bowling in Queens")).resolves.toBe("activity");
  });

  it("keeps explicit restaurant plus activity requests paired", async () => {
    await expect(resolvePlanTypeWithSearchV2("steak dinner and bowling in Queens")).resolves.toBe("outing");
  });
});
