import { describe, expect, it } from "vitest";
import {
  LOCATION_WORKSPACE_TABS,
  getLegacyCrmHref,
  getLocationWorkspaceHref,
  normalizeLocationWorkspaceTab,
} from "@/lib/admin/location-workspace";

describe("location workspace routing", () => {
  it("exposes the eight primary enterprise workspace tabs", () => {
    expect(LOCATION_WORKSPACE_TABS.map((tab) => tab.id)).toEqual([
      "overview",
      "profile",
      "menu",
      "operations",
      "growth",
      "communication",
      "activity",
      "settings",
    ]);
  });

  it("maps legacy CRM tabs into the new workspace", () => {
    expect(normalizeLocationWorkspaceTab("menu-packages")).toBe("menu");
    expect(normalizeLocationWorkspaceTab("reservations")).toBe("operations");
    expect(normalizeLocationWorkspaceTab("marketing-studio")).toBe("growth");
    expect(normalizeLocationWorkspaceTab("logs")).toBe("activity");
    expect(normalizeLocationWorkspaceTab("plan")).toBe("settings");
  });

  it("builds stable canonical and compatibility routes", () => {
    expect(getLocationWorkspaceHref("abc 123", "menu")).toBe(
      "/admin/dashboard/locations/abc%20123/menu",
    );
    expect(getLegacyCrmHref("abc 123", "menu")).toBe(
      "/admin/dashboard/crm/abc%20123?tab=menu-packages",
    );
  });

  it("falls back safely to overview", () => {
    expect(normalizeLocationWorkspaceTab("unknown-tab")).toBe("overview");
    expect(normalizeLocationWorkspaceTab(null)).toBe("overview");
  });
});
