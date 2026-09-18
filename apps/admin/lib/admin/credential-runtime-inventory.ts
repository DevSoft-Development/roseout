import "server-only";

import type { CredentialProviderId } from "@/lib/admin/credential-vault-catalog";

type RuntimeFieldSource = { field: string; env: readonly string[] };
type ProviderRuntimeMapping = { source: string; fields: readonly RuntimeFieldSource[]; roleManaged?: boolean };

const RUNTIME_MAPPINGS: Partial<Record<CredentialProviderId, ProviderRuntimeMapping>> = {
  aws: { source: "AWS IAM role / OIDC", roleManaged: true, fields: [] },
  google: { source: "Runtime environment", fields: [
    { field: "apiKey", env: ["GOOGLE_PLACES_API_KEY", "GOOGLE_GEOCODING_API_KEY"] },
    { field: "clientId", env: ["GOOGLE_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_ID"] },
    { field: "clientSecret", env: ["GOOGLE_CLIENT_SECRET", "GOOGLE_OAUTH_CLIENT_SECRET"] },
  ] },
  supabase: { source: "Runtime environment", fields: [
    { field: "url", env: ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"] },
    { field: "publishableKey", env: ["NEXT_PUBLIC_SUPABASE_ANON_KEY"] },
    { field: "serviceRoleKey", env: ["SUPABASE_SERVICE_ROLE_KEY"] },
  ] },
  microsoft: { source: "Runtime environment", fields: [
    { field: "tenantId", env: ["MICROSOFT_TENANT_ID", "AZURE_TENANT_ID", "M365_TENANT_ID"] },
    { field: "clientId", env: ["MICROSOFT_CLIENT_ID", "AZURE_CLIENT_ID", "M365_CLIENT_ID"] },
    { field: "clientSecret", env: ["MICROSOFT_CLIENT_SECRET", "AZURE_CLIENT_SECRET", "M365_CLIENT_SECRET"] },
  ] },
  openai: { source: "Runtime environment", fields: [{ field: "apiKey", env: ["OPENAI_API_KEY"] }] },
  huggingface: { source: "Runtime environment", fields: [{ field: "token", env: ["SEARCH_HF_ML_TOKEN", "HF_TOKEN", "HUGGINGFACE_TOKEN"] }] },
  brave: { source: "Runtime environment", fields: [{ field: "apiKey", env: ["BRAVE_SEARCH_API_KEY"] }] },
  serpapi: { source: "Runtime environment", fields: [{ field: "apiKey", env: ["SERPAPI_API_KEY"] }] },
  stripe: { source: "Runtime environment / AWS integration secret", fields: [
    { field: "secretKey", env: ["STRIPE_SECRET_KEY"] },
    { field: "webhookSecret", env: ["STRIPE_WEBHOOK_SECRET"] },
    { field: "connectWebhookSecret", env: ["STRIPE_CONNECT_WEBHOOK_SECRET"] },
  ] },
  resend: { source: "Runtime environment", fields: [
    { field: "apiKey", env: ["RESEND_API_KEY"] },
    { field: "webhookSecret", env: ["RESEND_WEBHOOK_SECRET"] },
  ] },
  twilio: { source: "Runtime environment", fields: [
    { field: "accountSid", env: ["TWILIO_ACCOUNT_SID"] }, { field: "authToken", env: ["TWILIO_AUTH_TOKEN"] },
  ] },
  telnyx: { source: "Runtime environment / AWS integration secret", fields: [
    { field: "publicKey", env: ["TELNYX_PUBLIC_KEY"] },
    { field: "transactionalApiKey", env: ["TELNYX_TRANSACTIONAL_API_KEY", "TELNYX_API_KEY"] },
    { field: "reservationsApiKey", env: ["TELNYX_RESERVATIONS_API_KEY"] },
    { field: "crmApiKey", env: ["TELNYX_CRM_API_KEY"] },
    { field: "supportApiKey", env: ["TELNYX_SUPPORT_API_KEY"] },
    { field: "marketingApiKey", env: ["TELNYX_MARKETING_API_KEY"] },
    { field: "conciergeApiKey", env: ["TELNYX_CONCIERGE_API_KEY"] },
  ] },
  threecx: { source: "Runtime environment", fields: [{ field: "crmApiKey", env: ["THREE_CX_CRM_API_KEY"] }] },
  meta: { source: "Runtime environment", fields: [
    { field: "appId", env: ["META_APP_ID", "FACEBOOK_APP_ID"] },
    { field: "appSecret", env: ["META_APP_SECRET", "FACEBOOK_APP_SECRET"] },
    { field: "instagramAppId", env: ["INSTAGRAM_APP_ID", "META_INSTAGRAM_APP_ID"] },
    { field: "instagramAppSecret", env: ["INSTAGRAM_APP_SECRET", "META_INSTAGRAM_APP_SECRET"] },
    { field: "graphVersion", env: ["META_GRAPH_VERSION"] },
    { field: "loginConfigurationId", env: ["META_LOGIN_CONFIGURATION_ID"] },
    { field: "accessToken", env: ["META_ACCESS_TOKEN", "FACEBOOK_ACCESS_TOKEN"] },
  ] },
  tiktok: { source: "Runtime environment", fields: [
    { field: "clientKey", env: ["TIKTOK_CLIENT_KEY"] }, { field: "clientSecret", env: ["TIKTOK_CLIENT_SECRET"] },
  ] },
  apple: { source: "Runtime environment", fields: [
    { field: "issuerId", env: ["APPLE_BUSINESS_API_CLIENT_ID", "APPLE_CLIENT_ID"] },
    { field: "keyId", env: ["APPLE_BUSINESS_API_KEY_ID", "APPLE_KEY_ID"] },
    { field: "privateKey", env: ["APPLE_BUSINESS_API_PRIVATE_KEY", "APPLE_PRIVATE_KEY"] },
  ] },
  turnstile: { source: "Runtime environment", fields: [{ field: "secretKey", env: ["TURNSTILE_SECRET_KEY"] }] },
  expo: { source: "Runtime environment", fields: [{ field: "accessToken", env: ["EXPO_ACCESS_TOKEN"] }] },
  vercel: { source: "Vercel account / project", fields: [
    { field: "token", env: ["VERCEL_TOKEN"] }, { field: "teamId", env: ["VERCEL_TEAM_ID", "VERCEL_ORG_ID"] },
  ] },
  github: { source: "GitHub Actions / GitHub App", fields: [
    { field: "token", env: ["GITHUB_TOKEN"] }, { field: "appId", env: ["GITHUB_APP_ID"] }, { field: "privateKey", env: ["GITHUB_APP_PRIVATE_KEY"] },
  ] },
  domains: { source: "AWS / registrar gateway", fields: [
    { field: "apiKey", env: ["DOMAIN_PROVIDER_API_KEY"] },
    { field: "apiSecret", env: ["DOMAIN_PROVIDER_API_SECRET"] },
    { field: "accountId", env: ["DOMAIN_PROVIDER_ACCOUNT_ID"] },
    { field: "gatewaySecret", env: ["DOMAIN_GATEWAY_SECRET"] },
  ] },
  platform: { source: "Runtime environment / AWS service configuration", fields: [
    { field: "cronSecret", env: ["CRON_SECRET"] },
    { field: "importSecret", env: ["IMPORT_SECRET"] },
    { field: "internalImportSecret", env: ["INTERNAL_IMPORT_SECRET"] },
    { field: "outingReminderCronSecret", env: ["OUTING_REMINDER_CRON_SECRET"] },
    { field: "googleLocationEnrichmentCronSecret", env: ["GOOGLE_LOCATION_ENRICHMENT_CRON_SECRET"] },
    { field: "adminApiSecret", env: ["ADMIN_API_SECRET"] },
    { field: "adminDigestSecret", env: ["ADMIN_DIGEST_SECRET"] },
    { field: "notificationSecret", env: ["NOTIFICATION_SECRET"] },
    { field: "supportEmailWebhookSecret", env: ["SUPPORT_EMAIL_WEBHOOK_SECRET"] },
    { field: "supportInboundSecret", env: ["SUPPORT_INBOUND_SECRET"] },
    { field: "websiteHostingGatewaySecret", env: ["AWS_WEBSITE_HOSTING_GATEWAY_SECRET"] },
    { field: "drGatewaySecret", env: ["AWS_PLATFORM_DR_GATEWAY_SECRET"] },
    { field: "jobGatewaySecret", env: ["AWS_PLATFORM_JOB_GATEWAY_SECRET"] },
    { field: "integrationApiSecret", env: ["AWS_PLATFORM_INTEGRATION_API_SECRET"] },
    { field: "assistantApiSecret", env: ["AWS_PLATFORM_ASSISTANT_API_SECRET"] },
  ] },
};

function firstValue(names: readonly string[]) {
  for (const name of names) {
    const value = String(process.env[name] || "").trim();
    if (value) return value;
  }
  return "";
}

export type RuntimeCredentialStatus = {
  provider: CredentialProviderId;
  externalConfiguredFields: string[];
  externalSource: string | null;
  migrationState: "vault_managed" | "runtime_importable" | "role_managed" | "reentry_required" | "not_configured";
};

export function getRuntimeCredentialStatus(provider: CredentialProviderId, vaultConfiguredFields: readonly string[]): RuntimeCredentialStatus {
  if (vaultConfiguredFields.length) return { provider, externalConfiguredFields: [], externalSource: null, migrationState: "vault_managed" };
  const mapping = RUNTIME_MAPPINGS[provider];
  if (mapping?.roleManaged) return { provider, externalConfiguredFields: [], externalSource: mapping.source, migrationState: "role_managed" };
  const externalConfiguredFields = (mapping?.fields || []).filter((entry) => Boolean(firstValue(entry.env))).map((entry) => entry.field);
  if (externalConfiguredFields.length) return { provider, externalConfiguredFields, externalSource: mapping?.source || "Runtime configuration", migrationState: "runtime_importable" };
  if (provider === "github" || provider === "domains" || provider === "platform") return { provider, externalConfiguredFields: [], externalSource: mapping?.source || null, migrationState: "reentry_required" };
  return { provider, externalConfiguredFields: [], externalSource: mapping?.source || null, migrationState: "not_configured" };
}

export function getRuntimeCredentialValues(provider: CredentialProviderId) {
  const mapping = RUNTIME_MAPPINGS[provider];
  if (!mapping || mapping.roleManaged) return {};
  const values: Record<string, string> = {};
  for (const entry of mapping.fields) {
    const value = firstValue(entry.env);
    if (value) values[entry.field] = value;
  }
  return values;
}
