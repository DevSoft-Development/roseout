import "server-only";

import { createHmac } from "node:crypto";

export type PlatformDrProbe = {
  healthy: boolean;
  status: number | null;
  latencyMs: number | null;
  origin: string | null;
  revision: string | null;
  url?: string | null;
  error?: string | null;
};

export type PlatformDrSurface = {
  key: "public" | "admin" | "locations";
  label: string;
  path: string;
  primary: PlatformDrProbe;
  standby: PlatformDrProbe;
};

export type PlatformDrStatus = {
  ok: boolean;
  configured: boolean;
  environment: string;
  state: {
    mode: "normal" | "forced_failover";
    drillId: string | null;
    startedAt: string | null;
    expiresAt: string | null;
  };
  primary: PlatformDrProbe;
  standby: PlatformDrProbe;
  compute: {
    desiredTasks: number;
    runningTasks: number;
    pendingTasks: number;
    healthyTargets: number;
    unhealthyTargets: number;
  };
  surfaces: PlatformDrSurface[];
  routing?: {
    healthCheckId?: string | null;
    cloudFrontDomain?: string | null;
    primaryRecordConfigured?: boolean;
    secondaryRecordConfigured?: boolean;
  };
};

type GatewayErrorPayload = {
  ok?: boolean;
  error?: string;
  code?: string;
};

export class PlatformDrGatewayError extends Error {
  status: number;
  code: string;

  constructor(status: number, payload: GatewayErrorPayload | null) {
    const code = payload?.error || `platform_dr_gateway_http_${status}`;
    super(code);
    this.name = "PlatformDrGatewayError";
    this.status = status;
    this.code = code;
  }
}

function gatewayConfig() {
  const baseUrl = String(process.env.AWS_PLATFORM_DR_GATEWAY_URL || "").trim().replace(/\/$/, "");
  const secret = String(process.env.AWS_PLATFORM_DR_GATEWAY_SECRET || "").trim();
  if (!baseUrl || !secret) throw new Error("aws_platform_dr_gateway_not_configured");
  if (!/^https:\/\//i.test(baseUrl)) throw new Error("aws_platform_dr_gateway_requires_https");
  return { baseUrl, secret };
}

export function platformDrConfigured() {
  return Boolean(
    process.env.AWS_PLATFORM_DR_GATEWAY_URL?.trim()
      && process.env.AWS_PLATFORM_DR_GATEWAY_SECRET?.trim(),
  );
}

async function gatewayRequest<T>(path: string, body?: string, method = "POST"): Promise<T> {
  const { baseUrl, secret } = gatewayConfig();
  const timestamp = Date.now().toString();
  const normalizedMethod = method.toUpperCase();
  const payload = [timestamp, normalizedMethod, path, body || ""].join("\n");
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: normalizedMethod,
      cache: "no-store",
      signal: controller.signal,
      headers: {
        ...(body ? { "content-type": "application/json" } : {}),
        "x-toh-timestamp": timestamp,
        "x-toh-signature": signature,
      },
      ...(body ? { body } : {}),
    });
    const data = await response.json().catch(() => null) as T | GatewayErrorPayload | null;
    if (!response.ok) throw new PlatformDrGatewayError(response.status, data as GatewayErrorPayload | null);
    return data as T;
  } finally {
    clearTimeout(timeout);
  }
}

export function getPlatformDrStatus() {
  return gatewayRequest<PlatformDrStatus>("/v1/status", undefined, "GET");
}

export function simulatePlatformDr() {
  return gatewayRequest<PlatformDrStatus>("/v1/drill/simulate", JSON.stringify({}));
}

export function startPlatformDrLiveDrill(input: { confirmation: string; durationSeconds?: number }) {
  return gatewayRequest<PlatformDrStatus>("/v1/drill/start", JSON.stringify(input));
}

export function failbackPlatformDr(input: { confirmation: string }) {
  return gatewayRequest<PlatformDrStatus>("/v1/drill/failback", JSON.stringify(input));
}
