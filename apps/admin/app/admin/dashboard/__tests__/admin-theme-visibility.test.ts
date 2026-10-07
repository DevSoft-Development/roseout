import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const layout = readFileSync("apps/admin/app/admin/dashboard/layout.tsx", "utf8");
const shellCss = readFileSync("apps/admin/app/admin/dashboard/admin-shell.css", "utf8");
const visibilityCss = readFileSync("apps/admin/app/admin/dashboard/admin-theme-visibility.css", "utf8");
const combinedCss = `${shellCss}\n${visibilityCss}`;

describe("isolated admin light/dark visibility", () => {
  it("loads the focused visibility guardrail after the shared shell stylesheet", () => {
    expect(layout).toContain('import "./admin-shell.css"');
    expect(layout).toContain('import "./admin-theme-visibility.css"');
    expect(layout.indexOf('admin-theme-visibility.css')).toBeGreaterThan(layout.indexOf('admin-shell.css'));
  });

  it("defines explicit readable tokens for both appearance modes", () => {
    expect(visibilityCss).toContain('[data-admin-theme="light"]');
    expect(visibilityCss).toContain('[data-admin-theme="dark"]');
    expect(visibilityCss).toContain("--admin-shell-text");
    expect(visibilityCss).toContain("--admin-shell-soft");
    expect(visibilityCss).toContain("--admin-shell-muted");
  });

  it("keeps the performance guardrail free of broad class substring matching", () => {
    expect(visibilityCss).not.toContain('[class*=');
    expect((visibilityCss.match(/\.admin-enterprise-surface/g) || []).length).toBeLessThan(40);
  });

  it("normalizes the recurring gray overlay utilities with exact selectors", () => {
    for (const selector of [
      ".bg-black\\/20",
      ".bg-black\\/25",
      ".bg-black\\/30",
      ".bg-zinc-950",
      ".bg-neutral-950",
      ".bg-white\\/10",
      ".bg-white\\/\\[0\\.04\\]",
      ".bg-white\\/\\[0\\.08\\]",
    ]) {
      expect(visibilityCss).toContain(selector);
    }
  });

  it("keeps the shared shell responsible for common legacy information surfaces", () => {
    for (const selector of [
      "input",
      "textarea",
      "select",
      "table",
      "thead",
      "th",
      '[class*="bg-[#0"]',
      '[class*="bg-black/"]',
      '[class*="text-white/"]',
    ]) {
      expect(shellCss).toContain(selector);
    }
  });

  it("keeps red, blue, and muted overlay text readable in light mode", () => {
    expect(visibilityCss).toContain(".text-rose-100");
    expect(visibilityCss).toContain(".text-red-100");
    expect(visibilityCss).toContain(".text-sky-100");
    expect(visibilityCss).toContain(".text-white\\/55");
  });

  it("preserves interaction visibility across the combined theme layers", () => {
    expect(combinedCss).toContain('[aria-disabled="true"]');
    expect(combinedCss).toContain(":focus-visible");
  });
});


describe("Admin route CSS consolidation", () => {
  const routePages = [
    "apps/admin/app/admin/dashboard/search-benchmark/page.tsx",
    "apps/admin/app/admin/dashboard/launch-checklist/page.tsx",
    "apps/admin/app/admin/dashboard/settings/domain-benefit/page.tsx",
    "apps/admin/app/admin/dashboard/settings/email-qa/page.tsx",
    "apps/admin/app/admin/dashboard/marketing/reports/page.tsx",
    "apps/admin/app/admin/dashboard/settings/microsoft-365/page.tsx",
    "apps/admin/app/admin/dashboard/security/apple-devices/page.tsx",
  ];

  it("keeps route pages on the shared Admin stylesheet", () => {
    for (const path of routePages) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toMatch(/import\s+["'][^"']+\.css["']/);
    }
  });

  it("keeps consolidated route selectors in the global theme layer", () => {
    for (const selector of [
      ".search-benchmark-page",
      ".launch-checklist-page",
      ".domain-benefit-page",
      ".email-qa-page",
      ".marketing-intelligence-theme",
      ".m365-page",
      ".apple-page",
    ]) {
      expect(css).toContain(selector);
    }
  });
});
