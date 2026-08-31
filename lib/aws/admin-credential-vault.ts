import "server-only";

import { createHmac } from "node:crypto";
import type { CredentialProviderId } from "@/lib/admin/credential-vault-catalog";

export type CredentialVaultEnvironment = "production" | "staging";

export type CredentialVaultProviderStatus = {
  provider: CredentialProviderId;
  environment: CredentialVaultEnvironment;
  configuredFields: string[];
  updatedAt: string | null;
  versionId: string | null;
  status: "configured" | "not_configured";
};

export type CredentialVaultSummary = {
  ok: boolean;
  providers: CredentialVaultProviderStatus[];
};

function getGatewayConfig() {
  const baseUrl = String(process.env.AWS_PLATFORM_JOB_GATEWAY_URL || "").trim().replace(/\/$/, "");
  const secret = String(process.env.AWS_PLATFORM_JOB_GATEWAY_SECRET || "").trim();
  if (!baseUrl || !secret) throw new Error("credential_vault_gateway_not_configured");
  if (!/^https:\/\//i.test(baseUrl)) throw new Error("credential_vault_gateway_requires_https");
  return { baseUrl, secret };
}

async function signedRequest<T>(method: "GET" | "PUT" | "DELETE" | "POST", path: string, body = ""): Promise<T> {
  const { baseUrl, secret } = getGatewayConfig();
  const timestamp = Date.now().toString();
  const payload = [timestamp, method, path, body].join("\n");
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      cache: "no-store",
      signal: controller.signal,
      headers: {
        ...(body ? { "content-type": "application/json" } : {}),
        "x-toh-timestamp": timestamp,
        "x-toh-signature": signature,
      },
      ...(body ? { body } : {}),
    });
    const data = await response.json().catch(() => null) as T | { error?: string } | null;
    if (!response.ok) {
      throw new Error((data as { error?: string } | null)?.error || `credential_vault_gateway_http_${response.status}`);
    }
    return data as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getCredentialVaultSummary(environment: CredentialVaultEnvironment) {
  return signedRequest<CredentialVaultSummary>("GET", `/v1/credentials?environment=${encodeURIComponent(environment)}`);
}

export async function updateCredentialVaultProvider(input: {
  provider: CredentialProviderId;
  environment: CredentialVaultEnvironment;
  values: Record<string, string>;
  clearFields?: string[];
}) {
  return signedRequest<{ ok: boolean; provider: CredentialProviderId; configuredFields: string[]; updatedAt: string | null; versionId: string | null }>(
    "PUT",
    `/v1/credentials/${encodeURIComponent(input.provider)}`,
    JSON.stringify({ environment: input.environment, values: input.values, clearFields: input.clearFields || [] }),
  );
}

export async function deleteCredentialVaultProvider(provider: CredentialProviderId, environment: CredentialVaultEnvironment) {
  return signedRequest<{ ok: boolean; provider: CredentialProviderId }>(
    "DELETE",
    `/v1/credentials/${encodeURIComponent(provider)}?environment=${encodeURIComponent(environment)}`,
  );
}

export async function testCredentialVaultProvider(provider: CredentialProviderId, environment: CredentialVaultEnvironment) {
  return signedRequest<{ ok: boolean; provider: CredentialProviderId; status: "healthy" | "configured"; detail: string }>(
    "POST",
    `/v1/credentials/${encodeURIComponent(provider)}/test`,
    JSON.stringify({ environment }),
  );
}
