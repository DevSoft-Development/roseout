import { WEBSITE_DESIGN_DIRECTIONS } from "@/lib/websites/design-directions";
import { deriveDesignStrategy, fallbackDesignMatches } from "@/lib/websites/design-direction-matcher";

describe("website design systems", () => {
  it("keeps exactly ten production design systems", () => {
    expect(WEBSITE_DESIGN_DIRECTIONS).toHaveLength(10);
    expect(new Set(WEBSITE_DESIGN_DIRECTIONS.map((direction) => direction.id)).size).toBe(10);
  });

  it("keeps reservation as the primary conversion goal for every system", () => {
    for (const direction of WEBSITE_DESIGN_DIRECTIONS) {
      expect(direction.theme.reservationPriority).toBe("primary");
      expect(direction.variants).toContain(direction.defaultVariant);
    }
  });

  it("uses controlled hero variants instead of forcing a giant hero image", () => {
    expect(deriveDesignStrategy("refined_after_dark", "dark romantic lounge with a cinematic strip").variant).toBe("cinematic_strip");
    expect(deriveDesignStrategy("luxury_minimal", "quiet luxury, typography first with very few photos").variant).toBe("typography_first");
    expect(deriveDesignStrategy("bold_social", "energetic social venue with a photo mosaic").variant).toBe("photo_mosaic");
  });

  it("keeps reservations immediately after the hero in deterministic fallback", () => {
    const [match] = fallbackDesignMatches("dark romantic upscale lounge");
    expect(match.strategy.section_order.slice(0, 2)).toEqual(["hero", "reservations"]);
  });
});
