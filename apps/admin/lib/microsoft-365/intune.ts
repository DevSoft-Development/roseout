import "server-only";

import { microsoftGraphBetaFetch, microsoftGraphFetch } from "./graph";

export type IntuneManagedDevice = {
  id: string;
  deviceName?: string | null;
  userDisplayName?: string | null;
  userPrincipalName?: string | null;
  operatingSystem?: string | null;
  osVersion?: string | null;
  complianceState?: string | null;
  managementAgent?: string | null;
  managedDeviceOwnerType?: string | null;
  enrolledDateTime?: string | null;
  lastSyncDateTime?: string | null;
  serialNumber?: string | null;
  model?: string | null;
  manufacturer?: string | null;
  azureADDeviceId?: string | null;
  deviceRegistrationState?: string | null;
  jailBroken?: string | null;
};

export type IntuneDepOnboardingSetting = {
  id: string;
  tokenName?: string | null;
  appleIdentifier?: string | null;
  lastSuccessfulSyncDateTime?: string | null;
  lastSyncErrorCode?: number | null;
  lastSyncTriggeredDateTime?: string | null;
  tokenExpirationDateTime?: string | null;
};

type GraphCollection<T> = { value?: T[]; "@odata.nextLink"?: string };

type IntuneIosConfiguration = {
  id: string;
  displayName?: string | null;
  description?: string | null;
  "@odata.type"?: string | null;
};

export type IntuneIosEnrollmentProfile = {
  id: string;
  displayName?: string | null;
  description?: string | null;
  isDefault?: boolean | null;
  requiresUserAuthentication?: boolean | null;
  enableAuthenticationViaCompanyPortal?: boolean | null;
  requireCompanyPortalOnSetupAssistantEnrolledDevices?: boolean | null;
  supervisedModeEnabled?: boolean | null;
  isMandatory?: boolean | null;
  profileRemovalDisabled?: boolean | null;
  appleIdDisabled?: boolean | null;
  companyPortalVppTokenId?: string | null;
  "@odata.type"?: string | null;
};

export type IntuneVppToken = {
  id: string;
  organizationName?: string | null;
  vppTokenAccountType?: string | null;
  state?: string | null;
  lastSyncStatus?: string | null;
  automaticallyUpdateApps?: boolean | null;
};

export type IntuneAppleApp = {
  id: string;
  displayName?: string | null;
  publisher?: string | null;
  description?: string | null;
  lastModifiedDateTime?: string | null;
  "@odata.type"?: string | null;
};

export type IntuneDirectoryGroup = {
  id: string;
  displayName?: string | null;
  securityEnabled?: boolean | null;
};

type IntuneMobileAppAssignment = {
  id: string;
  intent?: string | null;
  target?: {
    "@odata.type"?: string | null;
    groupId?: string | null;
  } | null;
};

export const THEOUTHAVEN_BUSINESS_STANDARD_PROFILE = "TheOutHaven - Standard Managed Device";
export const THEOUTHAVEN_ADE_PROFILE = "TheOutHaven - Standard Managed Device ADE";
export const THEOUTHAVEN_EXECUTIVE_GROUP = "TheOutHaven Executives";
export const THEOUTHAVEN_STANDARD_DEVICE_GROUP = "TheOutHaven Standard";

const BUSINESS_STANDARD_IOS_CONFIGURATION = {
  "@odata.type": "#microsoft.graph.iosGeneralDeviceConfiguration",
  displayName: THEOUTHAVEN_BUSINESS_STANDARD_PROFILE,
  description:
    "TheOutHaven Standard Managed Device baseline: normal iPhone/iPad behavior with company management, compliance, and remote security controls preserved.",
  appStoreBlocked: false,
  appStoreBlockUIAppInstallation: false,
  appStoreBlockAutomaticDownloads: false,
  appStoreBlockInAppPurchases: false,
  airDropBlocked: false,
  airDropForceUnmanagedDropTarget: false,
  cameraBlocked: false,
  bluetoothBlockModification: false,
  cellularBlockPerAppDataModification: false,
  cellularBlockPersonalHotspot: false,
  configurationProfileBlockChanges: false,
  deviceBlockEraseContentAndSettings: false,
  deviceBlockNameModification: false,
  documentsBlockManagedDocumentsInUnmanagedApps: false,
  documentsBlockUnmanagedDocumentsInManagedApps: false,
  faceTimeBlocked: false,
  iCloudBlockActivityContinuation: false,
  iCloudBlockBackup: false,
  iCloudBlockDocumentSync: false,
  iCloudBlockManagedAppsSync: false,
  iCloudBlockPhotoLibrary: false,
  iCloudBlockPhotoStreamSync: false,
  iCloudBlockSharedPhotoStream: false,
  iCloudRequireEncryptedBackup: true,
  messagesBlocked: false,
  notificationsBlockSettingsModification: false,
  passcodeRequired: true,
  passcodeMinutesOfInactivityBeforeLock: 0,
  passcodeBlockFingerprintUnlock: false,
  passcodeBlockFingerprintModification: false,
  passcodeBlockModification: false,
  siriBlocked: false,
  siriBlockedWhenLocked: false,
  voiceDialingBlocked: false,
  wallpaperBlockModification: false,
  safariRequireFraudWarning: true,
} as const;

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
  const devices = await getAllPages<IntuneManagedDevice>(
    userId,
    "/deviceManagement/managedDevices?$select=id,deviceName,userDisplayName,userPrincipalName,operatingSystem,osVersion,complianceState,managementAgent,managedDeviceOwnerType,enrolledDateTime,lastSyncDateTime,serialNumber,model,manufacturer,azureADDeviceId,deviceRegistrationState,jailBroken",
  );

  return devices.sort((a, b) => {
    const aTime = a.lastSyncDateTime ? new Date(a.lastSyncDateTime).getTime() : 0;
    const bTime = b.lastSyncDateTime ? new Date(b.lastSyncDateTime).getTime() : 0;
    return bTime - aTime;
  });
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

export async function listIntuneDepOnboardingSettings(userId: string) {
  const payload = await microsoftGraphBetaFetch<GraphCollection<IntuneDepOnboardingSetting>>(
    userId,
    "/deviceManagement/depOnboardingSettings?$select=id,tokenName,appleIdentifier,lastSuccessfulSyncDateTime,lastSyncErrorCode,lastSyncTriggeredDateTime,tokenExpirationDateTime",
  );
  return payload.value || [];
}

export async function syncIntuneAppleEnrollment(userId: string, depOnboardingSettingId?: string) {
  const settings = await listIntuneDepOnboardingSettings(userId);
  const selected = depOnboardingSettingId
    ? settings.find((setting) => setting.id === depOnboardingSettingId)
    : settings[0];
  if (!selected) throw new Error("INTUNE_ADE_TOKEN_NOT_FOUND");

  await microsoftGraphBetaFetch(
    userId,
    `/deviceManagement/depOnboardingSettings/${encodeURIComponent(selected.id)}/syncWithAppleDeviceEnrollmentProgram`,
    { method: "POST" },
  );
  return selected;
}

export async function listIntuneIosEnrollmentProfiles(userId: string, depOnboardingSettingId: string) {
  const payload = await microsoftGraphBetaFetch<GraphCollection<IntuneIosEnrollmentProfile>>(
    userId,
    `/deviceManagement/depOnboardingSettings/${encodeURIComponent(depOnboardingSettingId)}/enrollmentProfiles`,
  );
  return (payload.value || []).filter((profile) =>
    (profile["@odata.type"] || "").toLowerCase().includes("depiosenrollmentprofile"),
  );
}

export async function getDefaultIntuneIosEnrollmentProfile(userId: string, depOnboardingSettingId: string) {
  try {
    return await microsoftGraphBetaFetch<IntuneIosEnrollmentProfile>(
      userId,
      `/deviceManagement/depOnboardingSettings/${encodeURIComponent(depOnboardingSettingId)}/defaultIosEnrollmentProfile`,
    );
  } catch {
    return null;
  }
}

export async function listIntuneVppTokens(userId: string) {
  const payload = await microsoftGraphFetch<GraphCollection<IntuneVppToken>>(
    userId,
    "/deviceAppManagement/vppTokens?$select=id,organizationName,vppTokenAccountType,state,lastSyncStatus,automaticallyUpdateApps",
  );
  return payload.value || [];
}

export async function listIntuneAppleApps(userId: string) {
  const apps = await getAllPages<IntuneAppleApp>(
    userId,
    "/deviceAppManagement/mobileApps?$select=id,displayName,publisher,description,lastModifiedDateTime&$top=200",
  );

  return apps
    .filter((app) => {
      const type = (app["@odata.type"] || "").toLowerCase();
      return type.includes("iosvppapp") || type.includes("iosstoreapp");
    })
    .sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));
}

export async function listIntuneSecurityGroups(userId: string) {
  const groups = await getAllPages<IntuneDirectoryGroup>(
    userId,
    "/groups?$select=id,displayName,securityEnabled&$top=200",
  );
  return groups
    .filter((group) => group.securityEnabled && group.displayName)
    .sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));
}

function appAssignmentSettings(app: IntuneAppleApp) {
  const type = (app["@odata.type"] || "").toLowerCase();
  if (type.includes("iosvppapp")) {
    return {
      "@odata.type": "#microsoft.graph.iosVppAppAssignmentSettings",
      useDeviceLicensing: true,
    };
  }
  return {
    "@odata.type": "#microsoft.graph.iosStoreAppAssignmentSettings",
  };
}

async function upsertIntuneAppGroupAssignment(
  userId: string,
  app: IntuneAppleApp,
  groupId: string,
  intent: "available" | "required" | "uninstall",
) {
  const payload = await microsoftGraphFetch<GraphCollection<IntuneMobileAppAssignment>>(
    userId,
    `/deviceAppManagement/mobileApps/${encodeURIComponent(app.id)}/assignments`,
  );
  const existing = (payload.value || []).find(
    (assignment) => assignment.target?.groupId === groupId,
  );
  const body = {
    "@odata.type": "#microsoft.graph.mobileAppAssignment",
    intent,
    target: {
      "@odata.type": "#microsoft.graph.groupAssignmentTarget",
      groupId,
    },
    settings: appAssignmentSettings(app),
  };

  if (existing?.id) {
    await microsoftGraphFetch(
      userId,
      `/deviceAppManagement/mobileApps/${encodeURIComponent(app.id)}/assignments/${encodeURIComponent(existing.id)}`,
      { method: "PATCH", body: JSON.stringify(body) },
    );
  } else {
    await microsoftGraphFetch(
      userId,
      `/deviceAppManagement/mobileApps/${encodeURIComponent(app.id)}/assignments`,
      { method: "POST", body: JSON.stringify(body) },
    );
  }
}

async function getIntuneAppleApp(userId: string, appId: string) {
  const apps = await listIntuneAppleApps(userId);
  const app = apps.find((candidate) => candidate.id === appId);
  if (!app) throw new Error("INTUNE_APP_NOT_FOUND");
  return app;
}

export async function assignIntuneAppleAppToGroup(
  userId: string,
  appId: string,
  groupId: string,
  intent: "available" | "required" | "uninstall",
) {
  const app = await getIntuneAppleApp(userId, appId);
  const groups = await listIntuneSecurityGroups(userId);
  if (!groups.some((group) => group.id === groupId)) {
    throw new Error("INTUNE_GROUP_NOT_FOUND");
  }
  await upsertIntuneAppGroupAssignment(userId, app, groupId, intent);
}

export async function getOrCreateIntuneExecutiveGroup(userId: string) {
  const existing = (await listIntuneSecurityGroups(userId)).find(
    (group) => group.displayName === THEOUTHAVEN_EXECUTIVE_GROUP,
  );
  if (existing) return existing;

  return microsoftGraphFetch<IntuneDirectoryGroup>(userId, "/groups", {
    method: "POST",
    body: JSON.stringify({
      displayName: THEOUTHAVEN_EXECUTIVE_GROUP,
      description:
        "TheOutHaven executive user group for apps and policies restricted to executive staff.",
      mailEnabled: false,
      mailNickname: "theouthaven-executives",
      securityEnabled: true,
      groupTypes: [],
    }),
  });
}

export async function getOrCreateIntuneStandardGroup(userId: string) {
  return getOrCreateNamedUserSecurityGroup(
    userId,
    THEOUTHAVEN_STANDARD_DEVICE_GROUP,
    "theouthaven-standard",
    "TheOutHaven standard managed-device user group.",
  );
}

async function getOrCreateNamedUserSecurityGroup(
  userId: string,
  displayName: string,
  mailNickname: string,
  description: string,
) {
  const existing = (await listIntuneSecurityGroups(userId)).find(
    (group) => group.displayName === displayName,
  );
  if (existing) return existing;

  return microsoftGraphFetch<IntuneDirectoryGroup>(userId, "/groups", {
    method: "POST",
    body: JSON.stringify({
      displayName,
      description,
      mailEnabled: false,
      mailNickname,
      securityEnabled: true,
      groupTypes: [],
    }),
  });
}

async function resolveMicrosoftUserObjectId(userId: string, email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) throw new Error("MICROSOFT_USER_EMAIL_REQUIRED");

  try {
    const direct = await microsoftGraphFetch<{ id?: string }>(
      userId,
      `/users/${encodeURIComponent(normalized)}?$select=id`,
    );
    if (direct?.id) return direct.id;
  } catch {
    // Fall back to mail/UPN lookup below.
  }

  const escaped = normalized.replace(/'/g, "''");
  const filter = encodeURIComponent(
    `userPrincipalName eq '${escaped}' or mail eq '${escaped}'`,
  );
  const payload = await microsoftGraphFetch<GraphCollection<{ id: string }>>(
    userId,
    `/users?$filter=${filter}&$select=id&$top=2`,
  );
  const objectId = payload.value?.[0]?.id;
  if (!objectId) throw new Error("MICROSOFT_USER_NOT_FOUND");
  return objectId;
}

async function addDirectoryObjectToGroup(userId: string, groupId: string, objectId: string) {
  const members = await listGroupMemberIds(userId, groupId);
  if (members.has(objectId)) return;
  await microsoftGraphFetch(
    userId,
    `/groups/${encodeURIComponent(groupId)}/members/$ref`,
    {
      method: "POST",
      body: JSON.stringify({
        "@odata.id": `https://graph.microsoft.com/v1.0/directoryObjects/${objectId}`,
      }),
    },
  );
}

async function removeDirectoryObjectFromGroup(userId: string, groupId: string, objectId: string) {
  const members = await listGroupMemberIds(userId, groupId);
  if (!members.has(objectId)) return;
  await microsoftGraphFetch(
    userId,
    `/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(objectId)}/$ref`,
    { method: "DELETE" },
  );
}

export async function assignMicrosoftUserToDeviceGroup(
  userId: string,
  email: string,
  group: "standard" | "executive",
) {
  const [standardGroup, executiveGroup, objectId] = await Promise.all([
    getOrCreateNamedUserSecurityGroup(
      userId,
      THEOUTHAVEN_STANDARD_DEVICE_GROUP,
      "theouthaven-standard",
      "TheOutHaven standard managed-device user group.",
    ),
    getOrCreateIntuneExecutiveGroup(userId),
    resolveMicrosoftUserObjectId(userId, email),
  ]);

  if (group === "executive") {
    await addDirectoryObjectToGroup(userId, executiveGroup.id, objectId);
    await removeDirectoryObjectFromGroup(userId, standardGroup.id, objectId);
    return executiveGroup;
  }

  await addDirectoryObjectToGroup(userId, standardGroup.id, objectId);
  await removeDirectoryObjectFromGroup(userId, executiveGroup.id, objectId);
  return standardGroup;
}

export async function assignIntuneAppleAppToExecutives(
  userId: string,
  appId: string,
  intent: "available" | "uninstall",
) {
  const app = await getIntuneAppleApp(userId, appId);
  const group = await getOrCreateIntuneExecutiveGroup(userId);
  await upsertIntuneAppGroupAssignment(userId, app, group.id, intent);
}

export async function assignIntuneAppleAppToProfile(
  userId: string,
  appId: string,
  profile: "standard" | "executive",
  intent: "available" | "uninstall",
) {
  const app = await getIntuneAppleApp(userId, appId);
  const group =
    profile === "executive"
      ? await getOrCreateIntuneExecutiveGroup(userId)
      : await getOrCreateIntuneStandardGroup(userId);
  await upsertIntuneAppGroupAssignment(userId, app, group.id, intent);
}

async function getOrCreateAppDeviceTargetGroup(
  userId: string,
  app: IntuneAppleApp,
  intent: "required" | "uninstall",
) {
  const suffix = intent === "required" ? "Install" : "Remove";
  const displayName = `TheOutHaven App ${suffix} · ${app.displayName || app.id}`.slice(0, 120);
  const existing = (await listIntuneSecurityGroups(userId)).find(
    (group) => group.displayName === displayName,
  );
  if (existing) return existing;

  return microsoftGraphFetch<IntuneDirectoryGroup>(userId, "/groups", {
    method: "POST",
    body: JSON.stringify({
      displayName,
      description: `Managed by TheOutHaven Admin for Intune app ${suffix.toLowerCase()} targets.`,
      mailEnabled: false,
      mailNickname: `toh-app-${intent}-${app.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 20)}`,
      securityEnabled: true,
      groupTypes: [],
    }),
  });
}

async function resolveEntraDeviceObjectId(userId: string, azureAdDeviceId: string) {
  const escaped = azureAdDeviceId.replace(/'/g, "''");
  const filter = encodeURIComponent(`deviceId eq '${escaped}'`);
  const payload = await microsoftGraphFetch<GraphCollection<{ id: string }>>(
    userId,
    `/devices?$filter=${filter}&$select=id&$top=1`,
  );
  const objectId = payload.value?.[0]?.id;
  if (!objectId) throw new Error("ENTRA_DEVICE_NOT_FOUND");
  return objectId;
}

async function listGroupMemberIds(userId: string, groupId: string) {
  const members = await getAllPages<{ id: string }>(
    userId,
    `/groups/${encodeURIComponent(groupId)}/members?$select=id&$top=200`,
  );
  return new Set(members.map((member) => member.id));
}

async function addDeviceToGroup(userId: string, groupId: string, objectId: string) {
  const members = await listGroupMemberIds(userId, groupId);
  if (members.has(objectId)) return;
  await microsoftGraphFetch(
    userId,
    `/groups/${encodeURIComponent(groupId)}/members/$ref`,
    {
      method: "POST",
      body: JSON.stringify({
        "@odata.id": `https://graph.microsoft.com/v1.0/directoryObjects/${objectId}`,
      }),
    },
  );
}

async function removeDeviceFromGroup(userId: string, groupId: string, objectId: string) {
  const members = await listGroupMemberIds(userId, groupId);
  if (!members.has(objectId)) return;
  await microsoftGraphFetch(
    userId,
    `/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(objectId)}/$ref`,
    { method: "DELETE" },
  );
}

export async function assignIntuneAppleAppToDevices(
  userId: string,
  appId: string,
  managedDeviceIds: string[],
  intent: "required" | "uninstall",
) {
  const app = await getIntuneAppleApp(userId, appId);
  const devices = await listIntuneManagedDevices(userId);
  const selected = devices.filter(
    (device) =>
      managedDeviceIds.includes(device.id) &&
      ["iOS", "iPadOS"].includes(device.operatingSystem || "") &&
      device.azureADDeviceId,
  );
  if (!selected.length) throw new Error("INTUNE_APP_DEVICE_TARGET_REQUIRED");

  const desiredGroup = await getOrCreateAppDeviceTargetGroup(userId, app, intent);
  const oppositeIntent = intent === "required" ? "uninstall" : "required";
  const oppositeGroup = await getOrCreateAppDeviceTargetGroup(userId, app, oppositeIntent);

  await Promise.all([
    upsertIntuneAppGroupAssignment(userId, app, desiredGroup.id, intent),
    upsertIntuneAppGroupAssignment(userId, app, oppositeGroup.id, oppositeIntent),
  ]);

  for (const device of selected) {
    const objectId = await resolveEntraDeviceObjectId(userId, device.azureADDeviceId as string);
    await addDeviceToGroup(userId, desiredGroup.id, objectId);
    await removeDeviceFromGroup(userId, oppositeGroup.id, objectId);
  }
}

async function getPreferredCompanyPortalVppToken(userId: string) {
  const tokens = await listIntuneVppTokens(userId);
  const usable = tokens.filter((token) => (token.state || "").toLowerCase() === "valid");
  return (
    usable.find((token) => (token.vppTokenAccountType || "").toLowerCase() === "business") ||
    usable[0] ||
    null
  );
}

function standardManagedAdeProfilePayload(companyPortalVppTokenId: string) {
  return {
    "@odata.type": "#microsoft.graph.depIOSEnrollmentProfile",
    displayName: THEOUTHAVEN_ADE_PROFILE,
    description:
      "TheOutHaven employee iPhone/iPad ADE profile: supervised company ownership, user affinity, no personal Apple Account setup, and Company Portal delivered with Apple Apps and Books.",
    requiresUserAuthentication: true,
    enableAuthenticationViaCompanyPortal: false,
    supervisedModeEnabled: true,
    isMandatory: true,
    profileRemovalDisabled: true,
    appleIdDisabled: true,
    requireCompanyPortalOnSetupAssistantEnrolledDevices: true,
    companyPortalVppTokenId,
    enableSingleAppEnrollmentMode: false,
    enableSharedIPad: false,
    userlessSharedAadModeEnabled: false,
    passCodeDisabled: false,
    touchIdDisabled: false,
    applePayDisabled: false,
    siriDisabled: false,
    diagnosticsDisabled: false,
    displayToneSetupDisabled: false,
    privacyPaneDisabled: false,
    screenTimeScreenDisabled: false,
    locationDisabled: false,
    termsAndConditionsDisabled: false,
    restoreBlocked: true,
    restoreFromAndroidDisabled: true,
    deviceToDeviceMigrationDisabled: true,
    iTunesPairingMode: "allow",
  } as const;
}

export async function ensureDefaultIntuneIosEnrollmentProfile(userId: string, depOnboardingSettingId: string) {
  const [currentDefault, profiles, vppToken] = await Promise.all([
    getDefaultIntuneIosEnrollmentProfile(userId, depOnboardingSettingId),
    listIntuneIosEnrollmentProfiles(userId, depOnboardingSettingId),
    getPreferredCompanyPortalVppToken(userId),
  ]);

  if (!vppToken?.id) {
    throw new Error("INTUNE_APPLE_APPS_AND_BOOKS_TOKEN_REQUIRED");
  }

  const preferred =
    profiles.find((profile) => profile.displayName === THEOUTHAVEN_ADE_PROFILE) ||
    profiles.find((profile) => /theouthaven|standard managed/i.test(profile.displayName || "")) ||
    currentDefault ||
    null;

  const payload = standardManagedAdeProfilePayload(vppToken.id);
  let profile: IntuneIosEnrollmentProfile;

  if (preferred?.id) {
    profile = await microsoftGraphBetaFetch<IntuneIosEnrollmentProfile>(
      userId,
      `/deviceManagement/depOnboardingSettings/${encodeURIComponent(depOnboardingSettingId)}/enrollmentProfiles/${encodeURIComponent(preferred.id)}`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      },
    );
  } else {
    profile = await microsoftGraphBetaFetch<IntuneIosEnrollmentProfile>(
      userId,
      `/deviceManagement/depOnboardingSettings/${encodeURIComponent(depOnboardingSettingId)}/enrollmentProfiles`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
  }

  if (!profile?.id) throw new Error("INTUNE_ADE_IOS_ENROLLMENT_PROFILE_NOT_FOUND");

  if (!profile.isDefault) {
    await microsoftGraphBetaFetch(
      userId,
      `/deviceManagement/depOnboardingSettings/${encodeURIComponent(depOnboardingSettingId)}/enrollmentProfiles/${encodeURIComponent(profile.id)}/setDefaultProfile`,
      { method: "POST" },
    );
  }

  return { ...profile, isDefault: true };
}

export async function assignIntuneIosEnrollmentProfileToSerial(
  userId: string,
  depOnboardingSettingId: string,
  enrollmentProfileId: string,
  serialNumber: string,
) {
  const serial = serialNumber.trim();
  if (!serial) throw new Error("INTUNE_ADE_DEVICE_SERIAL_REQUIRED");

  await microsoftGraphBetaFetch(
    userId,
    `/deviceManagement/depOnboardingSettings/${encodeURIComponent(depOnboardingSettingId)}/enrollmentProfiles/${encodeURIComponent(enrollmentProfileId)}/updateDeviceProfileAssignment`,
    {
      method: "POST",
      body: JSON.stringify({ deviceIds: [serial] }),
    },
  );
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


export async function getBusinessStandardProfile(userId: string) {
  const profiles = await getAllPages<IntuneIosConfiguration>(
    userId,
    "/deviceManagement/deviceConfigurations?$select=id,displayName,description",
  );
  return profiles.find((profile) => profile.displayName === THEOUTHAVEN_BUSINESS_STANDARD_PROFILE) || null;
}

export async function applyBusinessStandardProfile(userId: string) {
  const existing = await getBusinessStandardProfile(userId);
  let profileId = existing?.id;

  if (profileId) {
    await microsoftGraphFetch(
      userId,
      `/deviceManagement/deviceConfigurations/${encodeURIComponent(profileId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(BUSINESS_STANDARD_IOS_CONFIGURATION),
      },
    );
  } else {
    const created = await microsoftGraphFetch<IntuneIosConfiguration>(
      userId,
      "/deviceManagement/deviceConfigurations",
      {
        method: "POST",
        body: JSON.stringify(BUSINESS_STANDARD_IOS_CONFIGURATION),
      },
    );
    profileId = created.id;
  }

  if (!profileId) throw new Error("INTUNE_BUSINESS_STANDARD_PROFILE_MISSING_ID");

  await microsoftGraphFetch(
    userId,
    `/deviceManagement/deviceConfigurations/${encodeURIComponent(profileId)}/assign`,
    {
      method: "POST",
      body: JSON.stringify({
        assignments: [
          {
            "@odata.type": "#microsoft.graph.deviceConfigurationAssignment",
            target: {
              "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget",
            },
          },
        ],
      }),
    },
  );

  return { id: profileId, displayName: THEOUTHAVEN_BUSINESS_STANDARD_PROFILE };
}
