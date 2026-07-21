import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  LOCATION_WORKSPACE_TAB_GROUPS,
  getLegacyCrmHref,
  getLocationWorkspaceGroupForTab,
  normalizeLocationWorkspaceTab,
} from "@/lib/admin/location-workspace";

const expectedTabGroups = {
  overview: ["overview", "partner-launch", "owner", "plan"],
  profile: ["profile", "photos", "listing", "branding", "offerings"],
  menu: ["menu-packages"],
  operations: ["reservations", "claims", "qr-codes", "support"],
  growth: ["offers", "vip-list", "event-leads", "marketing-studio"],
  communications: ["communication", "messaging", "notifications"],
  activity: ["analytics", "reviews-feedback", "logs"],
  settings: ["settings", "seo"],
} as const;

describe("admin CRM workspace navigation", () => {
  it("renders LocationWorkspaceNavigation as the only primary CRM navigation", () => {
    const source = readFileSync("app/admin/dashboard/crm/[id]/page.tsx", "utf8");
    expect(source.match(/<LocationWorkspaceNavigation/g)).toHaveLength(1);
    expect(source).not.toContain("<CrmDetailNavigation");
    expect(source).not.toContain("CRM_DETAIL_TAB_GROUPS");
  });

  it("maps every existing CRM tab into the required workspace group", () => {
    for (const [groupId, tabIds] of Object.entries(expectedTabGroups)) {
      for (const tabId of tabIds) {
        expect(normalizeLocationWorkspaceTab(tabId), tabId).toBe(groupId);
        expect(getLocationWorkspaceGroupForTab(tabId).id, tabId).toBe(groupId);
      }
    }
  });

  it("keeps old query-string tab links valid by resolving them to their workspace group", () => {
    expect(getLocationWorkspaceGroupForTab("reservations").id).toBe("operations");
    expect(getLocationWorkspaceGroupForTab("listing").id).toBe("profile");
    expect(getLocationWorkspaceGroupForTab("messaging").id).toBe("communications");
    expect(getLocationWorkspaceGroupForTab("marketing-studio").id).toBe("growth");
    expect(getLegacyCrmHref("loc 1", "operations")).toBe("/admin/dashboard/crm/loc%201?tab=reservations");
  });

  it("uses the required primary labels without duplicated competing primary labels", () => {
    expect(LOCATION_WORKSPACE_TAB_GROUPS.map((group) => group.label)).toEqual([
      "Overview",
      "Profile",
      "Menu",
      "Operations",
      "Growth",
      "Communications",
      "Activity",
      "Settings",
    ]);
    expect(new Set(LOCATION_WORKSPACE_TAB_GROUPS.map((group) => group.label)).size).toBe(8);
    expect(LOCATION_WORKSPACE_TAB_GROUPS.find((group) => group.id === "communications")?.label).toBe("Communications");
  });
});
