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
      adminContext: true,
    });

    expect(links.hasCanonicalId).toBe(true);
    expect(links.dashboardId).toBe("loc_123");
    expect(query(links.menuEditor).get("adminLocationId")).toBe("loc_123");
    expect(query(links.menuEditor).get("locationId")).toBe("loc_123");
    expect(query(links.menuEditor).get("demo")).toBe("1");
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
      adminContext: false,
    });

    expect(links.hasCanonicalId).toBe(true);
    expect(links.menuEditor).toBe("/business/dashboard/menu");
    expect(query(links.menuEditor).has("adminLocationId")).toBe(false);
    expect(links.qrTools).toBe("/business/dashboard/qr-codes");
    expect(query(links.qrTools).has("demo")).toBe(false);
    expect(links.analytics).toBe("/business/dashboard/analytics");
    expect(query(links.analytics).has("locationId")).toBe(false);
    expect(links.crm).toBe("/admin/dashboard/crm/loc_123");
    expect(links.publicPage).toBe("/locations/activities/loc_123");
  });

  it("marks dashboard links as repair-needed when no canonical ID exists", () => {
    const links = buildLocationEditorLinks({
      type: "restaurants",
      locationId: "route_789",
      sourceId: "rest_456",
      effectiveId: "rest_456",
      adminContext: true,
    });

    expect(links.hasCanonicalId).toBe(false);
    expect(links.dashboardId).toBe("route_789");
    expect(query(links.settings).get("adminLocationId")).toBe("route_789");
    expect(links.crm).toBe("/admin/dashboard/crm/route_789");
    expect(links.adminQrTools).toContain("locationId=route_789");
  });

  it("keeps public links on the source ID when available", () => {
    const links = buildLocationEditorLinks({
      type: "restaurants",
      locationId: "route_789",
      canonicalId: "loc_123",
      sourceId: "rest_456",
      effectiveId: "loc_123",
    });

    expect(links.publicPage).toBe("/locations/restaurants/rest_456");
    expect(links.menuViewer).toBe("/locations/restaurants/rest_456/menu");
  });
});
