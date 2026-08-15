import { describe, expect, it } from "vitest";
import {
  enforceRequestedWebsiteDesignDirection,
  fallbackWebsiteBlueprint,
  inferWebsiteDesignDirectionFromVision,
} from "@/lib/websites/blueprint";

describe("Website V3 design direction selection", () => {
  it("maps explicit supported direction names to their canonical ids", () => {
    expect(inferWebsiteDesignDirectionFromVision("Creative / Playful")).toBe("creative_workshop");
    expect(inferWebsiteDesignDirectionFromVision("Dark Lounge")).toBe("refined_after_dark");
    expect(inferWebsiteDesignDirectionFromVision("Luxury Minimal")).toBe("luxury_minimal");
  });

  it("recognizes strong redesign signals instead of anchoring to the old direction", () => {
    expect(
      inferWebsiteDesignDirectionFromVision(
        "Make it dark, romantic, moody, intimate, upscale and cocktail-lounge focused.",
      ),
    ).toBe("refined_after_dark");
  });

  it("forces an explicit owner direction even when the normalized blueprint still carries Editorial Light", () => {
    const editorial = fallbackWebsiteBlueprint({
      name: "TheOutHaven Lounge",
      category: "Restaurant + Lounge",
      directionId: "editorial_luxury",
    });

    const corrected = enforceRequestedWebsiteDesignDirection(editorial, "creative_workshop");
    expect(editorial.design.directionId).toBe("editorial_luxury");
    expect(corrected.design.directionId).toBe("creative_workshop");
    expect(corrected.design.rationale).toContain("explicitly requested");
  });

  it("does not invent an explicit direction from weak unrelated wording", () => {
    expect(inferWebsiteDesignDirectionFromVision("Make the website better and easier to use.")).toBeNull();
  });
});
