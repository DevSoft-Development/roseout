import * as SecureStore from "expo-secure-store";

const INSTALLATION_KEY = "theposhaven.installation_id";
const CLAIM_SESSION_KEY = "theposhaven.claim_session";

export type PosClaimSession = {
  installationId: string;
  deviceId: string;
  locationId: string;
  locationName?: string | null;
  credential: string;
  claimedAt: string;
};

export type PosClaimTransport = {
  claim(input: {
    pairingCode: string;
    installationId: string;
  }): Promise<{
    deviceId: string;
    locationId: string;
    locationName?: string | null;
    credential: string;
  }>;
};

function randomHex(length: number) {
  let value = "";
  for (let index = 0; index < length; index += 1) {
    value += Math.floor(Math.random() * 16).toString(16);
  }
  return value;
}

function createInstallationId() {
  // Installation IDs are identifiers, not credentials. Authentication uses the
  // separate opaque credential returned by the claim transport.
  return [
    randomHex(8),
    randomHex(4),
    `4${randomHex(3)}`,
    `${["8", "9", "a", "b"][Math.floor(Math.random() * 4)]}${randomHex(3)}`,
    randomHex(12),
  ].join("-");
}

function required(value: unknown, field: string) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`pos_claim_missing_${field}`);
  return normalized;
}

export async function getOrCreatePosInstallationId() {
  const existing = await SecureStore.getItemAsync(INSTALLATION_KEY);
  if (existing?.trim()) return existing.trim();

  const installationId = createInstallationId();
  await SecureStore.setItemAsync(INSTALLATION_KEY, installationId, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return installationId;
}

export async function getPosClaimSession(): Promise<PosClaimSession | null> {
  const raw = await SecureStore.getItemAsync(CLAIM_SESSION_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<PosClaimSession>;
    return {
      installationId: required(parsed.installationId, "installation_id"),
      deviceId: required(parsed.deviceId, "device_id"),
      locationId: required(parsed.locationId, "location_id"),
      locationName:
        typeof parsed.locationName === "string" ? parsed.locationName : null,
      credential: required(parsed.credential, "credential"),
      claimedAt: required(parsed.claimedAt, "claimed_at"),
    };
  } catch {
    await SecureStore.deleteItemAsync(CLAIM_SESSION_KEY);
    return null;
  }
}

export async function claimPosDevice(input: {
  pairingCode: string;
  transport: PosClaimTransport;
}) {
  const pairingCode = required(input.pairingCode, "pairing_code");
  const installationId = await getOrCreatePosInstallationId();
  const claimed = await input.transport.claim({
    pairingCode,
    installationId,
  });

  const session: PosClaimSession = {
    installationId,
    deviceId: required(claimed.deviceId, "device_id"),
    locationId: required(claimed.locationId, "location_id"),
    locationName:
      typeof claimed.locationName === "string" ? claimed.locationName : null,
    credential: required(claimed.credential, "credential"),
    claimedAt: new Date().toISOString(),
  };

  await SecureStore.setItemAsync(CLAIM_SESSION_KEY, JSON.stringify(session), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });

  return session;
}

export async function clearPosClaimSession() {
  await SecureStore.deleteItemAsync(CLAIM_SESSION_KEY);
}
