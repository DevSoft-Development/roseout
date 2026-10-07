import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("ThePOSHaven Stack 7 BYOH and pre-provisioning", () => {
  it("requires an active ThePOSHaven Hub before certified BYOH can be claimed", () => {
    const action = readFileSync(
      "apps/business/app/locations/dashboard/hardware/setup/actions.ts",
      "utf8",
    );
    expect(action).toContain("certified.managedKit === false");
    expect(action).toContain('item.device.device_type === "network_hub"');
    expect(action).toContain("hardware_byoh_requires_pos_hub");
  });

  it("explains the Hub requirement in the Business setup flow", () => {
    const page = readFileSync(
      "apps/business/app/locations/dashboard/hardware/setup/page.tsx",
      "utf8",
    );
    expect(page).toContain("ThePOSHaven Hub required for this BYOH device");
    expect(page).toContain("byohBlocked");
  });

  it("honors Admin pre-provisioned role and station during final claim", () => {
    const action = readFileSync(
      "apps/business/app/locations/dashboard/hardware/setup/actions.ts",
      "utf8",
    );
    expect(action).toContain("intended_role");
    expect(action).toContain("intended_station_key");
    expect(action).toContain("hardware_preprovisioned_role_incompatible");
    expect(action).toContain('stationKey = intendedStationKey || "default"');
  });

  it("shows pre-provisioned role and station without asking the location to reconfigure it", () => {
    const page = readFileSync(
      "apps/business/app/locations/dashboard/hardware/setup/page.tsx",
      "utf8",
    );
    expect(page).toContain("Pre-provisioned by TheOutHaven");
    expect(page).toContain("!intendedRole");
  });
});
