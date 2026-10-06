import { describe, expect, it, vi } from "vitest";
import {
  RoleBasedPosPrinterRouter,
  routesFromAssignments,
  selectPrintRoutes,
} from "../routing";

const job = {
  locationId: "loc-1",
  printerRole: "kitchen_hot_line" as const,
  idempotencyKey: "order-1:kitchen",
  payload: new Uint8Array([1, 2, 3]),
};

describe("POS role-based print routing", () => {
  it("maps assignments to printer roles and ignores non-printer roles", () => {
    expect(
      routesFromAssignments([
        {
          deviceId: "hot-1",
          locationId: "loc-1",
          role: "kitchen_hot_line",
          hardwareId: "3nstar-rpi007e",
        },
        {
          deviceId: "tablet-1",
          locationId: "loc-1",
          role: "register",
          hardwareId: "ipad-a16",
        },
      ]),
    ).toEqual([
      {
        deviceId: "hot-1",
        role: "kitchen_hot_line",
        stationKey: null,
      },
    ]);
  });

  it("selects only devices assigned to the requested role", () => {
    expect(
      selectPrintRoutes(
        [
          { deviceId: "bar-1", role: "bar" },
          { deviceId: "hot-1", role: "kitchen_hot_line" },
        ],
        "bar",
      ),
    ).toEqual([{ deviceId: "bar-1", role: "bar" }]);
  });

  it("fails over to the next device assigned to the same role", async () => {
    const first = { print: vi.fn(async () => { throw new Error("offline"); }) };
    const second = { print: vi.fn(async () => undefined) };

    const router = new RoleBasedPosPrinterRouter(
      {
        async list() {
          return [
            { deviceId: "hot-primary", role: "kitchen_hot_line", priority: 0 },
            { deviceId: "hot-backup", role: "kitchen_hot_line", priority: 1 },
          ];
        },
      },
      {
        async resolve(deviceId) {
          return deviceId === "hot-primary" ? first : second;
        },
      },
    );

    await expect(router.print(job)).resolves.toBeUndefined();
    expect(first.print).toHaveBeenCalledTimes(1);
    expect(second.print).toHaveBeenCalledTimes(1);
  });

  it("never falls across roles", async () => {
    const router = new RoleBasedPosPrinterRouter(
      {
        async list() {
          return [{ deviceId: "bar-1", role: "bar" }];
        },
      },
      {
        async resolve() {
          return { print: vi.fn() };
        },
      },
    );

    await expect(router.print(job)).rejects.toThrow(
      "pos_print_route_missing:kitchen_hot_line",
    );
  });
});
