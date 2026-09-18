import "server-only";

import { randomUUID, sign as cryptoSign } from "node:crypto";

const APPLE_API_ROOT = "https://api-business.apple.com/v1";
const APPLE_TOKEN_URL = "https://account.apple.com/auth/oauth2/token";
const APPLE_TOKEN_AUDIENCE = "https://account.apple.com/auth/oauth2/v2/token";

type AppleCollection<T> = {
  data?: T[];
  links?: { next?: string | null };
};

type AppleTokenResponse = {
  access_token: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
};

export type AppleOrgDevice = {
  type: "orgDevices";
  id: string;
  attributes?: {
    serialNumber?: string | null;
    deviceModel?: string | null;
    productFamily?: string | null;
    productType?: string | null;
    deviceCapacity?: string | null;
    color?: string | null;
    status?: string | null;
    addedToOrgDateTime?: string | null;
    updatedDateTime?: string | null;
    purchaseSourceType?: string | null;
  };
};

export type AppleMdmServer = {
  type: "mdmServers";
  id: string;
  attributes?: {
    serverName?: string | null;
    status?: string | null;
    serverType?: string | null;
    defaultProductFamilies?: string[] | null;
    lastConnectedDateTime?: string | null;
  };
};

export type AppleDeviceActivity = {
  type: "orgDeviceActivities";
  id: string;
  attributes?: {
    status?: string | null;
    subStatus?: string | null;
    createdDateTime?: string | null;
    completedDateTime?: string | null;
  };
};

type AppleDeviceActivityResponse = { data: AppleDeviceActivity };

type AppleLinkage = { type: string; id: string };

function base64Url(value: Buffer | string) {
  return Buffer.from(value).toString("base64url");
}

function getAppleBusinessConfig() {
  const clientId = process.env.APPLE_BUSINESS_API_CLIENT_ID?.trim();
  const keyId = process.env.APPLE_BUSINESS_API_KEY_ID?.trim();
  const privateKeyRaw = process.env.APPLE_BUSINESS_API_PRIVATE_KEY?.trim();
  if (!clientId || !keyId || !privateKeyRaw) throw new Error("APPLE_BUSINESS_API_NOT_CONFIGURED");

  return {
    clientId,
    keyId,
    privateKey: privateKeyRaw.replace(/\\n/g, "\n"),
  };
}

export function isAppleBusinessApiConfigured() {
  return Boolean(
    process.env.APPLE_BUSINESS_API_CLIENT_ID?.trim()
      && process.env.APPLE_BUSINESS_API_KEY_ID?.trim()
      && process.env.APPLE_BUSINESS_API_PRIVATE_KEY?.trim(),
  );
}

function createClientAssertion() {
  const config = getAppleBusinessConfig();
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "ES256", kid: config.keyId, typ: "JWT" }));
  const payload = base64Url(JSON.stringify({
    aud: APPLE_TOKEN_AUDIENCE,
    exp: now + 300,
    iat: now,
    iss: config.clientId,
    sub: config.clientId,
    jti: randomUUID(),
  }));
  const input = `${header}.${payload}`;
  const signature = cryptoSign("sha256", Buffer.from(input), {
    key: config.privateKey,
    dsaEncoding: "ieee-p1363",
  });
  return `${input}.${base64Url(signature)}`;
}

let tokenCache: { token: string; expiresAt: number } | null = null;

async function getAppleBusinessAccessToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;
  const config = getAppleBusinessConfig();
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.clientId,
    client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    client_assertion: createClientAssertion(),
    scope: "business.api",
  });
  const response = await fetch(APPLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({})) as Partial<AppleTokenResponse> & { error?: string; error_description?: string };
  if (!response.ok || !payload.access_token) {
    throw new Error(`APPLE_BUSINESS_TOKEN_${response.status}:${payload.error_description || payload.error || "Token exchange failed"}`);
  }
  tokenCache = {
    token: payload.access_token,
    expiresAt: Date.now() + Math.max(60, payload.expires_in || 3600) * 1000,
  };
  return tokenCache.token;
}

async function appleBusinessFetch<T>(pathOrUrl: string, init: RequestInit = {}): Promise<T> {
  const accessToken = await getAppleBusinessAccessToken();
  const url = pathOrUrl.startsWith("https://") ? pathOrUrl : `${APPLE_API_ROOT}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${accessToken}`,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const payload = await response.text();
    if (response.status === 401) tokenCache = null;
    throw new Error(`APPLE_BUSINESS_API_${response.status}:${payload.slice(0, 1200)}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

async function getAllPages<T>(path: string, maxPages = 10) {
  const items: T[] = [];
  let next: string | null = path;
  let pages = 0;
  while (next && pages < maxPages) {
    const payload: AppleCollection<T> = await appleBusinessFetch<AppleCollection<T>>(next);
    items.push(...(payload.data || []));
    next = payload.links?.next || null;
    pages += 1;
  }
  return items;
}

export async function listAppleBusinessDevices() {
  return getAllPages<AppleOrgDevice>(
    "/orgDevices?limit=1000&fields%5BorgDevices%5D=serialNumber,deviceModel,productFamily,productType,deviceCapacity,color,status,addedToOrgDateTime,updatedDateTime,purchaseSourceType",
  );
}

export async function listAppleBusinessMdmServers() {
  // Do not request sparse fields here. Apple Business API tenants can expose
  // different mdmServers field sets, and unsupported fields fail the whole request.
  return getAllPages<AppleMdmServer>("/mdmServers?limit=1000");
}

export async function listAppleMdmServerDeviceIds(mdmServerId: string) {
  return getAllPages<AppleLinkage>(`/mdmServers/${encodeURIComponent(mdmServerId)}/relationships/devices?limit=1000`)
    .then((items) => items.map((item) => item.id));
}

export async function resolveAppleIntuneMdmServer() {
  const servers = await listAppleBusinessMdmServers();
  const configuredId = process.env.APPLE_BUSINESS_INTUNE_MDM_SERVER_ID?.trim();
  if (configuredId) return servers.find((server) => server.id === configuredId) || null;

  const preferred = servers.find((server) => {
    const name = (server.attributes?.serverName || "").toLowerCase();
    return name.includes("intune") || name.includes("theouthaven");
  });
  if (preferred) return preferred;

  // A brand-new ABM tenant commonly has one external management service. In that
  // case it is safer and more useful to use the only available service than to
  // report "Not detected" merely because the administrator chose a custom name.
  return servers.length === 1 ? servers[0] : null;
}

export async function assignAppleDevicesToMdmServer(deviceIds: string[], mdmServerId: string) {
  const cleanIds = [...new Set(deviceIds.map((id) => id.trim()).filter(Boolean))];
  if (!cleanIds.length || cleanIds.length > 1000) throw new Error("APPLE_DEVICE_SELECTION_INVALID");
  if (!mdmServerId.trim()) throw new Error("APPLE_MDM_SERVER_REQUIRED");

  for (const id of cleanIds) {
    await appleBusinessFetch(`/orgDevices/${encodeURIComponent(id)}`);
  }

  const payload = await appleBusinessFetch<AppleDeviceActivityResponse>("/orgDeviceActivities", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "orgDeviceActivities",
        attributes: { activityType: "ASSIGN_DEVICES" },
        relationships: {
          mdmServer: { data: { type: "mdmServers", id: mdmServerId } },
          devices: { data: cleanIds.map((id) => ({ type: "orgDevices", id })) },
        },
      },
    }),
  });
  return payload.data;
}

export async function getAppleDeviceActivity(activityId: string) {
  return appleBusinessFetch<AppleDeviceActivityResponse>(`/orgDeviceActivities/${encodeURIComponent(activityId)}`).then((payload) => payload.data);
}
