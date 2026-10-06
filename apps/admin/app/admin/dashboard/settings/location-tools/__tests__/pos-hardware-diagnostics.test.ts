import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Admin POS hardware diagnostics", () => {
  it("is restricted to admin roles", () => {
    const page = readFileSync(
      "apps/admin/app/admin/dashboard/settings/location-tools/pos-hardware/page.tsx",
      "utf8",
    );
    expect(page).toContain('requireAdminRole(["superadmin", "admin"])');
    expect(page).toContain("Admin only");
  });

  it("exposes support-level technical fields only in Admin", () => {
    const page = readFileSync(
      "apps/admin/app/admin/dashboard/settings/location-tools/pos-hardware/page.tsx",
      "utf8",
    );
    for (const marker of [
      "Provider Device ID",
      "Firmware",
      "Last heartbeat",
      "Raw diagnostic metadata",
      "pos_hardware_devices",
      "pos_hardware_assignments",
    ]) {
      expect(page).toContain(marker);
    }
  });

  it("is linked from location data operations", () => {
    const hub = readFileSync(
      "apps/admin/app/admin/dashboard/settings/location-tools/page.tsx",
      "utf8",
    );
    expect(hub).toContain("POS Hardware Diagnostics");
    expect(hub).toContain("/admin/dashboard/settings/location-tools/pos-hardware");
  });
});
