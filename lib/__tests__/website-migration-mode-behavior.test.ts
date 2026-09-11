import { describe, expect, it } from "vitest";
import {
  applyMigrationSections,
  migrationPromptContext,
  normalizeWebsiteMigrationMode,
  resolveMigrationDirection,
} from "@/lib/websites/migration-mode";
import type { WebsiteSection } from "@/lib/websites/data";

describe("website migration mode behavior", () => {
  it("normalizes stored migration modes safely", () => {
    expect(normalizeWebsiteMigrationMode("preserve_exact")).toBe("preserve_exact");
    expect(normalizeWebsiteMigrationMode("redesign")).toBe("redesign");
    expect(normalizeWebsiteMigrationMode("modernize")).toBe("modernize");
    expect(normalizeWebsiteMigrationMode("unknown")).toBe("modernize");
  });

  it("locks preserve mode to the existing design direction", () => {
    expect(resolveMigrationDirection({
      mode: "preserve_exact",
      requestedDirectionId: "bold_social",
      existingDirectionId: "classic_bistro",
    })).toBe("classic_bistro");
  });

  it("lets modernize and redesign select a requested premium direction", () => {
    expect(resolveMigrationDirection({ mode: "modernize", requestedDirectionId: "coastal_airy", existingDirectionId: "classic_bistro" })).toBe("coastal_airy");
    expect(resolveMigrationDirection({ mode: "redesign", requestedDirectionId: "refined_after_dark", existingDirectionId: "classic_bistro" })).toBe("refined_after_dark");
  });

  it("keeps owner section structure in preserve mode", () => {
    const existing: WebsiteSection[] = [{ id: "hero", type: "hero", enabled: true }, { id: "menu", type: "menu", enabled: true }];
    const generated: WebsiteSection[] = [{ id: "hero", type: "hero", enabled: true }, { id: "gallery", type: "gallery", enabled: true }];
    expect(applyMigrationSections("preserve_exact", generated, existing)).toEqual(existing);
    expect(applyMigrationSections("modernize", generated, existing)).toEqual(generated);
    expect(applyMigrationSections("redesign", generated, existing)).toEqual(generated);
  });

  it("feeds imported platform, brand and page structure into generation", () => {
    const context = migrationPromptContext({
      mode: "modernize",
      importedProvider: "Wix",
      importedTitle: "Example Restaurant",
      importedThemeColor: "#123456",
      importedPages: ["/menu", "/events", "/contact"],
    });
    expect(context).toContain("Imported platform: Wix");
    expect(context).toContain("Imported brand color: #123456");
    expect(context).toContain("/menu, /events, /contact");
    expect(context).toContain("Retain recognizable brand signals");
  });
});
