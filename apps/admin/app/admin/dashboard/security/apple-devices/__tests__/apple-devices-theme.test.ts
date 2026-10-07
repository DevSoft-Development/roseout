import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  "apps/admin/app/admin/dashboard/security/apple-devices/page.tsx",
  "utf8",
);
const css = readFileSync(
  "apps/admin/app/admin/dashboard/security/apple-devices/apple-devices.css",
  "utf8",
);

describe("Apple Devices admin theme", () => {
  it("loads its route stylesheet", () => {
    expect(page).toContain('import "./apple-devices.css"');
  });

  it("uses Admin theme tokens instead of forcing a permanent dark palette", () => {
    expect(css).toContain("var(--admin-shell-card)");
    expect(css).toContain("var(--admin-shell-text)");
    expect(css).toContain("var(--admin-shell-soft)");
    expect(css).toContain("var(--admin-shell-border)");
    expect(css).not.toContain(".apple-page{color:#fff}");
    expect(css).not.toContain("background:#120d0b");
  });

  it("defines explicit light and dark mode tuning", () => {
    expect(css).toContain('.admin-shell[data-admin-theme="light"] .apple-page');
    expect(css).toContain('.admin-shell[data-admin-theme="dark"] .apple-alert');
    expect(css).toContain("#9f1239");
    expect(css).toContain("#fda4af");
  });
});
