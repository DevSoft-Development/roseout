import { describe, expect, it, vi } from "vitest";
import {
  discoverAndCacheManagedDevices,
  matchManagedDevice,
  resolveDiscoveryMatches,
} from "../discovery";
import { MemoryPosLocalEndpointStore } from "../memory-endpoint-store";

describe("POS local device discovery", () => {
  it("matches Stripe/provider devices by stable provider identity", () => {
    expect(
      matchManagedDevice(
        {
          deviceId: "pay-1",
          deviceType: "payment_terminal",
          vendor: "Stripe",
          model: "S710",
          provider: "stripe",
          providerDeviceId: "tmr_123",
        },
        {
          host: "192.168.50.20",
          provider: "stripe",
          providerDeviceId: "tmr_123",
        },
      ),
    ).toBe("provider_id");
  });

  it("matches printers by vendor + serial even if DHCP changes the IP", () => {
    const managed = {
      deviceId: "printer-1",
      deviceType: "kitchen_printer" as const,
      vendor: "3nStar",
      model: "RPI007E",
      serialNumber: "ABC-123",
    };

    expect(
      matchManagedDevice(managed, {
        host: "192.168.50.21",
        vendor: "3nStar",
        serialNumber: "ABC-123",
      }),
    ).toBe("serial");

    expect(
      matchManagedDevice(managed, {
        host: "192.168.50.89",
        vendor: "3nStar",
        serialNumber: "ABC-123",
      }),
    ).toBe("serial");
  });

  it("can match a pre-enrolled network identifier without using IP as identity", () => {
    expect(
      matchManagedDevice(
        {
          deviceId: "printer-2",
          deviceType: "receipt_printer",
          vendor: "3nStar",
          model: "RPT006S",
          networkIdentifiers: ["AA:BB:CC:DD:EE:FF"],
        },
        {
          host: "10.0.0.44",
          networkIdentifiers: ["aa-bb-cc-dd-ee-ff"],
        },
      ),
    ).toBe("network_identifier");
  });

  it("fails closed when the strongest stable identity is ambiguous", () => {
    const matches = resolveDiscoveryMatches(
      [
        {
          deviceId: "kitchen",
          deviceType: "kitchen_printer",
          vendor: "3nStar",
          model: "RPI007E",
          serialNumber: "DUPLICATE",
        },
      ],
      [
        { host: "10.0.0.20", vendor: "3nStar", serialNumber: "DUPLICATE" },
        { host: "10.0.0.21", vendor: "3nStar", serialNumber: "DUPLICATE" },
      ],
    );

    expect(matches).toEqual([]);
  });

  it("discovers and caches the current endpoint for an assigned device", async () => {
    const store = new MemoryPosLocalEndpointStore();
    const result = await discoverAndCacheManagedDevices({
      managedDevices: [
        {
          deviceId: "kitchen",
          deviceType: "kitchen_printer",
          vendor: "3nStar",
          model: "RPI007E",
          serialNumber: "KIT-001",
        },
      ],
      provider: {
        async scan() {
          return [{ host: "192.168.1.55", port: 9100, vendor: "3nStar", serialNumber: "KIT-001" }];
        },
      },
      endpointStore: store,
    });

    expect(result.matchedCount).toBe(1);
    await expect(store.resolve("kitchen")).resolves.toEqual({
      host: "192.168.1.55",
      port: 9100,
    });
  });

  it("expires local addresses so stale DHCP leases are rediscovered", async () => {
    vi.useFakeTimers();
    const store = new MemoryPosLocalEndpointStore(1_000);
    store.set("printer", { host: "192.168.1.9", port: 9100 });
    await expect(store.resolve("printer")).resolves.toEqual({ host: "192.168.1.9", port: 9100 });

    vi.advanceTimersByTime(1_001);
    await expect(store.resolve("printer")).rejects.toThrow("pos_local_endpoint_expired");
    vi.useRealTimers();
  });
});
