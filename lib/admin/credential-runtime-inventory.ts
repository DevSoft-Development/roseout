import "server-only";

import type { CredentialProviderId } from "@/lib/admin/credential-vault-catalog";

type RuntimeFieldSource = {
  field: string;
  env: readonly string[];
};

type ProviderRuntimeMapping = {
  source: string;
  fields: readonly RuntimeFieldSource[];
  roleManaged?: boolean;
};

const RUNTIME_MAPPINGS: Partial<Record<CredentialProviderId, ProviderRuntimeMapping>> = {
  aws: {
    source: "AWS IAM role / OIDC",
    roleManaged: true,
    fields: [],
  },
  google: {
    source: "Vercel runtime environment",
    fields: [{ field: "apiKey", env: ["GOOGLE_PLACES_API_KEY", "GOOGLE_GEOCODING_API_KEY"] }],
  },
  supabase: {
    source: "Vercel runtime environment",
    fields: [
      { field: "url", env: ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"] },
      { field: "publishableKey", env: ["NEXT_PUBLIC_SUPABASE_ANON_KEY"] },
      { field: "serviceRoleKey", env: ["SUPABASE_SERVICE_ROLE_KEY"] },
    ],
  },
  microsoft: {
    source: "Vercel runtime environment",
    fields: [
      { field: "tenantId", env: ["AZURE_TENANT_ID", "MICROSOFT_TENANT_ID"] },
      { field: "clientId", env: ["AZURE_CLIENT_ID", "MICROSOFT_CLIENT_ID"] },
      { field: "clientSecret", env: ["AZURE_CLIENT_SECRET", "MICROSOFT_CLIENT_SECRET"] },
    ],
  },
  huggingface: {
    source: "Vercel runtime environment",
    fields: [{ field: "token", env: ["SEARCH_HF_ML_TOKEN", "HF_TOKEN", "HUGGINGFACE_TOKEN"] }],
  },
  resend: {
    source: "Vercel runtime environment",
    fields: [{ field: "apiKey", env: ["RESEND_API_KEY"] }],
  },
  twilio: {
    source: "Vercel runtime environment",
    fields: [
      { field: "accountSid", env: ["TWILIO_ACCOUNT_SID"] },
      { field: "authToken", env: ["TWILIO_AUTH_TOKEN"] },
    ],
  },
  meta: {
    source: "Vercel runtime environment",
    fields: [
      { field: "appId", env: ["META_APP_ID", "FACEBOOK_APP_ID"] },
      { field: "appSecret", env: ["META_APP_SECRET", "FACEBOOK_APP_SECRET"] },
      { field: "accessToken", env: ["META_ACCESS_TOKEN", "FACEBOOK_ACCESS_TOKEN"] },
    ],
  },
  tiktok: {
    source: "Vercel runtime environment",
    fields: [
      { field: "clientKey", env: ["TIKTOK_CLIENT_KEY"] },
      { field: "clientSecret", env: ["TIKTOK_CLIENT_SECRET"] },
    ],
  },
  apple: {
    source: "Vercel runtime environment",
    fields: [
      { field: "issuerId", env: ["APPLE_ISSUER_ID"] },
      { field: "keyId", env: ["APPLE_KEY_ID"] },
      { field: "privateKey", env: ["APPLE_PRIVATE_KEY"] },
    ],
  },
  vercel: {
    source: "Vercel account / project",
    fields: [
      { field: "token", env: ["VERCEL_TOKEN"] },
      { field: "teamId", env: ["VERCEL_ORG_ID"] },
    ],
  },
  github: {
    source: "GitHub Actions / GitHub App",
    fields: [
      { field: "token", env: ["GITHUB_TOKEN"] },
      { field: "appId", env: ["GITHUB_APP_ID"] },
      { field: "privateKey", env: ["GITHUB_APP_PRIVATE_KEY"] },
    ],
  },
  domains: {
    source: "AWS / registrar gateway",
    fields: [],
  },
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

export function getRuntimeCredentialStatus(
  provider: CredentialProviderId,
  vaultConfiguredFields: readonly string[],
): RuntimeCredentialStatus {
  if (vaultConfiguredFields.length) {
    return {
      provider,
      externalConfiguredFields: [],
      externalSource: null,
      migrationState: "vault_managed",
    };
  }

  const mapping = RUNTIME_MAPPINGS[provider];
  if (mapping?.roleManaged) {
    return {
      provider,
      externalConfiguredFields: [],
      externalSource: mapping.source,
      migrationState: "role_managed",
    };
  }

  const externalConfiguredFields = (mapping?.fields || [])
    .filter((entry) => Boolean(firstValue(entry.env)))
    .map((entry) => entry.field);

  if (externalConfiguredFields.length) {
    return {
      provider,
      externalConfiguredFields,
      externalSource: mapping?.source || "Runtime configuration",
      migrationState: "runtime_importable",
    };
  }

  if (provider === "github" || provider === "domains") {
    return {
      provider,
      externalConfiguredFields: [],
      externalSource: mapping?.source || null,
      migrationState: "reentry_required",
    };
  }

  return {
    provider,
    externalConfiguredFields: [],
    externalSource: mapping?.source || null,
    migrationState: "not_configured",
  };
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
