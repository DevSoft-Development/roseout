import "server-only";

import { credentialVaultEnvironmentName, getCredentialVaultProviderValues } from "@/lib/admin/credential-vault-runtime-source";

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

const TENANT_ENV_KEYS = ["M365_TENANT_ID", "MICROSOFT_TENANT_ID", "AZURE_TENANT_ID"] as const;
const CLIENT_ENV_KEYS = ["M365_CLIENT_ID", "MICROSOFT_CLIENT_ID", "AZURE_CLIENT_ID"] as const;

function resolveConsistentEnv(keys: readonly string[], label: string) {
  const configured = keys
    .map((key) => ({ key, value: process.env[key]?.trim() || "" }))
    .filter((entry) => entry.value);

  if (!configured.length) return "";
  const distinct = [...new Set(configured.map((entry) => entry.value))];
  if (distinct.length > 1) throw new Error(`${label}_ENV_CONFLICT`);
  return distinct[0];
}

function validateTenantId(value: string) {
  const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const dns = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
  if (!guid.test(value) && !dns.test(value)) throw new Error("M365_TENANT_ID_INVALID");
  return value;
}

export async function getMicrosoft365Config(options?: { redirectUri?: string | null }) {
  const environment = credentialVaultEnvironmentName();
  let tenantId = "";
  let clientId = "";

  try {
    const microsoft = await getCredentialVaultProviderValues("microsoft", environment);
    tenantId = String(microsoft.tenantId || "").trim();
    clientId = String(microsoft.clientId || "").trim();
  } catch {
    if (environment === "production") throw new Error("M365_CREDENTIAL_VAULT_UNAVAILABLE");
  }

  if (environment !== "production") {
    tenantId ||= resolveConsistentEnv(TENANT_ENV_KEYS, "M365_TENANT");
    clientId ||= resolveConsistentEnv(CLIENT_ENV_KEYS, "M365_CLIENT");
  }

  const appUrl = (process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_URL || "https://theouthaven.com").replace(/\/$/, "");
  const requestedRedirectUri = options?.redirectUri?.trim() || "";
  const redirectUri = requestedRedirectUri || process.env.M365_REDIRECT_URI?.trim() || `${appUrl}/api/admin/integrations/microsoft-365/callback`;
  if (!tenantId || !clientId) throw new Error("M365_NOT_CONFIGURED");
  validateTenantId(tenantId);
  return {
    tenantId,
    clientId,
    redirectUri,
    authorizeUrl: `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/authorize`,
    scopes: [...MICROSOFT_365_SCOPES],
  };
}
