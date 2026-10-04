import "server-only";

import { getCredentialVaultProviderValues } from "@/lib/admin/credential-vault-runtime-source";
import type { CredentialProviderId } from "@/lib/admin/credential-vault-catalog";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { LOCATION_INTELLIGENCE_PROVIDER_REGISTRY } from "@/lib/location-intelligence/v2/providers";

const VAULT_PROVIDERS = new Set<CredentialProviderId>(["google","dataforseo","mapbox","brave","serpapi"]);

function requiredFields(provider: string) {
  if (provider === "dataforseo") return ["login","password"];
  if (provider === "mapbox") return ["accessToken"];
  if (provider === "google" || provider === "brave" || provider === "serpapi") return ["apiKey"];
  return [];
}

export function mergeProviderHealthMetadata(
  metadata: unknown,
  detail?: string,
): Record<string, unknown> {
  const existing =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? { ...(metadata as Record<string, unknown>) }
      : {};
  if (detail) existing.detail = detail;
  else delete existing.detail;
  return existing;
}

export async function refreshLocationIntelligenceProviderHealth() {
  const results: Array<{ provider: string; status: string; detail?: string }> = [];
  const { data: providerRows, error: providerRowsError } = await supabaseAdmin
    .from("location_provider_registry")
    .select("provider,metadata");
  if (providerRowsError) {
    throw new Error(`Provider health metadata load failed: ${providerRowsError.message}`);
  }
  const metadataByProvider = new Map(
    (providerRows || []).map((row) => [String(row.provider), row.metadata]),
  );

  for (const provider of LOCATION_INTELLIGENCE_PROVIDER_REGISTRY) {
    let status = provider.enabled ? "healthy" : "disabled";
    let detail: string | undefined;

    if (provider.enabled && VAULT_PROVIDERS.has(provider.id as CredentialProviderId)) {
      try {
        const values = await getCredentialVaultProviderValues(provider.id as CredentialProviderId);
        const missing = requiredFields(provider.id).filter((field) => !String(values[field] || "").trim());
        if (missing.length) {
          status = "missing_credentials";
          detail = `missing:${missing.join(",")}`;
        }
      } catch (error) {
        status = "unavailable";
        detail = error instanceof Error ? error.message : "vault_unavailable";
      }
    }

    const { error } = await supabaseAdmin
      .from("location_provider_registry")
      .update({
        health_status: status,
        last_health_check_at: new Date().toISOString(),
        metadata: mergeProviderHealthMetadata(metadataByProvider.get(provider.id), detail),
        updated_at: new Date().toISOString(),
      })
      .eq("provider", provider.id);
    if (error) throw new Error(`Provider health update failed for ${provider.id}: ${error.message}`);

    results.push({ provider: provider.id, status, ...(detail ? { detail } : {}) });
  }

  return results;
}
