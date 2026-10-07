import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("ThePOSHaven hardware support boundary", () => {
  it("keeps provider, firmware, and raw diagnostic metadata in Admin only", () => {
    const businessPages = [
      "apps/business/app/locations/dashboard/hardware/page.tsx",
      "apps/business/app/locations/dashboard/hardware/health/page.tsx",
      "apps/business/app/locations/dashboard/hardware/all/page.tsx",
    ].map((path) => readFileSync(path, "utf8")).join("\n");
    const admin = readFileSync(
      "apps/admin/app/admin/dashboard/settings/location-tools/pos-hardware/page.tsx",
      "utf8",
    );

    for (const marker of ["Provider Device ID", "Firmware", "Raw diagnostic metadata"]) {
      expect(businessPages).not.toContain(marker);
      expect(admin).toContain(marker);
    }
  });

  it("only exposes replacement controls to hardware managers", () => {
    const health = readFileSync(
      "apps/business/app/locations/dashboard/hardware/health/page.tsx",
      "utf8",
    );
    expect(health).toContain('hasLocationPermission(access, "hardware.manage")');
    expect(health).toContain("canManage ?");
  });

  it("keeps the health center available during hardware-service outages", () => {
    const health = readFileSync(
      "apps/business/app/locations/dashboard/hardware/health/page.tsx",
      "utf8",
    );
    expect(health).toContain("Hardware status is temporarily unavailable");
    expect(health).toContain("unavailable = true");
  });
});
