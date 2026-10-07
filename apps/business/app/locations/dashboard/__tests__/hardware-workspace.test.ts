import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Business hardware workspace", () => {
  it("adds hardware permissions without exposing management to view-only staff", () => {
    const source = readFileSync("lib/auth/locationOwnerAccess.ts", "utf8");
    expect(source).toContain('"hardware.view"');
    expect(source).toContain('"hardware.manage"');
    expect(source).toMatch(/VIEW_PERMISSIONS[\s\S]*"hardware\.view"/);
    expect(source).toMatch(/EDIT_PERMISSIONS[\s\S]*"hardware\.manage"/);
  });

  it("exposes ThePOSHaven as the canonical POS workspace", () => {
    const source = readFileSync(
      "apps/business/app/locations/dashboard/CanonicalLocationModuleNav.tsx",
      "utf8",
    );
    expect(source).toContain('label: "ThePOSHaven"');
    expect(source).toContain('href: "/locations/dashboard/pos"');
    expect(source).toContain('matches: ["/locations/dashboard/hardware"]');
  });

  it("keeps the owner experience plain-language and hides network internals", () => {
    const source = readFileSync(
      "apps/business/app/locations/dashboard/hardware/page.tsx",
      "utf8",
    );
    expect(source).toContain("No IP addresses, drivers, or network setup required.");
    expect(source).toContain("Manager access");
    expect(source).toContain("View-only access");
    expect(source).not.toContain("provider_device_id");
    expect(source).not.toContain("networkIdentifiers");
  });

  it("projects station assignment for location hardware", () => {
    const source = readFileSync("lib/pos/hardware/device-registry.ts", "utf8");
    expect(source).toContain("stationKey");
    expect(source).toContain("assignment.station_key");
  });
});
