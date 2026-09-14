import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const renderer = fs.readFileSync(path.join(process.cwd(), "lib/websites/bespoke-premium-renderer.ts"), "utf8");
const artifact = fs.readFileSync(path.join(process.cwd(), "lib/websites/content-artifact.ts"), "utf8");

describe("bespoke premium hosted website renderer", () => {
  it("uses the bespoke renderer instead of the legacy shared static shell", () => {
    expect(artifact).toContain("renderBespokePremiumWebsiteArtifact");
    expect(artifact).not.toContain("renderWebsiteArtifact(baseWebsite");
    expect(artifact).not.toContain("applyAgencyTemplateSystem");
  });

  it("ships genuinely different markup archetypes rather than CSS-only signatures", () => {
    for (const archetype of [
      "editorial",
      "cinematic",
      "culinary",
      "social",
      "serene",
      "poster",
      "experience",
      "panorama",
      "neighborhood",
      "minimal",
    ]) {
      expect(renderer).toContain(`\"${archetype}\"`);
      expect(renderer).toContain(`hero-${archetype}`);
    }
  });

  it("keeps premium content modules in the bespoke document", () => {
    for (const id of ["story", "gallery", "menu", "events-experiences", "reviews", "reserve", "visit", "hours"]) {
      expect(renderer).toContain(`id=\\\"${id}`);
    }
  });

  it("uses multiple real location photos in art-directed hero systems", () => {
    expect(renderer).toContain("social-collage");
    expect(renderer).toContain("experience-grid");
    expect(renderer).toContain("editorial-detail");
    expect(renderer).toContain("p1=p[1]");
    expect(renderer).toContain("p2=p[2]");
  });

  it("retains the downstream production pipeline", () => {
    expect(artifact).toContain("routeGeneratedReservationArtifact");
    expect(artifact).toContain("addGeneratedWebsitePages");
    expect(artifact).toContain("addMigrationRedirectArtifacts");
    expect(artifact).toContain("enhanceWebsiteSeoAccessibility");
  });
});
