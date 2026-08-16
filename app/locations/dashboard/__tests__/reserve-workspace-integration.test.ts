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
const legacyRedirect = readFileSync(
  "app/reserve/dashboard/reservations/page.tsx",
  "utf8",
);

describe("Reserve inside location workspace", () => {
  it("keeps reservation operations in the location workspace navigation", () => {
    expect(nav).toContain('label: "Reservations"');
    expect(nav).toContain('href: "/locations/dashboard/reservations"');
    for (const tab of ["today", "calendar", "floor", "guests", "waitlist", "settings"]) {
      expect(nav).toContain(`tab: "${tab}"`);
    }
    for (const section of ["layout", "hours", "reminders", "deposits"]) {
      expect(nav).toContain(`section: "${section}"`);
    }
    expect(nav).not.toContain('["Reservations", "/reserve/dashboard/reservations"');
  });

  it("mounts the real Reserve command center inside the shared location layout", () => {
    expect(embeddedPage).toContain("ReserveCommandCenterPage");
    expect(embeddedPage).toContain("location-workspace-reserve");
    expect(layout).toContain(".location-workspace-reserve .reserve-command-center");
    expect(layout).toContain("grid-template-columns: minmax(0, 1fr) !important");
    expect(layout).toContain("display: none !important");
    expect(layout).toContain('content: "Reservations"');
  });

  it("keeps old reservation URLs working by redirecting them into the workspace", () => {
    expect(legacyRedirect).toContain("/locations/dashboard/reservations");
    expect(legacyRedirect).toContain('query.set("tab", "today")');
  });
});
