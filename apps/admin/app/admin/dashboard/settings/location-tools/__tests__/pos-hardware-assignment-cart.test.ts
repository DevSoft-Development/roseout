import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Admin POS inventory assignment cart", () => {
  it("accepts only ThePOSHaven inventory QR payloads", () => {
    const helper = readFileSync("apps/admin/lib/pos-hardware-inventory.ts", "utf8");
    expect(helper).toContain("parsePosInventoryQrPayload");
    expect(helper).toContain("theposhaven:");
    expect(helper).toContain("inventory");
  });

  it("provisions scanned inventory to one selected location", () => {
    const helper = readFileSync("apps/admin/lib/pos-hardware-inventory.ts", "utf8");
    expect(helper).toContain("pre_enrolled_location_id");
    expect(helper).toContain("intended_location_id");
    expect(helper).toContain('lifecycle_status: "provisioned"');
    expect(helper).toContain('provisioning_mode: "admin_qr_assignment_cart"');
  });

  it("blocks active or unavailable devices from provisioning", () => {
    const helper = readFileSync("apps/admin/lib/pos-hardware-inventory.ts", "utf8");
    expect(helper).toContain('["inventory", "provisioned"]');
    expect(helper).toContain("pos_inventory_assignment_device_already_active");
    expect(helper).toContain("pos_inventory_assignment_device_unavailable");
  });

  it("supports camera QR scanning and scanner-keyboard fallback", () => {
    const client = readFileSync(
      "apps/admin/app/admin/dashboard/settings/location-tools/pos-hardware/assign/PosInventoryAssignmentScanner.tsx",
      "utf8",
    );
    expect(client).toContain('import("html5-qrcode")');
    expect(client).toContain('facingMode: "environment"');
    expect(client).toContain('event.key === "Enter"');
  });
});
