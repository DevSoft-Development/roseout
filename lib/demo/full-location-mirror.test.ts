import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  INTERNAL_DEMO_ROLES,
  isInternalDemoRole,
} from "@/lib/demo/internal-demo-access";

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
const locationDashboard = readFileSync(
  "app/locations/dashboard/page.tsx",
  "utf8",
);
const menuPage = readFileSync(
  "app/business/dashboard/menu/page.tsx",
  "utf8",
);
const menuClient = readFileSync(
  "app/business/dashboard/menu/MenuEditorClient.tsx",
  "utf8",
);
const marketingPage = readFileSync(
  "app/business/dashboard/marketing-studio/page.tsx",
  "utf8",
);
const growthProPage = readFileSync(
  "components/growth-pro/BusinessGrowthProPage.tsx",
  "utf8",
);
const demoActions = readFileSync(
  "app/admin/dashboard/settings/demo-center/actions.ts",
  "utf8",
);
const demoScope = readFileSync(
  "supabase/functions/_shared/demoReservationScope.ts",
  "utf8",
);
const reminderCron = readFileSync(
  "supabase/functions/reservation-reminder-cron/index.ts",
  "utf8",
);
const cleanupCron = readFileSync(
  "supabase/functions/reservation-status-cleanup/index.ts",
  "utf8",
);
const digestCron = readFileSync(
  "supabase/functions/reservation-daily-digest/index.ts",
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
    expect(demoRoute).toContain(
      'fullMirrorHref: "/internal/demo/theouthaven-lounge"',
    );
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

  it("keeps the demo location admin on the production Location Dashboard implementation", () => {
    expect(launchpad).toContain('context("/locations/dashboard")');
    expect(locationDashboard).toContain("LocationsDashboardClient");
    expect(locationDashboard).toContain("parseDemoOwnerParams");
    expect(locationDashboard).toContain("requireDemoOwnerLocation");
    expect(locationDashboard).not.toContain("TheOutHavenLoungeMirrorPage");
  });

  it("keeps menu CRUD on the real production editor and API", () => {
    expect(menuPage).toContain("resolveEditableLocationContext");
    expect(menuPage).toContain("getEditableLocationMenu");
    expect(menuPage).toContain("MenuEditorClient");
    expect(menuClient).toContain('fetch("/api/business/menu"');
    expect(menuClient).toContain('action: "create_section"');
    expect(menuClient).toContain('action: "create_item"');
    expect(menuClient).toContain('action: "update_item"');
    expect(menuClient).toContain('action: "delete_item"');
    expect(menuClient).toContain('action === "publish_page"');
  });

  it("keeps marketing, offers, VIP, analytics, and related modules on shared Growth Pro production surfaces", () => {
    expect(marketingPage).toContain('BusinessGrowthProPage module="marketing-studio"');
    expect(growthProPage).toContain("requireDemoOwnerLocation");
    expect(growthProPage).toContain("buildDemoOwnerHref");
    expect(growthProPage).toContain('"marketing-studio"');
    expect(growthProPage).toContain('offers:{title:"Offers"');
    expect(growthProPage).toContain('vip:{title:"VIP List"');
    expect(growthProPage).toContain('analytics:{title:"Analytics"');
    expect(growthProPage).toContain('demo.demoMode?"Growth Pro / Demo"');
  });

  it("uses the production reservation pipeline for notifications and analytics", () => {
    expect(reservationRoute).toContain("notifyReservation");
    expect(reservationRoute).toContain("trackLocationAnalyticsEvent");
    expect(reservationRoute).toContain("sendReservationSms");
    expect(reservationRoute).toContain("sendRawBrandedEmail");
  });

  it("uses the canonical location_reservations table for demo reservation operations", () => {
    expect(demoActions).toContain('.from("location_reservations")');
    expect(demoActions).toContain(
      "Demo reservation request created in the real reservation table.",
    );
    expect(demoActions).toContain('.eq("location_id", location.id)');
  });

  it("runs maintenance through the production Edge Functions with strict demo scope", () => {
    expect(demoActions).toContain('"reservation-reminder-cron"');
    expect(demoActions).toContain('"reservation-status-cleanup"');
    expect(demoActions).toContain('"reservation-daily-digest"');
    expect(demoActions).toContain("demoOnly: true");
    expect(demoActions).toContain("demoLocationId: String(location.id)");
    expect(demoActions).toContain('headers: { "x-cron-secret": cronSecret }');

    expect(demoScope).toContain('MIRROR_DEMO_KEY = "real_location_mirror_demo"');
    expect(demoScope).toContain("body?.demoOnly !== true");
    expect(demoScope).toContain("data.is_searchable === true");
    expect(demoScope).toContain("data.is_hidden !== true");

    for (const source of [reminderCron, cleanupCron, digestCron]) {
      expect(source).toContain("resolveDemoReservationScope");
      expect(source).toContain("demoLocationId");
    }

    expect(reminderCron).toContain('.eq("location_id", demoLocationId)');
    expect(reminderCron).toContain('.eq("location_id", reminder.location_id)');
    expect(cleanupCron).toContain('updateQuery = updateQuery.eq("location_id", demoLocationId)');
    expect(cleanupCron).toContain('lockDelete = lockDelete.eq("location_id", demoLocationId)');
    expect(digestCron).toContain('.eq("location_id", demoLocationId)');
    expect(digestCron).toContain("admin@theouthaven.com");
  });

  it("does not report fake customer or owner notification success", () => {
    expect(demoActions).toContain(
      "Use the real reservation booking flow to test customer confirmation.",
    );
    expect(demoActions).toContain(
      "Use the real reservation booking flow to test owner notification.",
    );
    expect(demoActions).not.toContain(
      "Demo customer confirmation queued for safe demo recipients.",
    );
    expect(demoActions).not.toContain(
      "Demo owner notification queued for demo-reservations@theouthaven.com.",
    );
  });
});
