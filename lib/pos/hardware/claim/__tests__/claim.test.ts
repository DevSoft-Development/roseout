import { describe, expect, it, vi } from "vitest";
import { claimDiscoveredManagedDevice, selectClaimCandidate } from "../claim";

const managed = {
  deviceId: "printer-kitchen-1",
  deviceType: "kitchen_printer" as const,
  vendor: "3nStar",
  model: "RPI007E",
  serialNumber: "KIT-001",
};

const slot = {
  locationId: "loc-1",
  role: "kitchen_hot_line",
  stationKey: "hot-1",
  deviceId: "printer-kitchen-1",
};

describe("POS zero-touch claim", () => {
  it("claims exactly one pre-enrolled stable identity", () => {
    expect(
      selectClaimCandidate(
        { host: "192.168.1.20", vendor: "3nStar", serialNumber: "KIT-001" },
        [{ managed, slot }],
      ),
    ).toEqual({
      status: "claimed",
      deviceId: "printer-kitchen-1",
      slot,
    });
  });

  it("fails closed when discovery identity matches multiple enrolled devices", () => {
    const result = selectClaimCandidate(
      { host: "192.168.1.20", vendor: "3nStar", serialNumber: "KIT-001" },
      [
        { managed, slot },
        {
          managed: { ...managed, deviceId: "printer-kitchen-2" },
          slot: { ...slot, deviceId: "printer-kitchen-2", stationKey: "hot-2" },
        },
      ],
    );
    expect(result.status).toBe("ambiguous");
  });

  it("automatically preserves replacement slot assignment", async () => {
    const assign = vi.fn(async () => "assignment-1");

    const result = await claimDiscoveredManagedDevice({
      discovered: { host: "10.0.0.44", vendor: "3nStar", serialNumber: "KIT-001" },
      candidates: [{
        managed,
        slot: { ...slot, replacementForDeviceId: "old-printer" },
      }],
      writer: { assign },
      claimedBy: "register-1",
    });

    expect(result.status).toBe("claimed");
    expect(assign).toHaveBeenCalledWith({
      deviceId: "printer-kitchen-1",
      locationId: "loc-1",
      role: "kitchen_hot_line",
      stationKey: "hot-1",
      replaceDeviceId: "old-printer",
      metadata: {
        claim_mode: "zero_touch",
        claimed_by: "register-1",
      },
    });
  });
});
