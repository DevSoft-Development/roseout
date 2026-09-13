import fs from "node:fs";
import path from "node:path";

describe("agency-grade hosted website templates", () => {
  const source = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

  it("defines a unique structural signature for all 40 design families", () => {
    const system = source("lib/websites/agency-template-system.ts");
    const matches = [...system.matchAll(/^\s{2}([a-z0-9_]+):s\((\{[^\n]+\})\),$/gm)];
    expect(matches).toHaveLength(40);
    const ids = matches.map((match) => match[1]);
    const signatures = matches.map((match) => match[2]);
    expect(new Set(ids).size).toBe(40);
    expect(new Set(signatures).size).toBe(40);
  });

  it("covers every premium design family currently offered", () => {
    const system = source("lib/websites/agency-template-system.ts");
    const expected = [
      "editorial_luxury", "refined_after_dark", "modern_minimal", "bold_social", "classic_bistro",
      "coastal_airy", "warm_neighborhood", "luxury_minimal", "experiential_escape", "creative_workshop",
      "chef_counter", "brunch_social", "fast_casual_polished", "social_games", "family_entertainment",
      "wellness_retreat", "arts_culture", "cinematic_entertainment", "modern_steakhouse", "sushi_modern",
      "tropical_caribbean", "latin_night", "rooftop_city", "garden_terrace", "wine_cellar",
      "craft_brewery", "sports_watch", "jazz_room", "comedy_club", "karaoke_social", "arcade_neon",
      "bowling_luxe", "escape_cinematic", "mini_golf_playful", "museum_modern", "theater_grand",
      "spa_serene", "dessert_bakery", "coffee_roastery", "private_events",
    ];
    for (const id of expected) expect(system).toContain(`${id}:s({`);
  });

  it("varies all major layout systems instead of only palettes", () => {
    const system = source("lib/websites/agency-template-system.ts");
    for (const token of [
      "agency-hero-cinema", "agency-hero-editorial", "agency-hero-mosaic", "agency-hero-poster",
      "agency-nav-rail", "agency-nav-overlay", "agency-nav-floating",
      "agency-gallery-filmstrip", "agency-gallery-masonry", "agency-gallery-polaroid",
      "agency-menu-ledger", "agency-menu-board", "agency-menu-cards",
      "agency-review-marquee", "agency-review-editorial", "agency-review-sidebar",
      "agency-reserve-band", "agency-reserve-dock", "agency-reserve-stage",
    ]) expect(system).toContain(token);
  });

  it("wires agency styles and runtime behavior into every generated html page", () => {
    const artifact = source("lib/websites/content-artifact.ts");
    expect(artifact).toContain("agencyTemplateStyles()");
    expect(artifact).toContain("applyAgencyTemplateSystem");
    expect(artifact).toContain("agencyTemplateScript");
    expect(artifact).toContain('file.path.endsWith(".html")');
  });

  it("preserves body composition classes when building subpages", () => {
    const pages = source("lib/websites/multi-page-artifact.ts");
    expect(pages).toContain("const bodyClass = index.match");
    expect(pages).toContain('class=\\"${bodyClass}\\"');
  });

  it("keeps motion accessible", () => {
    const system = source("lib/websites/agency-template-system.ts");
    expect(system).toContain("prefers-reduced-motion:reduce");
    expect(system).toContain("prefers-reduced-motion: reduce");
  });
});
