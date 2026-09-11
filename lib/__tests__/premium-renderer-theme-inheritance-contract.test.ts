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

  it("keeps major composition families visually distinct", () => {
    const premium = source("lib/websites/premium-theme-artifact.ts");
    for (const id of ["editorial_luxury", "refined_after_dark", "modern_minimal", "bold_social", "luxury_minimal", "experiential_escape"]) {
      expect(premium).toContain(`.composition-${id}`);
    }
  });

  it("respects reduced-motion preferences", () => {
    expect(source("lib/websites/premium-theme-artifact.ts")).toContain("prefers-reduced-motion");
  });
});
