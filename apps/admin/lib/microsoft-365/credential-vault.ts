import "server-only";

import { createHmac } from "node:crypto";

type CredentialVaultEnvironment = "production" | "staging";
type RuntimeSnapshot = {
  providers?: {
    microsoft?: {
      tenantId?: string;
      clientId?: string;
      clientSecret?: string;
    };
  };
};

function environmentName(): CredentialVaultEnvironment {
  return process.env.VERCEL_ENV === "preview" || process.env.NODE_ENV !== "production"
    ? "staging"
    : "production";
}

function gatewayConfig() {
  const baseUrl = String(process.env.AWS_PLATFORM_JOB_GATEWAY_URL || "")
    .trim()
    .replace(/\/$/, "");
  const secret = String(process.env.AWS_PLATFORM_JOB_GATEWAY_SECRET || "").trim();

  if (!baseUrl || !secret) throw new Error("credential_vault_gateway_not_configured");
  if (!/^https:\/\//i.test(baseUrl)) {
    throw new Error("credential_vault_gateway_requires_https");
  }

  return { baseUrl, secret };
}

export async function getMicrosoftCredentialVaultValues() {
  const environment = environmentName();
  const { baseUrl, secret } = gatewayConfig();
  const path = `/v1/credentials/runtime?environment=${encodeURIComponent(environment)}`;
  const timestamp = Date.now().toString();
  const signature = createHmac("sha256", secret)
    .update([timestamp, "GET", path, ""].join("\n"))
    .digest("hex");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "x-toh-timestamp": timestamp,
        "x-toh-signature": signature,
      },
    });

    const data = (await response.json().catch(() => null)) as
      | RuntimeSnapshot
      | { error?: string }
      | null;

    if (!response.ok) {
      throw new Error(
        (data as { error?: string } | null)?.error ||
          `credential_vault_gateway_http_${response.status}`,
      );
    }

    return {
      environment,
      values: (data as RuntimeSnapshot | null)?.providers?.microsoft || {},
    };
  } finally {
    clearTimeout(timeout);
  }
}
