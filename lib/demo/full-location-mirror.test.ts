import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { INTERNAL_DEMO_ROLES, isInternalDemoRole } from "@/lib/demo/internal-demo-access";

const launchpad = readFileSync(
  "app/internal/demo/theouthaven-lounge/page.tsx",
  "utf8",
);
const demoRoute = readFileSync(
  "app/api/admin/demo/theouthaven-lounge/route.ts",
  "utf8",
);
const reservationRoute = readFileSync(
  "app/api/reserve/location/route.ts",
  "utf8",
);

describe("TheOutHaven Lounge full-location mirror", () => {
  it("limits the internal mirror to the approved signed-in staff roles", () => {
    expect([...INTERNAL_DEMO_ROLES]).toEqual(
      expect.arrayContaining([
        "superadmin",
        "admin",
        "ambassador",
        "partner_ambassador",
        "experience",
      ]),
    );
    expect(isInternalDemoRole("sales_rep")).toBe(true);
    expect(isInternalDemoRole("support")).toBe(true);
    expect(isInternalDemoRole("partner_ambassador")).toBe(true);
    expect(isInternalDemoRole("user")).toBe(false);
    expect(isInternalDemoRole("owner")).toBe(false);
    expect(isInternalDemoRole("viewer")).toBe(false);
  });

  it("keeps the fixture hidden while exposing authenticated real-flow links", () => {
    expect(demoRoute).toContain("is_searchable: false");
    expect(demoRoute).toContain("is_hidden: true");
    expect(demoRoute).toContain("demo_visible_publicly: false");
    expect(demoRoute).toContain("publish_ready: false");
    expect(demoRoute).toContain('fullMirrorHref: "/internal/demo/theouthaven-lounge"');
  });

  it("launches the real production surfaces instead of demo-only replacements", () => {
    for (const route of [
      "/locations/restaurant/",
      "/reserve/location/",
      "/reserve/dashboard",
      "/locations/dashboard",
      "/business/dashboard/menu",
      "/business/dashboard/qr-codes",
      "/business/dashboard/analytics",
      "/business/dashboard/marketing-studio",
      "/business/dashboard/vip",
      "/feedback",
      "/check-in",
    ]) {
      expect(launchpad).toContain(route);
    }
  });

  it("uses the production reservation pipeline for notifications and analytics", () => {
    expect(reservationRoute).toContain("notifyReservation");
    expect(reservationRoute).toContain("trackLocationAnalyticsEvent");
    expect(reservationRoute).toContain("sendReservationSms");
    expect(reservationRoute).toContain("sendRawBrandedEmail");
  });
});
