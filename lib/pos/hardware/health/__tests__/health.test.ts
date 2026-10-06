import { describe, expect, it, vi } from "vitest";
import {
  healPosHardwareDevice,
  plainHardwareStatus,
  readinessFromHeartbeat,
  recoveryActionFor,
} from "../health";

describe("POS hardware self-healing", () => {
  it("marks stale devices offline", () => {
    expect(
      readinessFromHeartbeat(
        {
          deviceId: "printer-1",
          health: "ready",
          lastSeenAt: "2026-10-06T20:00:00.000Z",
        },
        new Date("2026-10-06T20:03:00.000Z").getTime(),
        120_000,
      ),
    ).toBe("offline");
  });

  it("rediscoveries offline and unknown hardware", () => {
    expect(recoveryActionFor("offline", 0)).toBe("rediscover");
    expect(recoveryActionFor("unknown", 0)).toBe("rediscover");
  });

  it("retries degraded hardware once then fails over", () => {
    expect(recoveryActionFor("needs_attention", 1)).toBe("retry");
    expect(recoveryActionFor("needs_attention", 2)).toBe("failover");
  });

  it("records ready after successful automatic rediscovery", async () => {
    const record = vi.fn(async () => undefined);
    const result = await healPosHardwareDevice({
      heartbeat: {
        deviceId: "printer-1",
        health: "offline",
        lastSeenAt: "2026-10-06T20:00:00.000Z",
      },
      failureCount: 0,
      nowMs: new Date("2026-10-06T20:03:00.000Z").getTime(),
      rediscovery: { rediscover: vi.fn(async () => true) },
      heartbeatWriter: { record },
    });

    expect(result).toEqual({
      readiness: "ready",
      action: "rediscover",
      recovered: true,
    });
    expect(record).toHaveBeenCalledWith({
      deviceId: "printer-1",
      healthStatus: "ready",
      metadata: { recovered_by: "automatic_rediscovery" },
    });
  });

  it("exposes plain-language readiness text", () => {
    expect(plainHardwareStatus("ready")).toBe("Ready");
    expect(plainHardwareStatus("offline")).toBe("Offline");
    expect(plainHardwareStatus("unknown")).toBe("Checking connection");
  });
});
