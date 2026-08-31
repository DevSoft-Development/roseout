import "server-only";

import type { CredentialProviderId } from "@/lib/admin/credential-vault-catalog";
import { getCredentialVaultRuntimeSnapshot, type CredentialVaultEnvironment } from "@/lib/aws/admin-credential-vault";

type RuntimeEnvMap = Partial<Record<CredentialProviderId, Record<string, readonly string[]>>>;

const RUNTIME_ENV_MAP: RuntimeEnvMap = {
  google: {
    apiKey: ["GOOGLE_PLACES_API_KEY", "GOOGLE_GEOCODING_API_KEY"],
    clientId: ["GOOGLE_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_ID"],
    clientSecret: ["GOOGLE_CLIENT_SECRET", "GOOGLE_OAUTH_CLIENT_SECRET"],
  },
  supabase: {
    url: ["SUPABASE_URL"],
    publishableKey: ["NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    serviceRoleKey: ["SUPABASE_SERVICE_ROLE_KEY"],
  },
  vercel: {
    token: ["VERCEL_TOKEN"],
    teamId: ["VERCEL_TEAM_ID", "VERCEL_ORG_ID"],
  },
  github: {
    token: ["GITHUB_TOKEN"],
    appId: ["GITHUB_APP_ID"],
    privateKey: ["GITHUB_APP_PRIVATE_KEY"],
  },
  microsoft: {
    tenantId: ["AZURE_TENANT_ID", "MICROSOFT_TENANT_ID"],
    clientId: ["AZURE_CLIENT_ID", "MICROSOFT_CLIENT_ID"],
    clientSecret: ["AZURE_CLIENT_SECRET", "MICROSOFT_CLIENT_SECRET"],
  },
  huggingface: {
    token: ["SEARCH_HF_ML_TOKEN", "HF_TOKEN", "HUGGINGFACE_TOKEN"],
  },
  resend: {
    apiKey: ["RESEND_API_KEY"],
  },
  twilio: {
    accountSid: ["TWILIO_ACCOUNT_SID"],
    authToken: ["TWILIO_AUTH_TOKEN"],
  },
  meta: {
    appId: ["META_APP_ID", "FACEBOOK_APP_ID"],
    appSecret: ["META_APP_SECRET", "FACEBOOK_APP_SECRET"],
    accessToken: ["META_ACCESS_TOKEN", "FACEBOOK_ACCESS_TOKEN"],
  },
  tiktok: {
    clientKey: ["TIKTOK_CLIENT_KEY"],
    clientSecret: ["TIKTOK_CLIENT_SECRET"],
  },
  apple: {
    clientId: ["APPLE_BUSINESS_API_CLIENT_ID"],
    keyId: ["APPLE_BUSINESS_API_KEY_ID"],
    privateKey: ["APPLE_BUSINESS_API_PRIVATE_KEY"],
  },
  domains: {
    apiKey: ["DOMAIN_PROVIDER_API_KEY"],
    apiSecret: ["DOMAIN_PROVIDER_API_SECRET"],
    accountId: ["DOMAIN_PROVIDER_ACCOUNT_ID"],
  },
};

let hydrated = false;
let hydrationPromise: Promise<void> | null = null;

function environmentName(): CredentialVaultEnvironment {
  return process.env.VERCEL_ENV === "preview" || process.env.NODE_ENV !== "production" ? "staging" : "production";
}

export async function hydrateCredentialVaultRuntime() {
  if (hydrated) return;
  if (hydrationPromise) return hydrationPromise;

  hydrationPromise = (async () => {
    const gatewayUrl = String(process.env.AWS_PLATFORM_JOB_GATEWAY_URL || "").trim();
    const gatewaySecret = String(process.env.AWS_PLATFORM_JOB_GATEWAY_SECRET || "").trim();
    if (!gatewayUrl || !gatewaySecret) return;

    const snapshot = await getCredentialVaultRuntimeSnapshot(environmentName());
    for (const [provider, fields] of Object.entries(snapshot.providers) as Array<[CredentialProviderId, Record<string, string>]>) {
      const fieldMap = RUNTIME_ENV_MAP[provider];
      if (!fieldMap) continue;
      for (const [field, value] of Object.entries(fields)) {
        if (!value) continue;
        for (const envName of fieldMap[field] || []) process.env[envName] = value;
      }
    }
    hydrated = true;
  })().catch((error) => {
    console.error("credential_vault_runtime_hydration_failed", error instanceof Error ? error.message : "unknown_error");
  }).finally(() => {
    hydrationPromise = null;
  });

  return hydrationPromise;
}
