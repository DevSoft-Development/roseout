import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const nav = readFileSync(
  "app/locations/dashboard/CanonicalLocationModuleNav.tsx",
  "utf8",
);
const appShell = readFileSync("components/AppShell.tsx", "utf8");
const layout = readFileSync("app/locations/dashboard/layout.tsx", "utf8");

describe("location workspace E2E navigation", () => {
  it("routes workspace links to real operational surfaces", () => {
    for (const route of [
      "/reserve/dashboard/reservations",
      "/business/dashboard/menu",
      "/locations/dashboard/website",
      "/business/dashboard/messaging",
      "/business/dashboard/analytics",
      "/business/dashboard/profile",
      "/business/dashboard/branding",
      "/locations/dashboard/domains",
      "/business/dashboard/qr-codes",
      "/business/dashboard/leads",
      "/business/dashboard/offers",
      "/business/dashboard/vip",
      "/business/dashboard/notifications",
      "/business/dashboard/reviews",
      "/business/dashboard/marketing-studio",
      "/business/dashboard/promotions",
      "/business/dashboard/billing",
      "/business/dashboard/settings",
    ]) {
      expect(nav).toContain(route);
    }
  });

  it("does not send module navigation through generic workspace placeholders", () => {
    for (const placeholder of [
      '"/locations/dashboard/reservations"',
      '"/locations/dashboard/menu"',
      '"/locations/dashboard/analytics"',
      '"/locations/dashboard/profile"',
      '"/locations/dashboard/branding"',
      '"/locations/dashboard/qr-codes"',
      '"/locations/dashboard/leads"',
      '"/locations/dashboard/offers"',
      '"/locations/dashboard/vip"',
      '"/locations/dashboard/notifications"',
      '"/locations/dashboard/reviews"',
      '"/locations/dashboard/marketing-studio"',
      '"/locations/dashboard/promotions"',
      '"/locations/dashboard/billing"',
      '"/locations/dashboard/settings"',
    ]) {
      expect(nav).not.toContain(placeholder);
    }
  });

  it("owns its chrome instead of overlapping the public site header", () => {
    expect(appShell).toContain('pathname?.startsWith("/locations/dashboard")');
    expect(appShell).toContain("isLocationDashboard");
    expect(layout).toContain("padding-top: 0 !important");
    expect(layout).toContain("header.sticky");
    expect(nav).toContain('className="sticky top-0 hidden h-screen');
  });

  it("preserves current location and demo query context while navigating", () => {
    expect(nav).toContain("useSearchParams");
    expect(nav).toContain("searchParams.toString()");
    expect(nav).toContain('`${href}?${query}`');
  });
});
