import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("admin appearance settings source contract", () => {
  it("keeps automatic, light, dark, and configurable transition controls available", () => {
    const source = readFileSync("app/admin/dashboard/settings/AdminAppearanceSettings.tsx", "utf8");
    for (const mode of ["auto", "light", "dark"]) expect(source).toContain(`id: "${mode}"`);
    expect(source).toContain("Light mode starts");
    expect(source).toContain("Dark mode starts");
    expect(source).toContain("ADMIN_APPEARANCE_STORAGE_KEY");
    expect(source).toContain("ADMIN_APPEARANCE_EVENT");
  });
});
