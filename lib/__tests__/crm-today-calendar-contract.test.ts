import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("CRM Today calendar", () => {
  it("surfaces today's synced Microsoft 365 calendar events", () => {
    const page = source("app/admin/dashboard/crm/today/page.tsx");

    expect(page).toContain('from("microsoft_365_calendar_events")');
    expect(page).toContain('eq("user_id", actor.user_id)');
    expect(page).toContain('eq("is_cancelled", false)');
    expect(page).toContain("Today’s calendar");
    expect(page).toContain("Open calendar");
    expect(page).toContain("Open in Outlook");
    expect(page).toContain('timeZone: EASTERN_TIME_ZONE');
  });
});
