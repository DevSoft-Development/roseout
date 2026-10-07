import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Admin POS inventory label printing", () => {
  it("prints ThePOSHaven QR labels in batches", () => {
    const client = readFileSync(
      "apps/admin/app/admin/dashboard/settings/location-tools/pos-hardware/labels/PosInventoryLabelPrinter.tsx",
      "utf8",
    );
    expect(client).toContain("window.print()");
    expect(client).toContain("Select all");
    expect(client).toContain("Print ");
  });

  it("shows both ThePOSHaven asset tag and manufacturer serial", () => {
    const client = readFileSync(
      "apps/admin/app/admin/dashboard/settings/location-tools/pos-hardware/labels/PosInventoryLabelPrinter.tsx",
      "utf8",
    );
    expect(client).toContain("item.assetTag");
    expect(client).toContain("item.serialNumber");
  });

  it("uses QR generated from the existing inventory device id", () => {
    const page = readFileSync(
      "apps/admin/app/admin/dashboard/settings/location-tools/pos-hardware/labels/page.tsx",
      "utf8",
    );
    expect(page).toContain("renderPosInventoryQrDataUrl(device.id)");
  });
});
