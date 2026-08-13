import "server-only";

import crypto from "node:crypto";
import type { GatewayDnsRecord } from "@/lib/domains/dns-records";

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

export type DomainRegistrantContact = {
  first_name: string;
  last_name: string;
  org_name?: string;
  address1: string;
  address2?: string;
  city: string;
  state?: string;
  postal_code: string;
  country: string;
  phone: string;
  email: string;
};

export type DomainRegistrationResult = {
  ok: boolean;
  domain: string;
  status: "pending" | "registered";
  orderId: string | null;
  expirationDate: string | null;
  responseCode: string | null;
  idempotentReplay?: boolean;
};

export type DomainDnsConfigurationResult = {
  ok: boolean;
  domain: string;
  status: "configured";
};

type GatewayErrorPayload = {
  error?: string;
  registrationSucceeded?: boolean;
  domain?: string;
  responseCode?: string | null;
};

export class DomainGatewayError extends Error {
  status: number;
  code: string;
  registrationSucceeded: boolean;
  responseCode: string | null;

  constructor(status: number, payload: GatewayErrorPayload | null) {
    const code = payload?.error || `gateway_http_${status}`;
    super(code);
    this.name = "DomainGatewayError";
    this.status = status;
    this.code = code;
    this.registrationSucceeded = payload?.registrationSucceeded === true;
    this.responseCode = payload?.responseCode || null;
  }
}

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
    throw new DomainGatewayError(response.status, data as GatewayErrorPayload | null);
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

export function registerDomain(domain: string, contact: DomainRegistrantContact, idempotencyKey: string) {
  const body = JSON.stringify({ domain, period: 1, autoRenew: false, contact });
  return domainGatewayRequest<DomainRegistrationResult>("/v1/domains/register", {
    method: "POST",
    body,
    headers: { "x-idempotency-key": idempotencyKey },
  });
}

export function configureDomainDns(domain: string, records: GatewayDnsRecord[]) {
  const body = JSON.stringify({ domain, records });
  return domainGatewayRequest<DomainDnsConfigurationResult>("/v1/domains/dns/configure", {
    method: "POST",
    body,
  });
}

export function getDomainGatewayStatus() {
  return domainGatewayRequest<{ ok: boolean; authenticated: boolean; registrationEnabled: boolean; dnsChangesEnabled?: boolean }>("/v1/status");
}
