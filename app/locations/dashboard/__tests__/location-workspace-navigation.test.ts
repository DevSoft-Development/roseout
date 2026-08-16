import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const nav = readFileSync(
  "app/locations/dashboard/CanonicalLocationModuleNav.tsx",
  "utf8",
);
const appShell = readFileSync("components/AppShell.tsx", "utf8");
const layout = readFileSync("app/locations/dashboard/layout.tsx", "utf8");

describe("location workspace E2E navigation", () => {
  it("keeps location workspace navigation inside the location dashboard shell", () => {
    for (const route of [
      "/locations/dashboard/reservations",
      "/locations/dashboard/menu",
      "/locations/dashboard/website",
      "/locations/dashboard/messaging",
      "/locations/dashboard/analytics",
      "/locations/dashboard/profile",
      "/locations/dashboard/branding",
      "/locations/dashboard/domains",
      "/locations/dashboard/qr-codes",
      "/locations/dashboard/leads",
      "/locations/dashboard/offers",
      "/locations/dashboard/vip",
      "/locations/dashboard/notifications",
      "/locations/dashboard/reviews",
      "/locations/dashboard/marketing-studio",
      "/locations/dashboard/promotions",
      "/locations/dashboard/billing",
      "/locations/dashboard/settings",
    ]) {
      expect(nav).toContain(route);
    }
  });

  it("does not send location workspace navigation into the business dashboard shell", () => {
    expect(nav).not.toContain('href: "/business/dashboard/');
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
    expect(nav).toContain("buildDestination");
    expect(nav).toContain('params.set("tab", item.tab)');
  });
});
