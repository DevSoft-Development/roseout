import { describe, expect, it } from "vitest";
import { buildLocationEditorLinks } from "@/lib/location-editor-links";

function query(href: string) {
  return new URL(href, "https://example.test").searchParams;
}

describe("buildLocationEditorLinks", () => {
  it("uses canonical IDs for dashboard, admin, business, and reserve tools", () => {
    const links = buildLocationEditorLinks({
      type: "restaurants",
      locationId: "route_789",
      canonicalId: "loc_123",
      sourceId: "rest_456",
      effectiveId: "rest_456",
    });

    expect(query(links.menuEditor).get("adminLocationId")).toBe("loc_123");
    expect(query(links.menuEditor).get("locationId")).toBe("loc_123");
    expect(query(links.qrTools).get("adminLocationId")).toBe("loc_123");
    expect(query(links.reserveDashboard).get("adminLocationId")).toBe("loc_123");
    expect(links.crm).toBe("/admin/dashboard/crm/loc_123");
    expect(links.adminQrTools).toContain("locationId=loc_123");
    expect(links.publicPage).toBe("/locations/restaurants/rest_456");
  });

  it("uses canonical IDs everywhere when no source ID exists", () => {
    const links = buildLocationEditorLinks({
      type: "activities",
      locationId: "route_789",
      canonicalId: "loc_123",
    });

    expect(query(links.analytics).get("locationId")).toBe("loc_123");
    expect(links.crm).toBe("/admin/dashboard/crm/loc_123");
    expect(links.publicPage).toBe("/locations/activities/loc_123");
  });

  it("falls back safely to route location ID", () => {
    const links = buildLocationEditorLinks({
      type: "restaurants",
      locationId: "route_789",
    });

    expect(query(links.settings).get("adminLocationId")).toBe("route_789");
    expect(links.crm).toBe("/admin/dashboard/crm/route_789");
    expect(links.adminQrTools).toContain("locationId=route_789");
  });
});
