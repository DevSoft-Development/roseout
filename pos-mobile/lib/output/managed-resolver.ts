import { getThePosHavenHardwareBridge, type ThePosHavenDiscoveredDevice } from "@/lib/hardware/native-bridge";
import type { PosLocalEndpointResolver, PosOutputRole } from "@/lib/output/routing";
import { savePosOutputRoutes } from "@/lib/output/route-store";
import type { PosClaimSession } from "@/lib/device/identity";

type ManagedRoute = {
  role: PosOutputRole;
  stationKey: string;
  deviceId: string;
  identity: {
    vendor?: string | null;
    model?: string | null;
    serialNumber?: string | null;
    provider?: string | null;
    providerDeviceId?: string | null;
    networkIdentifiers?: string[];
  };
};

function normalized(value: unknown) {
  return String(value || "").trim().toLowerCase();
}
function networkId(value: unknown) {
  return normalized(value).replace(/[^a-z0-9]/g, "");
}
function matches(identity: ManagedRoute["identity"], discovered: ThePosHavenDiscoveredDevice) {
  if (
    normalized(identity.provider) &&
    normalized(identity.providerDeviceId) &&
    normalized(identity.provider) === normalized(discovered.provider) &&
    normalized(identity.providerDeviceId) === normalized(discovered.providerDeviceId)
  ) return true;
  if (
    normalized(identity.serialNumber) &&
    normalized(identity.serialNumber) === normalized(discovered.serialNumber)
  ) return true;
  const wanted = new Set((identity.networkIdentifiers || []).map(networkId).filter(Boolean));
  return (discovered.networkIdentifiers || []).some((id) => wanted.has(networkId(id)));
}

export class NativeManagedEndpointResolver implements PosLocalEndpointResolver {
  private readonly endpointByDeviceId = new Map<string, { host: string; port: number }>();

  constructor(private readonly routes: readonly ManagedRoute[]) {}

  async refresh() {
    const discovered = await getThePosHavenHardwareBridge().scanLocalDevices(2500);
    this.endpointByDeviceId.clear();
    for (const route of this.routes) {
      const candidates = discovered.filter((device) => matches(route.identity, device));
      if (candidates.length !== 1) continue;
      this.endpointByDeviceId.set(route.deviceId, {
        host: candidates[0].host,
        port: candidates[0].port || 9100,
      });
    }
  }

  async resolve(deviceId: string) {
    let endpoint = this.endpointByDeviceId.get(deviceId);
    if (!endpoint) {
      await this.refresh();
      endpoint = this.endpointByDeviceId.get(deviceId);
    }
    if (!endpoint) throw new Error(`pos_local_endpoint_unresolved:${deviceId}`);
    return endpoint;
  }
}

export async function syncManagedOutputRoutes(input: {
  baseUrl: string;
  session: PosClaimSession;
}) {
  const response = await fetch(
    `${input.baseUrl.replace(/\/$/, "")}/api/business/pos/devices/orders?action=routes`,
    {
      headers: {
        Authorization: `Bearer ${input.session.credential}`,
        "X-POS-Device-ID": input.session.deviceId,
      },
    },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok || !Array.isArray(body.routes)) {
    throw new Error(body.error || "pos_output_routes_sync_failed");
  }
  const routes = body.routes as ManagedRoute[];
  await savePosOutputRoutes({
    revision: String(Date.now()),
    locationId: input.session.locationId,
    routes: routes.map((route, index) => ({
      role: route.role,
      deviceId: route.deviceId,
      priority: index,
    })),
  });
  const resolver = new NativeManagedEndpointResolver(routes);
  await resolver.refresh();
  return resolver;
}
