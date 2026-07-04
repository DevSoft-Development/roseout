import { describe, expect, it } from "vitest";
import { buildLocationEditorLinks, withDemoLocationContext } from "@/lib/location-editor-links";

function query(href: string) {
  return new URL(href, "https://example.test").searchParams;
}

describe("buildLocationEditorLinks", () => {
  const activeLinkKeys = [
    "dashboard",
    "publicPage",
    "edit",
    "crm",
    "reserveDashboard",
    "reservations",
    "reservationLayout",
    "qrTools",
    "adminQrTools",
    "menuEditor",
    "menuViewer",
    "photos",
    "analytics",
    "vip",
    "leads",
    "reviews",
    "marketing",
    "promotions",
    "messaging",
    "settings",
    "branding",
  ] as const;

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
    expect(query(links.menuEditor).get("adminLocationMode")).toBe("1");
    expect(query(links.menuEditor).has("demo")).toBe(false);
    expect(query(links.menuEditor).has("fromDemoCenter")).toBe(false);
    expect(query(links.qrTools).get("adminLocationId")).toBe("loc_123");
    expect(query(links.reserveDashboard).get("adminLocationId")).toBe("loc_123");
    expect(query(links.crm).get("adminLocationId")).toBe("loc_123");
    expect(query(links.adminQrTools).get("locationId")).toBe("loc_123");
    expect(query(links.publicPage).has("demo")).toBe(false);
    expect(query(links.publicPage).get("adminLocationMode")).toBe("1");
  });

  it("keeps real admin location mode separate from demo mode", () => {
    const links = buildLocationEditorLinks({
      type: "restaurants",
      locationId: "route_789",
      canonicalId: "loc_123",
      adminContext: true,
      isDemoMode: false,
    });

    for (const key of activeLinkKeys) {
      const href = links[key];
      expect(href, key).toBeTruthy();
      expect(href, key).not.toContain("undefined");
      expect(query(href).has("demo"), key).toBe(false);
      expect(query(href).has("fromDemoCenter"), key).toBe(false);
      expect(query(href).get("adminLocationId"), key).toBe("loc_123");
      expect(query(href).get("locationId"), key).toBe("loc_123");
      expect(query(href).get("adminLocationMode"), key).toBe("1");
    }
  });

  it("keeps normal location editor links free of demo params", () => {
    const links = buildLocationEditorLinks({
      type: "activities",
      locationId: "route_789",
      canonicalId: "loc_123",
      adminContext: false,
    });

    expect(links.hasCanonicalId).toBe(true);
    expect(links.menuEditor).toBe("/locations/activities/route_789/edit#menu");
    expect(query(links.menuEditor).has("adminLocationId")).toBe(false);
    expect(links.qrTools).toBe("/locations/activities/route_789/edit#qr-codes");
    expect(query(links.qrTools).has("demo")).toBe(false);
    expect(links.analytics).toBe("/locations/activities/route_789/edit#analytics");
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
    expect(query(links.settings).get("adminLocationMode")).toBe("1");
    expect(query(links.settings).has("demo")).toBe(false);
    expect(query(links.crm).get("adminLocationId")).toBe("route_789");
    expect(query(links.adminQrTools).get("locationId")).toBe("route_789");
  });

  it("keeps public links on the source ID when available outside demo mode", () => {
    const links = buildLocationEditorLinks({
      type: "restaurants",
      locationId: "route_789",
      canonicalId: "loc_123",
      sourceId: "rest_456",
      effectiveId: "loc_123",
      isDemoMode: false,
    });

    expect(links.publicPage).toBe("/locations/restaurants/rest_456");
    expect(links.menuViewer).toBe("/locations/restaurants/rest_456/menu");
  });

  it("adds demo owner context to all demo location editor destinations", () => {
    const links = buildLocationEditorLinks({
      type: "restaurants",
      locationId: "route_789",
      canonicalId: "loc_123",
      sourceId: "rest_456",
      effectiveId: "rest_456",
      adminLocationId: "loc_123",
      isDemoMode: true,
      fromDemoCenter: true,
    });

    for (const href of [
      links.dashboard,
      links.publicPage,
      links.edit,
      links.menuEditor,
      links.menuViewer,
      links.reserveDashboard,
      links.reservations,
      links.reservationLayout,
      links.qrTools,
      links.adminQrTools,
      links.analytics,
      links.crm,
    ]) {
      expect(query(href).get("demo"), href).toBe("1");
      expect(query(href).get("fromDemoCenter"), href).toBe("1");
      expect(query(href).get("adminLocationId"), href).toBe("loc_123");
      expect(query(href).get("locationId"), href).toBe("loc_123");
      expect(query(href).get("type"), href).toBe("restaurant");
    }
  });

  it("returns real active hrefs with demo context for every editor navigation item", () => {
    const links = buildLocationEditorLinks({
      type: "restaurants",
      locationId: "route_789",
      canonicalId: "loc_123",
      sourceId: "rest_456",
      effectiveId: "rest_456",
      adminLocationId: "loc_123",
      isDemoMode: true,
      fromDemoCenter: true,
    });

    for (const key of activeLinkKeys) {
      const href = links[key];
      expect(href, key).toBeTruthy();
      expect(href, key).not.toBe("#");
      expect(href, key).not.toBe("javascript:void(0)");
      expect(href, key).not.toContain("undefined");
      expect(query(href).get("demo"), key).toBe("1");
      expect(query(href).get("fromDemoCenter"), key).toBe("1");
      expect(query(href).get("adminLocationId"), key).toBe("loc_123");
      expect(query(href).get("locationId"), key).toBe("loc_123");
      expect(query(href).get("type"), key).toBe("restaurant");
    }
  });

  it("does not add admin or demo context to owner active editor navigation hrefs", () => {
    const links = buildLocationEditorLinks({
      type: "activities",
      locationId: "route_789",
      canonicalId: "loc_123",
      sourceId: "act_456",
      effectiveId: "act_456",
      isDemoMode: false,
    });

    for (const key of activeLinkKeys) {
      const href = links[key];
      expect(href, key).toBeTruthy();
      expect(href, key).not.toBe("#");
      expect(href, key).not.toBe("javascript:void(0)");
      expect(href, key).not.toContain("undefined");
      expect(query(href).has("demo"), key).toBe(false);
      expect(query(href).has("fromDemoCenter"), key).toBe(false);
      expect(query(href).has("adminLocationId"), key).toBe(false);
    }
  });

  it("preserves existing query params and does not duplicate demo params", () => {
    const href = withDemoLocationContext("/reserve/dashboard?tab=reservations&demo=0#section", {
      type: "activities",
      locationId: "loc_abc",
      adminLocationId: "loc_abc",
      isDemoMode: true,
      fromDemoCenter: true,
      searchParams: new URLSearchParams("locationId=old&type=restaurant&fromDemoCenter=1"),
    });

    const url = new URL(href, "https://example.test");
    expect(url.pathname).toBe("/reserve/dashboard");
    expect(url.hash).toBe("#section");
    expect(url.searchParams.get("tab")).toBe("reservations");
    expect(url.searchParams.get("demo")).toBe("1");
    expect(url.searchParams.get("fromDemoCenter")).toBe("1");
    expect(url.searchParams.get("adminLocationId")).toBe("loc_abc");
    expect(url.searchParams.get("locationId")).toBe("loc_abc");
    expect(url.searchParams.get("type")).toBe("activity");
    expect(url.searchParams.getAll("demo")).toHaveLength(1);
    expect(url.searchParams.getAll("locationId")).toHaveLength(1);
  });

  it("uses the demo dashboard as the back/cancel destination in demo mode", () => {
    const links = buildLocationEditorLinks({
      type: "activities",
      locationId: "loc_456",
      canonicalId: "loc_456",
      isDemoMode: true,
      fromDemoCenter: true,
    });

    expect(links.dashboard).toBe(
      "/locations/dashboard?demo=1&fromDemoCenter=1&adminLocationId=loc_456&locationId=loc_456&type=activity",
    );
  });
});
