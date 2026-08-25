import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  DEFAULT_ADMIN_APPEARANCE,
  normalizeAdminAppearance,
  resolveAdminTheme,
} from "@/lib/admin-appearance";

describe("admin appearance", () => {
  it("uses light mode during the default daytime window", () => {
    expect(resolveAdminTheme(DEFAULT_ADMIN_APPEARANCE, new Date(2026, 7, 25, 10, 50))).toBe("light");
    expect(resolveAdminTheme(DEFAULT_ADMIN_APPEARANCE, new Date(2026, 7, 25, 18, 59))).toBe("light");
  });

  it("uses dark mode outside the default daytime window", () => {
    expect(resolveAdminTheme(DEFAULT_ADMIN_APPEARANCE, new Date(2026, 7, 25, 6, 59))).toBe("dark");
    expect(resolveAdminTheme(DEFAULT_ADMIN_APPEARANCE, new Date(2026, 7, 25, 19, 0))).toBe("dark");
  });

  it("supports overnight light windows and explicit overrides", () => {
    const overnight = { mode: "auto" as const, lightStart: "19:00", darkStart: "07:00" };
    expect(resolveAdminTheme(overnight, new Date(2026, 7, 25, 22, 0))).toBe("light");
    expect(resolveAdminTheme(overnight, new Date(2026, 7, 25, 12, 0))).toBe("dark");
    expect(resolveAdminTheme({ ...overnight, mode: "light" }, new Date(2026, 7, 25, 2, 0))).toBe("light");
    expect(resolveAdminTheme({ ...overnight, mode: "dark" }, new Date(2026, 7, 25, 12, 0))).toBe("dark");
  });

  it("sanitizes invalid persisted settings", () => {
    expect(normalizeAdminAppearance({ mode: "purple", lightStart: "99:00", darkStart: null })).toEqual(DEFAULT_ADMIN_APPEARANCE);
  });

  it("wires the appearance provider, settings controls, and legacy contrast bridge", () => {
    const layout = readFileSync("app/admin/layout.tsx", "utf8");
    const provider = readFileSync("app/admin/AdminAppearanceProvider.tsx", "utf8");
    const settings = readFileSync("app/admin/dashboard/settings/AdminAppearanceSettings.tsx", "utf8");
    const css = readFileSync("app/admin/admin-appearance.css", "utf8");

    expect(layout).toContain("AdminAppearanceProvider");
    expect(layout).toContain('import "./admin-appearance.css"');
    expect(provider).toContain("data-admin-theme");
    expect(provider).toContain("60_000");
    expect(settings).toContain('id: "auto"');
    expect(settings).toContain('type="time"');
    expect(css).toContain('[data-admin-theme="light"]');
    expect(css).toContain('[class*="text-white/"]');
    expect(css).toContain('[class*="border-white/"]');
    expect(css).toContain('[class*="bg-[radial-gradient("]');
  });
});
