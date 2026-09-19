import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const nav = readFileSync(
  "app/locations/dashboard/CanonicalLocationModuleNav.tsx",
  "utf8",
);
const appShell = readFileSync("components/AppShell.tsx", "utf8");
const layout = readFileSync("app/locations/dashboard/layout.tsx", "utf8");

describe("location workspace E2E navigation", () => {
  it("keeps the 17 primary owner workspaces inside the location dashboard shell", () => {
    const primaryRoutes = [
      "/locations/dashboard",
      "/locations/dashboard/events-experiences",
      "/locations/dashboard/menu",
      "/locations/dashboard/website",
      "/locations/dashboard/messaging",
      "/locations/dashboard/reservations",
      "/locations/dashboard/reservations/large-group-bookings",
      "/locations/dashboard/reservations/settings",
      "/locations/dashboard/profile",
      "/locations/dashboard/business-setup",
      "/locations/dashboard/customers",
      "/locations/dashboard/reviews",
      "/locations/dashboard/marketing-growth",
      "/locations/dashboard/analytics",
      "/locations/dashboard/billing",
      "/locations/dashboard/support",
      "/locations/dashboard/settings",
    ];
    for (const route of primaryRoutes) expect(nav).toContain(`href: "${route}"`);
    expect(nav.match(/\bicon: [A-Z]/g) || []).toHaveLength(17);
  });

  it("keeps consolidated child tools reachable and highlights their parent hubs", () => {
    for (const route of [
      "/locations/dashboard/branding",
      "/locations/dashboard/domains",
      "/locations/dashboard/qr-codes",
      "/locations/dashboard/leads",
      "/locations/dashboard/offers",
      "/locations/dashboard/vip",
      "/locations/dashboard/notifications",
      "/locations/dashboard/marketing-studio",
      "/locations/dashboard/social-accounts",
      "/locations/dashboard/promotions",
    ]) {
      expect(nav).toContain(route);
    }
    expect(nav).toContain("matches?: string[]");
  });

  it("does not send location workspace navigation into the business dashboard shell", () => {
    expect(nav).not.toContain('href: "/business/dashboard/');
  });

  it("owns its chrome instead of overlapping the public site header", () => {
    expect(appShell).toContain('pathname?.startsWith("/locations/dashboard")');
    expect(appShell).toContain("isLocationDashboard");
    expect(layout).toContain("padding-top: 0 !important");
    expect(layout).toContain("header.sticky");
    expect(nav).toContain('className="sticky top-0 hidden h-screen w-[248px]');
  });

  it("uses phone drawer, tablet rail, and desktop sidebar breakpoints", () => {
    expect(nav).toContain("md:flex xl:hidden");
    expect(nav).toContain("md:hidden");
    expect(nav).toContain("xl:flex");
    expect(nav).toContain('aria-label="Open location workspace navigation"');
    expect(nav).toContain('className="grid h-11 w-11 shrink-0');
    expect(layout).toContain("md:flex");
  });

  it("keeps the full sidebar scrollable instead of clipping lower menu items", () => {
    expect(nav).toContain("min-h-0 flex-1 overflow-y-auto");
    expect(nav).toContain("overscroll-contain");
    expect(nav).toContain("[scrollbar-gutter:stable]");
    expect(nav).toContain("overflow-hidden border-r");
  });

  it("preserves location/demo context but drops page-specific tab state", () => {
    expect(nav).toContain("useSearchParams");
    expect(nav).toContain("searchParams.toString()");
    expect(nav).toContain("buildDestination");
    expect(nav).toContain('params.delete("tab")');
    expect(nav).toContain('params.delete("section")');
    expect(nav).toContain('params.delete("host")');
  });
});
