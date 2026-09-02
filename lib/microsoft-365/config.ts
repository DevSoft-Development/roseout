import "server-only";

export const MICROSOFT_365_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "User.Read",
  "Mail.ReadWrite",
  "Mail.Send",
  "Calendars.ReadWrite",
  "Tasks.ReadWrite",
  "DeviceManagementManagedDevices.ReadWrite.All",
  "DeviceManagementConfiguration.ReadWrite.All",
  "DeviceManagementApps.Read.All",
  "DeviceManagementServiceConfig.ReadWrite.All",
] as const;

export function getMicrosoft365Config() {
  const tenantId = (process.env.M365_TENANT_ID || process.env.MICROSOFT_TENANT_ID || process.env.AZURE_TENANT_ID)?.trim();
  const clientId = (process.env.M365_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID || process.env.AZURE_CLIENT_ID)?.trim();
  const appUrl = (process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_URL || "https://theouthaven.com").replace(/\/$/, "");
  const redirectUri = process.env.M365_REDIRECT_URI?.trim() || `${appUrl}/api/admin/integrations/microsoft-365/callback`;
  if (!tenantId || !clientId) throw new Error("M365_NOT_CONFIGURED");
  return {
    tenantId,
    clientId,
    redirectUri,
    authorizeUrl: `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/authorize`,
    scopes: [...MICROSOFT_365_SCOPES],
  };
}
