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
    expect(cleanupCron).toContain('.eq("location_id", demoLocationId)');
    expect(digestCron).toContain('.eq("location_id", demoLocationId)');
    expect(digestCron).toContain("demo-reservations@theouthaven.com");
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
