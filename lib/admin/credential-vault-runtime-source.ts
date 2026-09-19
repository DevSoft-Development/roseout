import "server-only";

import type { CredentialProviderId } from "@/lib/admin/credential-vault-catalog";
import { getCredentialVaultRuntimeSnapshot, type CredentialVaultEnvironment } from "@/lib/aws/admin-credential-vault";

type RuntimeEnvMap = Partial<Record<CredentialProviderId, Record<string, readonly string[]>>>;

export const RUNTIME_ENV_MAP: RuntimeEnvMap = {
  google: { apiKey: ["GOOGLE_PLACES_API_KEY", "GOOGLE_GEOCODING_API_KEY"], clientId: ["GOOGLE_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_ID"], clientSecret: ["GOOGLE_CLIENT_SECRET", "GOOGLE_OAUTH_CLIENT_SECRET"] },
  supabase: { url: ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"], publishableKey: ["NEXT_PUBLIC_SUPABASE_ANON_KEY"], serviceRoleKey: ["SUPABASE_SERVICE_ROLE_KEY"] },
  vercel: { token: ["VERCEL_TOKEN"], teamId: ["VERCEL_TEAM_ID", "VERCEL_ORG_ID"] },
  github: { token: ["GITHUB_TOKEN"], appId: ["GITHUB_APP_ID"], privateKey: ["GITHUB_APP_PRIVATE_KEY"] },
  microsoft: { tenantId: ["MICROSOFT_TENANT_ID", "AZURE_TENANT_ID"], clientId: ["MICROSOFT_CLIENT_ID", "AZURE_CLIENT_ID"], clientSecret: ["MICROSOFT_CLIENT_SECRET", "AZURE_CLIENT_SECRET"], tokenEncryptionKey: ["M365_TOKEN_ENCRYPTION_KEY"] },
  openai: { apiKey: ["OPENAI_API_KEY"] },
  huggingface: { token: ["SEARCH_HF_ML_TOKEN", "HF_TOKEN", "HUGGINGFACE_TOKEN"] },
  brave: { apiKey: ["BRAVE_SEARCH_API_KEY"] },
  serpapi: { apiKey: ["SERPAPI_API_KEY"] },
  stripe: { secretKey: ["STRIPE_SECRET_KEY"], webhookSecret: ["STRIPE_WEBHOOK_SECRET"], connectWebhookSecret: ["STRIPE_CONNECT_WEBHOOK_SECRET"] },
  resend: { apiKey: ["RESEND_API_KEY"], webhookSecret: ["RESEND_WEBHOOK_SECRET"] },
  twilio: { accountSid: ["TWILIO_ACCOUNT_SID"], authToken: ["TWILIO_AUTH_TOKEN"] },
  telnyx: {
    publicKey: ["TELNYX_PUBLIC_KEY"],
    transactionalApiKey: ["TELNYX_TRANSACTIONAL_API_KEY", "TELNYX_API_KEY"],
    reservationsApiKey: ["TELNYX_RESERVATIONS_API_KEY"],
    crmApiKey: ["TELNYX_CRM_API_KEY"],
    supportApiKey: ["TELNYX_SUPPORT_API_KEY"],
    marketingApiKey: ["TELNYX_MARKETING_API_KEY"],
    conciergeApiKey: ["TELNYX_CONCIERGE_API_KEY"],
  },
  threecx: { crmApiKey: ["THREE_CX_CRM_API_KEY"] },
  meta: { appId: ["META_APP_ID", "FACEBOOK_APP_ID"], appSecret: ["META_APP_SECRET", "FACEBOOK_APP_SECRET"], instagramAppId: ["INSTAGRAM_APP_ID", "META_INSTAGRAM_APP_ID"], instagramAppSecret: ["INSTAGRAM_APP_SECRET", "META_INSTAGRAM_APP_SECRET"], graphVersion: ["META_GRAPH_VERSION"], loginConfigurationId: ["META_LOGIN_CONFIGURATION_ID"], accessToken: ["META_ACCESS_TOKEN", "FACEBOOK_ACCESS_TOKEN"] },
  tiktok: { clientKey: ["TIKTOK_CLIENT_KEY"], clientSecret: ["TIKTOK_CLIENT_SECRET"] },
  apple: { issuerId: ["APPLE_BUSINESS_API_CLIENT_ID", "APPLE_CLIENT_ID"], keyId: ["APPLE_BUSINESS_API_KEY_ID", "APPLE_KEY_ID"], privateKey: ["APPLE_BUSINESS_API_PRIVATE_KEY", "APPLE_PRIVATE_KEY"] },
  turnstile: { secretKey: ["TURNSTILE_SECRET_KEY"] },
  expo: { accessToken: ["EXPO_ACCESS_TOKEN"] },
  domains: { apiKey: ["DOMAIN_PROVIDER_API_KEY"], apiSecret: ["DOMAIN_PROVIDER_API_SECRET"], accountId: ["DOMAIN_PROVIDER_ACCOUNT_ID"], gatewaySecret: ["DOMAIN_GATEWAY_SECRET"] },
  platform: {
    cronSecret: ["CRON_SECRET"],
    importSecret: ["IMPORT_SECRET"],
    internalImportSecret: ["INTERNAL_IMPORT_SECRET"],
    outingReminderCronSecret: ["OUTING_REMINDER_CRON_SECRET"],
    googleLocationEnrichmentCronSecret: ["GOOGLE_LOCATION_ENRICHMENT_CRON_SECRET"],
    adminApiSecret: ["ADMIN_API_SECRET"],
    adminDigestSecret: ["ADMIN_DIGEST_SECRET"],
    notificationSecret: ["NOTIFICATION_SECRET"],
    supportEmailWebhookSecret: ["SUPPORT_EMAIL_WEBHOOK_SECRET"],
    supportInboundSecret: ["SUPPORT_INBOUND_SECRET"],
    websiteHostingGatewaySecret: ["AWS_WEBSITE_HOSTING_GATEWAY_SECRET"],
    drGatewaySecret: ["AWS_PLATFORM_DR_GATEWAY_SECRET"],
    jobGatewaySecret: ["AWS_PLATFORM_JOB_GATEWAY_SECRET"],
    integrationApiSecret: ["AWS_PLATFORM_INTEGRATION_API_SECRET"],
    assistantApiSecret: ["AWS_PLATFORM_ASSISTANT_API_SECRET"],
  },
};

let hydrated = false;
let hydrationPromise: Promise<void> | null = null;

export function credentialVaultEnvironmentName(): CredentialVaultEnvironment {
  return process.env.VERCEL_ENV === "preview" || process.env.NODE_ENV !== "production" ? "staging" : "production";
}

export async function getCredentialVaultProviderValues(
  provider: CredentialProviderId,
  environment: CredentialVaultEnvironment = credentialVaultEnvironmentName(),
) {
  const snapshot = await getCredentialVaultRuntimeSnapshot(environment);
  return { ...(snapshot.providers[provider] || {}) };
}

export async function hydrateCredentialVaultRuntime(options: { force?: boolean } = {}) {
  if (hydrated && !options.force) return;
  if (hydrationPromise) return hydrationPromise;
  hydrationPromise = (async () => {
    if (!String(process.env.AWS_PLATFORM_JOB_GATEWAY_URL || "").trim() || !String(process.env.AWS_PLATFORM_JOB_GATEWAY_SECRET || "").trim()) return;
    const snapshot = await getCredentialVaultRuntimeSnapshot(credentialVaultEnvironmentName());
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
  }).finally(() => { hydrationPromise = null; });
  return hydrationPromise;
}
