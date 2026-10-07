import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Business hardware health center", () => {
  it("shows automatic rediscovery and retry behavior truthfully", () => {
    const page = readFileSync(
      "apps/business/app/locations/dashboard/hardware/health/page.tsx",
      "utf8",
    );
    expect(page).toContain("Automatic recovery is already on");
    expect(page).toContain("automatically rediscovered");
    expect(page).toContain("retried before ThePOSHaven falls back");
  });

  it("uses only real recovery paths available today", () => {
    const page = readFileSync(
      "apps/business/app/locations/dashboard/hardware/health/page.tsx",
      "utf8",
    );
    expect(page).toContain("Refresh status");
    expect(page).toContain("Review device");
    expect(page).toContain("Replace device");
    expect(page).not.toContain("Test printer");
    expect(page).not.toContain("Open drawer");
  });

  it("requires hardware view access", () => {
    const page = readFileSync(
      "apps/business/app/locations/dashboard/hardware/health/page.tsx",
      "utf8",
    );
    expect(page).toContain('hasLocationPermission(access, "hardware.view")');
  });
});
