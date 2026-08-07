import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("lib/demo/demo-center.ts", "utf8");

describe("TheOutHaven Lounge universal test fixture", () => {
  it("uses the canonical fixture name and identity", () => {
    expect(source).toContain('DEMO_LOCATION_NAME = "TheOutHaven Lounge"');
    expect(source).toContain('MIRROR_DEMO_KEY = "real_location_mirror_demo"');
    expect(source).toContain("universal_test_fixture: true");
  });

  it("stays hidden from public discovery and outreach", () => {
    expect(source).toContain("is_searchable: false");
    expect(source).toContain("is_hidden: true");
    expect(source).toContain("demo_visible_publicly: false");
    expect(source).toContain("publish_ready: false");
    expect(source).toContain("do_not_contact: true");
    expect(source).toContain("profile_manual_lock: true");
  });

  it("keeps live reservation capability off until deliberately enabled", () => {
    expect(source).toContain("reservation_enabled: false");
    expect(source).toContain("internal_reservations_enabled: false");
    expect(source).toContain("uses_internal_reservations: false");
    expect(source).toContain('return "off";');
  });

  it("retains seeded modules for cross-platform testing", () => {
    expect(source).toContain("await seedDemoReservations(locationId)");
    expect(source).toContain("await seedDemoLayout(locationId)");
    expect(source).toContain('"location_offers"');
    expect(source).toContain('"location_vip_signups"');
    expect(source).toContain('"location_analytics_events"');
  });
});
