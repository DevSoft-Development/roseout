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

async function updateProviderHealthRow(
  providerId: string,
  status: string,
  detail?: string,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: row, error: readError } = await supabaseAdmin
      .from("location_provider_registry")
      .select("provider,metadata,updated_at")
      .eq("provider", providerId)
      .maybeSingle();
    if (readError) {
      throw new Error(`Provider health metadata load failed for ${providerId}: ${readError.message}`);
    }
    if (!row?.provider) {
      throw new Error(`Provider health row missing for ${providerId}`);
    }

    const now = new Date().toISOString();
    let update = supabaseAdmin
      .from("location_provider_registry")
      .update({
        health_status: status,
        last_health_check_at: now,
        metadata: mergeProviderHealthMetadata(row.metadata, detail),
        updated_at: now,
      })
      .eq("provider", providerId);

    update = row.updated_at
      ? update.eq("updated_at", row.updated_at)
      : update.is("updated_at", null);

    const { data: updated, error: updateError } = await update
      .select("provider")
      .maybeSingle();
    if (updateError) {
      throw new Error(`Provider health update failed for ${providerId}: ${updateError.message}`);
    }
    if (updated?.provider) return;
  }

  throw new Error(`Provider health update conflicted repeatedly for ${providerId}`);
}

export async function refreshLocationIntelligenceProviderHealth() {
  const results: Array<{ provider: string; status: string; detail?: string }> = [];

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

    await updateProviderHealthRow(provider.id, status, detail);

    results.push({ provider: provider.id, status, ...(detail ? { detail } : {}) });
  }

  return results;
}
