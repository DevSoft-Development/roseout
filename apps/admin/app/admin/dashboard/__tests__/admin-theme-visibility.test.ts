import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const layout = readFileSync("apps/admin/app/admin/dashboard/layout.tsx", "utf8");
const css = readFileSync("apps/admin/app/admin/dashboard/admin-theme-visibility.css", "utf8");

describe("isolated admin light/dark visibility", () => {
  it("loads the visibility guardrail after the shared shell stylesheet", () => {
    expect(layout).toContain('import "./admin-shell.css"');
    expect(layout).toContain('import "./admin-theme-visibility.css"');
    expect(layout.indexOf('admin-theme-visibility.css')).toBeGreaterThan(layout.indexOf('admin-shell.css'));
  });

  it("defines explicit readable tokens for both appearance modes", () => {
    expect(css).toContain('[data-admin-theme="light"]');
    expect(css).toContain('[data-admin-theme="dark"]');
    expect(css).toContain("--admin-shell-text");
    expect(css).toContain("--admin-shell-soft");
    expect(css).toContain("--admin-shell-muted");
  });

  it("normalizes legacy light and dark surfaces in both directions", () => {
    for (const selector of [
      ".bg-white",
      ".bg-black",
      ".bg-neutral-950",
      ".bg-slate-950",
      ".bg-gray-950",
      '[class*="bg-white/"]',
      '[class*="bg-black/"]',
      '[class*="bg-[#0"]',
      '[class*="bg-[#1"]',
      '[class*="bg-[#2"]',
    ]) {
      expect(css).toContain(selector);
    }
  });

  it("protects common information surfaces and interaction states", () => {
    for (const selector of [
      "input,textarea,select",
      "table",
      "thead",
      "th",
      "pre,code,kbd",
      '[role="dialog"]',
      '[role="menu"]',
      '[role="listbox"]',
      '[aria-disabled="true"]',
      ":focus-visible",
    ]) {
      expect(css).toContain(selector);
    }
  });

  it("keeps semantic status text readable in light mode", () => {
    expect(css).toContain(".text-emerald-100");
    expect(css).toContain(".text-amber-100");
    expect(css).toContain(".text-rose-100");
    expect(css).toContain(".text-sky-100");
  });
});
