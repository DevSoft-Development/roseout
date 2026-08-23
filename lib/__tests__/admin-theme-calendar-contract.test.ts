import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("TheOutHaven admin visual contract", () => {
  it("applies the brand theme from the shared admin layout", () => {
    const layout = source("app/admin/layout.tsx");
    const css = source("app/globals.css");

    expect(layout).toContain("admin-theme");
    expect(layout).toContain("admin-page-shell");
    expect(css).toContain("--admin-accent: var(--toh-red)");
    expect(css).toContain(".admin-theme .admin-primary");
    expect(css).toContain(".admin-theme .admin-card");
  });

  it("keeps Microsoft 365 settings on the shared red admin theme", () => {
    const settings = source("app/admin/dashboard/settings/microsoft-365/page.tsx");

    expect(settings).toContain("admin-page");
    expect(settings).toContain("admin-primary");
    expect(settings).toContain("/admin/dashboard/crm/calendar");
    expect(settings).not.toContain("sky-");
  });

  it("renders synced Outlook events in the CRM calendar", () => {
    const calendar = source("app/admin/dashboard/crm/calendar/page.tsx");
    const navigation = source("app/admin/admin-navigation.ts");

    expect(calendar).toContain("microsoft_365_calendar_events");
    expect(calendar).toContain("Open in Outlook");
    expect(calendar).toContain("America/New_York");
    expect(navigation).toContain('{ label: "Calendar", href: "/admin/dashboard/crm/calendar"');
  });
});
