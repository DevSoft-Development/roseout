import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const adminLayout = readFileSync("app/admin/layout.tsx", "utf8");
const routeFixes = readFileSync("app/admin/admin-appearance-route-fixes.css", "utf8");
const marketingLayout = readFileSync("app/admin/dashboard/marketing/layout.tsx", "utf8");

const auditedRoutes = [
  "app/admin/dashboard/payouts/page.tsx",
  "app/admin/dashboard/ticket-orders/page.tsx",
  "app/admin/dashboard/crm/today/page.tsx",
  "app/admin/dashboard/crm/outreach/page.tsx",
  "app/admin/dashboard/marketing/page.tsx",
  "app/admin/dashboard/careers/pipeline/page.tsx",
  "app/admin/dashboard/operations/mailing-batches/page.tsx",
  "app/admin/dashboard/search-health/page.tsx",
  "app/admin/dashboard/settings/location-tools/page.tsx",
  "app/admin/dashboard/settings/location-tools/google-discovery/page.tsx",
  "app/admin/dashboard/production/page.tsx",
  "app/admin/dashboard/team/page.tsx",
  "app/admin/dashboard/settings/cron-jobs/page.tsx",
  "app/admin/dashboard/roles/page.tsx",
];

const marketingRoutes = [
  "app/admin/dashboard/marketing/today/page.tsx",
  "app/admin/dashboard/marketing/content/page.tsx",
  "app/admin/dashboard/marketing/opportunities/page.tsx",
  "app/admin/dashboard/marketing/calendar/page.tsx",
  "app/admin/dashboard/marketing/media/page.tsx",
  "app/admin/dashboard/marketing/approvals/page.tsx",
];

describe("admin route theme cleanup", () => {
  it("loads the post-audit appearance compatibility layer globally", () => {
    expect(adminLayout).toContain('import "./admin-appearance-route-fixes.css"');
  });

  it("keeps every reported admin route in the audited contract", () => {
    for (const path of auditedRoutes) {
      expect(readFileSync(path, "utf8").length).toBeGreaterThan(0);
    }
  });

  it("covers the one-off charcoal surfaces found in the reported routes", () => {
    for (const token of [
      "#0b0d10",
      "#0e0e11",
      "#0d0d0f",
      "#080706",
      "#080407",
      "#100d0c",
      "#15100c",
      "#111",
      "#111111",
      "#0b0b0c",
      "#140707",
      "#0f0f12",
      "#171717",
    ]) {
      expect(routeFixes).toContain(token);
    }
  });

  it("themes the whole marketing workspace through one nested layout", () => {
    expect(marketingLayout).toContain("admin-marketing-workspace");
    for (const path of marketingRoutes) {
      expect(readFileSync(path, "utf8").length).toBeGreaterThan(0);
    }
    for (const selector of [
      ".admin-marketing-workspace .bg-white",
      ".admin-marketing-workspace .bg-neutral-50",
      ".admin-marketing-workspace .bg-neutral-950",
      ".admin-marketing-workspace .text-neutral-950",
      ".admin-marketing-workspace .text-neutral-600",
      ".admin-marketing-workspace input",
    ]) {
      expect(routeFixes).toContain(selector);
    }
  });
});
