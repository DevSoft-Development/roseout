import fs from "node:fs";
import path from "node:path";

describe("premium hosted website renderer", () => {
  const source = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

  it("extends the existing enhanced artifact renderer rather than replacing it", () => {
    const artifact = source("lib/websites/content-artifact.ts");
    expect(artifact).toContain("renderWebsiteArtifact");
    expect(artifact).toContain("routeGeneratedReservationArtifact");
    expect(artifact).toContain("premiumWebsiteStyles");
  });

  it("styles current menu, offerings, gallery, and reservations from shared theme variables", () => {
    const premium = source("lib/websites/premium-theme-artifact.ts");
    expect(premium).toContain("var(--accent)");
    expect(premium).toContain("var(--display)");
    expect(premium).toContain(".toh-menu-item");
    expect(premium).toContain(".toh-offering");
    expect(premium).toContain(".toh-gallery-grid");
    expect(premium).toContain(".reservation-native-shell");
  });

  it("applies premium atmosphere globally before composition-specific treatment", () => {
    const premium = source("lib/websites/premium-theme-artifact.ts");
    expect(premium).toContain(".site-nav{top:14px");
    expect(premium).toContain(".hero{min-height:clamp(700px");
    expect(premium).toContain(".hero-split,.hero-framed,.hero-playful,.hero-reservation");
    expect(premium).toContain(".content-section:nth-of-type(even)");
    expect(premium).toContain(".reservation-section{background:linear-gradient");
    expect(premium).toContain(".gallery-stage{border-radius:clamp(22px");
  });

  it("keeps major composition families visually distinct", () => {
    const premium = source("lib/websites/premium-theme-artifact.ts");
    for (const id of ["editorial_luxury", "refined_after_dark", "modern_minimal", "bold_social", "luxury_minimal", "experiential_escape"]) {
      expect(premium).toContain(`.composition-${id}`);
    }
  });

  it("keeps the premium layout responsive on tablet and mobile", () => {
    const premium = source("lib/websites/premium-theme-artifact.ts");
    expect(premium).toContain("@media(max-width:980px)");
    expect(premium).toContain("@media(max-width:820px)");
    expect(premium).toContain("grid-template-columns:1fr!important");
  });

  it("respects reduced-motion preferences", () => {
    expect(source("lib/websites/premium-theme-artifact.ts")).toContain("prefers-reduced-motion");
  });
});
