import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("enterprise Business dashboard migration", () => {
  it("uses the clean shared light palette", () => {
    const source = readFileSync(
      "apps/business/app/locations/dashboard/BusinessThemeProvider.tsx",
      "utf8",
    );
    expect(source).toContain("--business-bg: #f7f8fa");
    expect(source).toContain("--business-panel: #ffffff");
    expect(source).toContain("--business-text: #151821");
  });

  it("migrates Growth Pro surfaces to enterprise classes", () => {
    const source = readFileSync(
      "components/growth-pro/BusinessGrowthProPage.tsx",
      "utf8",
    );
    expect(source).toContain("business-ui-card");
    expect(source).toContain("business-growth-stat");
    expect(source).toContain("business-ui-action-tile");
  });

  it("keeps organization switching on semantic business tokens", () => {
    const source = readFileSync(
      "components/business/OrganizationSwitcher.tsx",
      "utf8",
    );
    expect(source).toContain("var(--toh-brand-border)");
    expect(source).toContain("var(--business-panel)");
  });
});
