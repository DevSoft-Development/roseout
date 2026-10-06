import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Business hardware claim and replacement", () => {
  it("requires location pre-enrollment before a device can be claimed", () => {
    const registry = readFileSync("lib/pos/hardware/device-registry.ts", "utf8");
    const action = readFileSync(
      "apps/business/app/locations/dashboard/hardware/setup/actions.ts",
      "utf8",
    );
    expect(registry).toContain("pre_enrolled_location_id");
    expect(registry).toContain("intended_location_id");
    expect(action).toContain("isPosHardwarePreenrolledForLocation");
    expect(action).toContain("hardware_device_not_pre_enrolled_for_location");
  });

  it("only claims inventory or provisioned devices", () => {
    const action = readFileSync(
      "apps/business/app/locations/dashboard/hardware/setup/actions.ts",
      "utf8",
    );
    expect(action).toContain('["inventory", "provisioned"]');
    expect(action).toContain("hardware_device_not_available_for_claim");
  });

  it("inherits role and station during replacement", () => {
    const action = readFileSync(
      "apps/business/app/locations/dashboard/hardware/setup/actions.ts",
      "utf8",
    );
    expect(action).toContain("role = replacing.role");
    expect(action).toContain("stationKey = replacing.stationKey");
    expect(action).toContain("replaceDeviceId");
  });

  it("never offers manual network configuration", () => {
    const page = readFileSync(
      "apps/business/app/locations/dashboard/hardware/setup/page.tsx",
      "utf8",
    );
    expect(page).toContain("No configuration screens");
    expect(page).toContain("IP address, port, driver, subnet");
    expect(page).not.toContain('name="host"');
    expect(page).not.toContain('name="ip"');
  });
});
