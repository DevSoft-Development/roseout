import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) =>
  fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("Business dashboard theme contract", () => {
  it("defines one shared day/night token contract in the Business theme provider", () => {
    const provider = read("apps/business/app/locations/dashboard/BusinessThemeProvider.tsx");
    for (const token of [
      "--business-bg",
      "--business-panel",
      "--business-panel-strong",
      "--business-border",
      "--business-text",
      "--business-soft",
      "--business-muted",
      "--business-sidebar",
    ]) {
      expect(provider).toContain(token);
    }
    expect(provider).toContain("business-theme-light");
    expect(provider).toContain("business-theme-dark");
    expect(provider).toContain("theouthaven_business_theme");
  });

  it("does not redefine the Business theme token contract inside the Location layout", () => {
    const layout = read("apps/business/app/locations/dashboard/layout.tsx");
    expect(layout).not.toContain("--business-bg:");
    expect(layout).not.toContain("--business-panel:");
    expect(layout).toContain("BusinessThemeProvider");
  });

  it("wraps both dashboard families in the same provider", () => {
    expect(read("apps/business/app/locations/dashboard/layout.tsx")).toContain("BusinessThemeProvider");
    const businessLayout = read("apps/business/app/business/dashboard/layout.tsx");
    expect(businessLayout).toContain("BusinessThemeProvider");
    expect(businessLayout).toContain("BusinessThemeToggle");
  });

  it("keeps key owner-facing shells on shared theme tokens", () => {
    const files = [
      "components/growth-pro/GrowthProShell.tsx",
      "components/business/OrganizationSwitcher.tsx",
      "apps/business/app/business/dashboard/billing/page.tsx",
      "apps/business/app/business/dashboard/verification/VerificationWorkspace.tsx",
      "apps/business/app/business/dashboard/menu/MenuEditorClient.tsx",
    ];
    for (const file of files) {
      const source = read(file);
      expect(source).toContain("var(--business-");
    }
  });

  it("uses Essentials+ as the user-facing paid plan name", () => {
    const sources = [
      read("components/growth-pro/GrowthProShell.tsx"),
      read("components/growth-pro/BusinessGrowthProPage.tsx"),
      read("components/growth-pro/PublicGrowthProPage.tsx"),
      read("apps/business/app/business/dashboard/billing/page.tsx"),
      read("apps/business/app/locations/dashboard/billing/page.tsx"),
      read("apps/business/app/locations/dashboard/billing/cancel/page.tsx"),
      read("apps/business/app/locations/dashboard/LocationsDashboardClient.tsx"),
    ].join("\n");
    expect(sources).toContain("Essentials+");
    expect(sources).not.toContain("Partner Pro");
    expect(sources).not.toContain("Reserve Pro");
    expect(sources).not.toContain("TheOutHaven Growth Pro");
  });
});
