import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("app/locations/dashboard/profile/page.tsx", "utf8");
const editor = readFileSync(
  "app/locations/dashboard/profile/LocationProfileEditor.tsx",
  "utf8",
);
const hoursEditor = readFileSync(
  "components/location-editor/LocationEditorHoursPanel.tsx",
  "utf8",
);

describe("location business profile editor", () => {
  it("uses a dedicated owner-facing editor instead of the generic Growth Pro placeholder", () => {
    expect(page).toContain("LocationProfileEditor");
    expect(page).not.toContain("BusinessGrowthProPage");
  });

  it("loads and saves through the secured location edit context", () => {
    expect(editor).toContain("/api/locations/edit-context?type=");
    expect(editor).toContain('fetch("/api/locations/edit-context"');
    expect(editor).toContain('method: "PATCH"');
  });

  it("keeps the regular owner form focused on customer-facing profile information", () => {
    for (const label of [
      "Profile essentials",
      "Contact information",
      "Location",
      "Main photo",
      "Business hours",
      "Visibility",
    ]) {
      expect(editor).toContain(label);
    }
    expect(editor).toContain("Advanced editor");
  });

  it("embeds structured weekly hours and persists operating_hours without a hours-page linkout", () => {
    expect(editor).toContain("LocationEditorHoursPanel");
    expect(editor).toContain("operating_hours");
    expect(editor).not.toContain("Open structured hours editor");
    expect(hoursEditor).toContain("Closes next day");
    expect(hoursEditor).toContain("overnight: true");
    expect(hoursEditor).toContain("closes_next_day: true");
  });
});
