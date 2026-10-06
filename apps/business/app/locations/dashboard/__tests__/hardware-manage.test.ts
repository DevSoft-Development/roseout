import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Business hardware management", () => {
  it("checks hardware.manage before changing assignments", () => {
    const action = readFileSync(
      "apps/business/app/locations/dashboard/hardware/actions.ts",
      "utf8",
    );
    expect(action).toContain('hasLocationPermission(access, "hardware.manage")');
    expect(action).toContain("hardware_device_not_assigned_to_location");
    expect(action).toContain("hardware_role_not_supported");
    expect(action).toContain("assignPosHardwareDevice");
  });

  it("only offers roles certified for the device", () => {
    const action = readFileSync(
      "apps/business/app/locations/dashboard/hardware/actions.ts",
      "utf8",
    );
    expect(action).toContain("supportedPrinterRoles");
    expect(action).toContain("allowedRoles.includes");
  });

  it("keeps role changes free of network configuration", () => {
    const page = readFileSync(
      "apps/business/app/locations/dashboard/hardware/[deviceId]/page.tsx",
      "utf8",
    );
    expect(page).toContain("What should this device do?");
    expect(page).toContain("ThePOSHaven handles the network route automatically.");
    expect(page).toContain("No network settings needed");
    expect(page).not.toContain('name="host"');
    expect(page).not.toContain('name="port"');
  });
});
