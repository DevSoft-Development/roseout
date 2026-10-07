import { getThePosHavenHardwareBridge } from "@/lib/hardware/native-bridge";

export type PosOutputRole =
  | "receipt"
  | "kitchen_hot_line"
  | "kitchen_cold_line"
  | "bar"
  | "expo"
  | "prep"
  | "label"
  | "cash_drawer";

export type PosOutputRoute = {
  role: PosOutputRole;
  deviceId: string;
  priority?: number;
};

export type PosResolvedEndpoint = {
  host: string;
  port?: number;
};

export interface PosLocalEndpointResolver {
  resolve(deviceId: string): Promise<PosResolvedEndpoint>;
}

export interface PosOutputRouteSource {
  list(): Promise<readonly PosOutputRoute[]>;
}

export interface PosOutputTransport {
  send(endpoint: PosResolvedEndpoint, payload: Uint8Array): Promise<void>;
}

export class NativePosOutputTransport implements PosOutputTransport {
  async send(endpoint: PosResolvedEndpoint, payload: Uint8Array) {
    const host = String(endpoint.host || "").trim();
    if (!host) throw new Error("pos_output_missing_host");

    await getThePosHavenHardwareBridge().sendTcp(
      host,
      endpoint.port || 9100,
      Array.from(payload),
    );
  }
}

export function selectPosOutputRoutes(
  routes: readonly PosOutputRoute[],
  role: PosOutputRole,
) {
  return routes
    .filter((route) => route.role === role)
    .sort((a, b) => (a.priority || 0) - (b.priority || 0));
}

export class RoleBasedPosOutputRouter {
  constructor(
    private readonly routes: PosOutputRouteSource,
    private readonly endpoints: PosLocalEndpointResolver,
    private readonly transport: PosOutputTransport = new NativePosOutputTransport(),
  ) {}

  async send(role: PosOutputRole, payload: Uint8Array) {
    const candidates = selectPosOutputRoutes(await this.routes.list(), role);
    if (!candidates.length) {
      throw new Error(`pos_output_route_missing:${role}`);
    }

    const failures: string[] = [];
    for (const candidate of candidates) {
      try {
        const endpoint = await this.endpoints.resolve(candidate.deviceId);
        await this.transport.send(endpoint, payload);
        return candidate.deviceId;
      } catch (error) {
        failures.push(
          `${candidate.deviceId}:${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    throw new Error(
      `pos_output_route_failed:${role}:${failures.join("|")}`,
    );
  }

  async openCashDrawer() {
    // ESC/POS drawer kick. The logical route is cash_drawer, but the resolved
    // physical endpoint can be the receipt printer that owns the drawer port.
    const pulse = new Uint8Array([0x1b, 0x70, 0x00, 0x19, 0xfa]);
    return this.send("cash_drawer", pulse);
  }
}
