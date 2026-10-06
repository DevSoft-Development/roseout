import type {
  PosDiscoveredNetworkDevice,
  PosDiscoveryMatch,
  PosLocalDiscoveryProvider,
  PosLocalEndpointStore,
  PosManagedNetworkIdentity,
} from "@/lib/pos/hardware/discovery/contracts";
import type { PosPrinterEndpoint } from "@/lib/pos/hardware/printers/contracts";

function normalize(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function normalizeNetworkIdentifier(value: string) {
  return normalize(value).replace(/[^a-z0-9]/g, "");
}

function endpoint(device: PosDiscoveredNetworkDevice): PosPrinterEndpoint {
  return {
    host: String(device.host || "").trim(),
    port: device.port || 9100,
  };
}

function stableNetworkIds(values?: readonly string[]) {
  return new Set((values || []).map(normalizeNetworkIdentifier).filter(Boolean));
}

export function matchManagedDevice(
  managed: PosManagedNetworkIdentity,
  discovered: PosDiscoveredNetworkDevice,
): PosDiscoveryMatch["confidence"] | null {
  const provider = normalize(managed.provider);
  const discoveredProvider = normalize(discovered.provider);
  const providerDeviceId = normalize(managed.providerDeviceId);
  const discoveredProviderDeviceId = normalize(discovered.providerDeviceId);

  if (
    provider &&
    providerDeviceId &&
    provider === discoveredProvider &&
    providerDeviceId === discoveredProviderDeviceId
  ) {
    return "provider_id";
  }

  const serial = normalize(managed.serialNumber);
  const discoveredSerial = normalize(discovered.serialNumber);
  if (serial && discoveredSerial && serial === discoveredSerial) {
    const vendor = normalize(managed.vendor);
    const discoveredVendor = normalize(discovered.vendor);
    if (!vendor || !discoveredVendor || vendor === discoveredVendor) return "serial";
  }

  const managedIds = stableNetworkIds(managed.networkIdentifiers);
  const discoveredIds = stableNetworkIds(discovered.networkIdentifiers);
  if (managedIds.size && discoveredIds.size) {
    for (const id of managedIds) {
      if (discoveredIds.has(id)) return "network_identifier";
    }
  }

  return null;
}

export function resolveDiscoveryMatches(
  managedDevices: readonly PosManagedNetworkIdentity[],
  discoveredDevices: readonly PosDiscoveredNetworkDevice[],
): readonly PosDiscoveryMatch[] {
  const candidatePairs: Array<{
    managed: PosManagedNetworkIdentity;
    discovered: PosDiscoveredNetworkDevice;
    confidence: PosDiscoveryMatch["confidence"];
  }> = [];

  for (const managed of managedDevices) {
    for (const discovered of discoveredDevices) {
      const confidence = matchManagedDevice(managed, discovered);
      if (confidence) candidatePairs.push({ managed, discovered, confidence });
    }
  }

  const confidenceRank: Record<PosDiscoveryMatch["confidence"], number> = {
    provider_id: 3,
    serial: 2,
    network_identifier: 1,
  };

  const matches: PosDiscoveryMatch[] = [];

  for (const managed of managedDevices) {
    const candidates = candidatePairs
      .filter((pair) => pair.managed.deviceId === managed.deviceId)
      .sort((a, b) => confidenceRank[b.confidence] - confidenceRank[a.confidence]);

    if (!candidates.length) continue;

    const bestRank = confidenceRank[candidates[0].confidence];
    const best = candidates.filter((candidate) => confidenceRank[candidate.confidence] === bestRank);

    // Fail closed if two devices present the same strongest stable identity.
    if (best.length !== 1) continue;

    const selected = best[0];
    const selectedHost = normalize(selected.discovered.host);
    if (!selectedHost) continue;

    // Fail closed if this discovered endpoint is also the strongest match for another managed device.
    const endpointCollision = managedDevices.some((other) => {
      if (other.deviceId === managed.deviceId) return false;
      return candidatePairs.some(
        (pair) =>
          pair.managed.deviceId === other.deviceId &&
          normalize(pair.discovered.host) === selectedHost &&
          (pair.discovered.port || 9100) === (selected.discovered.port || 9100),
      );
    });
    if (endpointCollision) continue;

    matches.push({
      deviceId: managed.deviceId,
      endpoint: endpoint(selected.discovered),
      confidence: selected.confidence,
    });
  }

  return matches;
}

export async function discoverAndCacheManagedDevices(input: {
  managedDevices: readonly PosManagedNetworkIdentity[];
  provider: PosLocalDiscoveryProvider;
  endpointStore: PosLocalEndpointStore;
  timeoutMs?: number;
  ttlMs?: number;
}) {
  const discovered = await input.provider.scan({ timeoutMs: input.timeoutMs });
  const matches = resolveDiscoveryMatches(input.managedDevices, discovered);

  for (const match of matches) {
    input.endpointStore.set(match.deviceId, match.endpoint, input.ttlMs);
  }

  return {
    discoveredCount: discovered.length,
    matchedCount: matches.length,
    matches,
  };
}
