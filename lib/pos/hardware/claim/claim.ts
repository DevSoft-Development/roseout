import type { PosDiscoveredNetworkDevice, PosManagedNetworkIdentity } from "@/lib/pos/hardware/discovery/contracts";
import { matchManagedDevice } from "@/lib/pos/hardware/discovery/discovery";

export type PosClaimSlot = {
  locationId: string;
  role: string;
  stationKey: string;
  deviceId: string;
  replacementForDeviceId?: string | null;
};

export type PosClaimCandidate = {
  managed: PosManagedNetworkIdentity;
  slot: PosClaimSlot;
};

export type PosClaimResult =
  | { status: "claimed"; deviceId: string; slot: PosClaimSlot }
  | { status: "no_match" }
  | { status: "ambiguous"; deviceIds: string[] };

export interface PosHardwareClaimWriter {
  assign(input: {
    deviceId: string;
    locationId: string;
    role: string;
    stationKey: string;
    replaceDeviceId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<string>;
}

export function selectClaimCandidate(
  discovered: PosDiscoveredNetworkDevice,
  candidates: readonly PosClaimCandidate[],
): PosClaimResult {
  const matches = candidates.filter(({ managed }) => matchManagedDevice(managed, discovered));

  if (!matches.length) return { status: "no_match" };
  if (matches.length > 1) {
    return {
      status: "ambiguous",
      deviceIds: matches.map(({ managed }) => managed.deviceId).sort(),
    };
  }

  const selected = matches[0];
  return {
    status: "claimed",
    deviceId: selected.managed.deviceId,
    slot: selected.slot,
  };
}

export async function claimDiscoveredManagedDevice(input: {
  discovered: PosDiscoveredNetworkDevice;
  candidates: readonly PosClaimCandidate[];
  writer: PosHardwareClaimWriter;
  claimedBy: string;
}) {
  const selected = selectClaimCandidate(input.discovered, input.candidates);
  if (selected.status !== "claimed") return selected;

  await input.writer.assign({
    deviceId: selected.deviceId,
    locationId: selected.slot.locationId,
    role: selected.slot.role,
    stationKey: selected.slot.stationKey,
    replaceDeviceId: selected.slot.replacementForDeviceId || null,
    metadata: {
      claim_mode: "zero_touch",
      claimed_by: input.claimedBy,
    },
  });

  return selected;
}
