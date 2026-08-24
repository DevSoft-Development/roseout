import "server-only";

import { microsoftGraphFetch } from "./graph";

export type IntuneManagedDevice = {
  id: string;
  deviceName?: string | null;
  userDisplayName?: string | null;
  userPrincipalName?: string | null;
  operatingSystem?: string | null;
  osVersion?: string | null;
  complianceState?: string | null;
  managementAgent?: string | null;
  ownerType?: string | null;
  enrolledDateTime?: string | null;
  lastSyncDateTime?: string | null;
  serialNumber?: string | null;
  model?: string | null;
  manufacturer?: string | null;
  azureADDeviceId?: string | null;
  deviceRegistrationState?: string | null;
  jailBroken?: string | null;
};

type GraphCollection<T> = { value?: T[]; "@odata.nextLink"?: string };

async function getAllPages<T>(userId: string, path: string, maxPages = 10): Promise<T[]> {
  const items: T[] = [];
  let next: string | null = path;
  let pages = 0;
  while (next && pages < maxPages) {
    const payload: GraphCollection<T> = await microsoftGraphFetch<GraphCollection<T>>(userId, next);
    items.push(...(payload.value || []));
    next = payload["@odata.nextLink"] || null;
    pages += 1;
  }
  return items;
}

export async function listIntuneManagedDevices(userId: string) {
  return getAllPages<IntuneManagedDevice>(
    userId,
    "/deviceManagement/managedDevices?$select=id,deviceName,userDisplayName,userPrincipalName,operatingSystem,osVersion,complianceState,managementAgent,ownerType,enrolledDateTime,lastSyncDateTime,serialNumber,model,manufacturer,azureADDeviceId,deviceRegistrationState,jailBroken&$orderby=lastSyncDateTime desc",
  );
}

export async function getIntuneOverview(userId: string) {
  const devices = await listIntuneManagedDevices(userId);
  const now = Date.now();
  const staleCutoff = now - 7 * 24 * 60 * 60 * 1000;
  return {
    devices,
    metrics: {
      total: devices.length,
      compliant: devices.filter((d) => d.complianceState === "compliant").length,
      noncompliant: devices.filter((d) => d.complianceState === "noncompliant").length,
      ios: devices.filter((d) => ["iOS", "iPadOS"].includes(d.operatingSystem || "")).length,
      stale: devices.filter((d) => !d.lastSyncDateTime || new Date(d.lastSyncDateTime).getTime() < staleCutoff).length,
    },
  };
}

const REMOTE_ACTIONS = new Set(["syncDevice", "retire", "wipe"]);

export async function runIntuneDeviceAction(userId: string, deviceId: string, action: string) {
  if (!REMOTE_ACTIONS.has(action)) throw new Error("INTUNE_ACTION_NOT_ALLOWED");
  const safeId = encodeURIComponent(deviceId);
  if (action === "wipe") {
    return microsoftGraphFetch(userId, `/deviceManagement/managedDevices/${safeId}/wipe`, {
      method: "POST",
      body: JSON.stringify({ keepEnrollmentData: false, keepUserData: false, macOsUnlockCode: null }),
    });
  }
  return microsoftGraphFetch(userId, `/deviceManagement/managedDevices/${safeId}/${action}`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}
