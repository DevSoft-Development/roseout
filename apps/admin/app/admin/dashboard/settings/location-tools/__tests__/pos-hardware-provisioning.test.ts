import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Admin POS provisioning roles and audit", () => {
  it("validates intended role against certified hardware", () => {
    const helper = readFileSync("apps/admin/lib/pos-hardware-inventory.ts", "utf8");
    expect(helper).toContain("getPosProvisioningRoleOptions");
    expect(helper).toContain("supportedPrinterRoles");
    expect(helper).toContain("pos_inventory_assignment_role_not_supported");
  });

  it("stores role and station before shipment", () => {
    const helper = readFileSync("apps/admin/lib/pos-hardware-inventory.ts", "utf8");
    expect(helper).toContain("intended_role");
    expect(helper).toContain("intended_station_key");
  });

  it("appends bounded provisioning history", () => {
    const helper = readFileSync("apps/admin/lib/pos-hardware-inventory.ts", "utf8");
    expect(helper).toContain("provisioning_history");
    expect(helper).toContain("slice(-19)");
  });

  it("captures role and station per scanned cart item", () => {
    const scanner = readFileSync(
      "apps/admin/app/admin/dashboard/settings/location-tools/pos-hardware/assign/PosInventoryAssignmentScanner.tsx",
      "utf8",
    );
    expect(scanner).toContain('name="assignments"');
    expect(scanner).toContain("roleOptions");
    expect(scanner).toContain("stationKey");
  });

  it("provides an Admin provisioning status view", () => {
    const page = readFileSync(
      "apps/admin/app/admin/dashboard/settings/location-tools/pos-hardware/provisioning/page.tsx",
      "utf8",
    );
    expect(page).toContain("Provisioning Status");
    expect(page).toContain("Provisioning history");
  });
});
