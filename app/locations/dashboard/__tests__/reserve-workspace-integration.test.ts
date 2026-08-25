import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const nav = readFileSync(
  "app/locations/dashboard/CanonicalLocationModuleNav.tsx",
  "utf8",
);
const layout = readFileSync("app/locations/dashboard/layout.tsx", "utf8");
const embeddedPage = readFileSync(
  "app/locations/dashboard/reservations/page.tsx",
  "utf8",
);
const settingsPage = readFileSync(
  "app/locations/dashboard/reservations/settings/page.tsx",
  "utf8",
);
const settingsControl = readFileSync(
  "components/reserve/ReserveSettingsControlCenter.tsx",
  "utf8",
);
const reserveDashboard = readFileSync("app/reserve/dashboard/page.tsx", "utf8");
const legacyRedirect = readFileSync(
  "app/reserve/dashboard/reservations/page.tsx",
  "utf8",
);
const floorSnapshot = readFileSync(
  "components/reserve/ReserveFloorSnapshot.tsx",
  "utf8",
);

describe("Reserve inside location workspace", () => {
  it("keeps live reservation operations in the location workspace navigation", () => {
    expect(nav).toContain('label: "Reservations"');
    expect(nav).toContain('href: "/locations/dashboard/reservations"');
    for (const tab of ["today", "calendar", "floor", "guests", "waitlist"]) {
      expect(nav).toContain(`tab: "${tab}"`);
    }
    expect(nav).not.toContain('tab: "settings"');
    expect(nav).not.toContain('/reserve/dashboard/reservations", Calendar');
  });

  it("routes reservation setup to one dedicated enterprise control center", () => {
    expect(nav).toContain('href: "/locations/dashboard/reservations/settings"');
    expect(nav).toContain('label: "Reservation Settings"');
    for (const section of ["layout", "hours", "reminders", "policies"]) {
      expect(nav).toContain(`section: "${section}"`);
    }
    expect(settingsPage).toContain("ReserveSettingsControlCenter");
    for (const label of [
      "Booking Rules",
      "Hours & Capacity",
      "Layout & Spaces",
      "Reminders",
      "Policies & Guarantees",
      "Booking Page & Embed",
      "QR Codes",
      "Team Access",
    ]) {
      expect(settingsControl).toContain(label);
    }
  });

  it("redirects old settings query links to the new control center", () => {
    expect(embeddedPage).toContain('first(rawParams.tab) === "settings"');
    expect(embeddedPage).toContain("buildSettingsHref");
    expect(embeddedPage).toContain('deposits: "policies"');
    expect(embeddedPage).toContain('embed: "distribution"');
  });

  it("provides a reversible full-screen host mode without creating a second system", () => {
    expect(nav).toContain('label: "Host View"');
    expect(nav).toContain("host: true");
    expect(nav).toContain('params.set("host", "1")');
    expect(nav).toContain('searchParams.get("host") === "1"');
    expect(embeddedPage).toContain("location-host-mode");
    expect(embeddedPage).toContain("Exit Host View");
    expect(embeddedPage).toContain('key === "host"');
  });

  it("mounts the real Reserve command center inside the shared location layout", () => {
    expect(embeddedPage).toContain("ReserveCommandCenterPage");
    expect(embeddedPage).toContain("location-workspace-reserve");
    expect(layout).toContain(".location-workspace-reserve .reserve-command-center");
    expect(layout).toContain("grid-template-columns: minmax(0, 1fr) !important");
    expect(layout).toContain("display: none !important");
    expect(layout).toContain('aria-label="Reserve sections"');
    expect(layout).toContain('content: "Reservations"');
  });

  it("renders compact physical table diagrams with configured chair counts", () => {
    expect(floorSnapshot).toContain("function TableDiagram");
    expect(floorSnapshot).toContain("Array.from({ length: capacity })");
    expect(floorSnapshot).toContain("chairStyle(index, capacity)");
    expect(floorSnapshot).toContain("grid-cols-[repeat(auto-fit,minmax(116px,1fr))]");
    expect(floorSnapshot).toContain("floorResources.length > 12");
    expect(floorSnapshot).toContain("max-h-[min(58vh,520px)]");
  });

  it("keeps old Reserve URLs working by redirecting them into the workspace", () => {
    for (const source of [reserveDashboard, legacyRedirect]) {
      expect(source).toContain("/locations/dashboard/reservations");
      expect(source).toContain('query.set("tab", "today")');
    }
  });
});
