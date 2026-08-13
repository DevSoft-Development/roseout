import "server-only";

import crypto from "node:crypto";

export type DomainSearchResult = {
  ok: boolean;
  domain: string;
  available: boolean;
  status: string;
  responseCode: string | null;
  responseText: string | null;
};

export type DomainQuoteResult = {
  ok: boolean;
  domain: string;
  period: number;
  regType: "new" | "renewal" | "transfer" | "trade";
  wholesalePrice: number;
  currency: string;
  isRegistryPremium: boolean;
  registryPremiumGroup: string | null;
  responseCode: string | null;
  responseText: string | null;
};

function getGatewayConfig() {
  const baseUrl = process.env.DOMAIN_GATEWAY_URL?.replace(/\/$/, "");
  const secret = process.env.DOMAIN_GATEWAY_SECRET;
  if (!baseUrl || !secret) throw new Error("Domain gateway is not configured.");
  return { baseUrl, secret };
}

export async function domainGatewayRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { baseUrl, secret } = getGatewayConfig();
  const method = (init.method || "GET").toUpperCase();
  const body = typeof init.body === "string" ? init.body : "";
  const timestamp = Date.now().toString();
  const payload = [timestamp, method, path, body].join("\n");
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("hex");

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    method,
    cache: "no-store",
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      "x-toh-timestamp": timestamp,
      "x-toh-signature": signature,
      ...(init.headers || {}),
    },
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data && typeof data.error === "string" ? data.error : `Domain gateway request failed (${response.status}).`;
    throw new Error(message);
  }
  return data as T;
}

export function searchDomain(domain: string) {
  const body = JSON.stringify({ domain });
  return domainGatewayRequest<DomainSearchResult>("/v1/domains/search", { method: "POST", body });
}

export function quoteDomain(domain: string, regType: DomainQuoteResult["regType"], period = 1) {
  const body = JSON.stringify({ domain, regType, period });
  return domainGatewayRequest<DomainQuoteResult>("/v1/domains/quote", { method: "POST", body });
}

export function getDomainGatewayStatus() {
  return domainGatewayRequest<{ ok: boolean; authenticated: boolean; registrationEnabled: boolean }>("/v1/status");
}
