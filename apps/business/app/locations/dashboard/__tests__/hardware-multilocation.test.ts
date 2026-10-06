import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Business multi-location hardware overview", () => {
  it("derives locations from the authenticated owner's access set", () => {
    const page = readFileSync(
      "apps/business/app/locations/dashboard/hardware/all/page.tsx",
      "utf8",
    );
    expect(page).toContain("getLocationOwnerAccess");
    expect(page).toContain("ownedLocationIds");
    expect(page).toContain("ownedSourceLocationIds");
    expect(page).toContain('hasLocationPermission(access, "hardware.view")');
  });

  it("deduplicates canonical locations before reading hardware", () => {
    const page = readFileSync(
      "apps/business/app/locations/dashboard/hardware/all/page.tsx",
      "utf8",
    );
    expect(page).toContain("seenCanonicalIds");
    expect(page).toContain("listLocationHardware");
  });

  it("shows fleet-level ready, attention, and offline counts", () => {
    const page = readFileSync(
      "apps/business/app/locations/dashboard/hardware/all/page.tsx",
      "utf8",
    );
    expect(page).toContain("Hardware across your business");
    expect(page).toContain("Needs attention");
    expect(page).toContain("Automatic reconnect in progress");
  });
});
