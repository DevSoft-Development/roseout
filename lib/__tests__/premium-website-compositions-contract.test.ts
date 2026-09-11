import fs from "node:fs";
import path from "node:path";

describe("premium hosted website compositions", () => {
  const compositions = fs.readFileSync(path.join(process.cwd(), "lib/websites/composition-profiles.ts"), "utf8");
  const directions = fs.readFileSync(path.join(process.cwd(), "lib/websites/design-directions.ts"), "utf8");

  it("keeps the existing ten stored design direction ids stable", () => {
    for (const id of [
      "editorial_luxury",
      "refined_after_dark",
      "modern_minimal",
      "bold_social",
      "classic_bistro",
      "coastal_airy",
      "warm_neighborhood",
      "luxury_minimal",
      "experiential_escape",
      "creative_workshop",
    ]) {
      expect(compositions).toContain(`${id}:`);
      expect(directions).toContain(`id: \"${id}\"`);
    }
  });

  it("uses materially different composition geometry instead of palette-only variants", () => {
    expect(compositions).toContain('hero: "editorial"');
    expect(compositions).toContain('hero: "offset"');
    expect(compositions).toContain('hero: "reservation"');
    expect(compositions).toContain('hero: "experience"');
    expect(compositions).toContain('hero: "story"');
    expect(compositions).toContain('hero: "minimal"');
    expect(compositions).toContain('hero: "playful"');
    expect(compositions).toContain('maxWidth: "1480px"');
    expect(compositions).toContain('maxWidth: "1040px"');
    expect(compositions).toContain('imageRatio: "21/9"');
    expect(compositions).toContain('imageRatio: "3/4"');
  });

  it("keeps legacy direction aliases compatible with existing websites", () => {
    expect(directions).toContain('cocktail_society: "refined_after_dark"');
    expect(directions).toContain('competitive_social: "experiential_escape"');
    expect(directions).toContain('wellness_escape: "luxury_minimal"');
  });
});
