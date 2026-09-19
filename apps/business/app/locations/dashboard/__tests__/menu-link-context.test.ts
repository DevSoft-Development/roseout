import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("location dashboard menu workspace", () => {
  it("routes Menu / Packages to the canonical location workspace", () => {
    const nav = readFileSync(
      "app/locations/dashboard/CanonicalLocationModuleNav.tsx",
      "utf8",
    );
    expect(nav).toContain(
      '{ label: "Menu / Packages", href: "/locations/dashboard/menu"',
    );
  });

  it("uses the production menu editor instead of the generic module placeholder", () => {
    const page = readFileSync(
      "app/locations/dashboard/menu/page.tsx",
      "utf8",
    );
    expect(page).toContain("getEditableLocationMenu");
    expect(page).toContain("MenuEditorClient");
    expect(page).toContain("resolveEditableLocationContext");
    expect(page).toContain("getInternalDemoLocationAccess");
  });
});
