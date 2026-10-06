import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Admin POS inventory receiving", () => {
  it("receives by manufacturer serial into the existing device registry", () => {
    const helper = readFileSync("apps/admin/lib/pos-hardware-inventory.ts", "utf8");
    expect(helper).toContain('from("pos_hardware_devices")');
    expect(helper).toContain('receiving_mode: "manufacturer_serial_scan"');
    expect(helper).toContain('lifecycle_status: "inventory"');
    expect(helper).toContain('.eq("serial_number", serialNumber)');
  });

  it("does not reset an existing device lifecycle when a serial is rescanned", () => {
    const helper = readFileSync("apps/admin/lib/pos-hardware-inventory.ts", "utf8");
    const existingReturn = helper.indexOf("if (existing)");
    const insert = helper.indexOf(".insert({");
    expect(existingReturn).toBeGreaterThan(0);
    expect(insert).toBeGreaterThan(existingReturn);
  });

  it("generates a ThePOSHaven asset QR without secrets", () => {
    const helper = readFileSync("apps/admin/lib/pos-hardware-inventory.ts", "utf8");
    expect(helper).toContain("TPH-");
    expect(helper).toContain("theposhaven://inventory/");
    expect(helper).not.toContain("service_role");
    expect(helper).not.toContain("credential");
  });

  it("uses a scanner-first serial input in Admin", () => {
    const page = readFileSync(
      "apps/admin/app/admin/dashboard/settings/location-tools/pos-hardware/inventory/page.tsx",
      "utf8",
    );
    expect(page).toContain("Scan the manufacturer serial number");
    expect(page).toContain('name="serialNumber"');
    expect(page).toContain("autoFocus");
  });
});
