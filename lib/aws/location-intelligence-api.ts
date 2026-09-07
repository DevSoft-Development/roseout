import { createHmac } from "node:crypto";

export type GoogleBudgetUsageItem = {
  sku: string;
  label: string;
  requests: number;
  freeCap: number | null;
  billableRequests: number;
  pricePer1000: number;
  estimatedCostUsd: number;
};

export type GooglePlacesBudgetSettings = {
  targetUsd: number;
  softCapUsd: number;
  hardCapUsd: number;
  creditBalanceUsd: number;
  openingSpendUsd: number;
  openingSpendMonth: string | null;
  minimumCreditReserveUsd: number;
  enabled: boolean;
  updatedAt?: string | null;
};

export type GoogleBudgetSummary = {
  ok: true;
  service: "location-intelligence-api";
  month: string;
  measuredAt: string;
  pricingSnapshot: string;
  settings: GooglePlacesBudgetSettings;
  meteredSpendUsd: number;
  estimatedSpendUsd: number;
  budgetRemainingUsd: number;
  targetRemainingUsd: number;
  estimatedCreditsRemainingUsd: number;
  percentOfHardCapUsed: number;
  percentOfCreditUsed: number;
  operatingMode: "normal" | "reduce_low_priority" | "critical_only" | "stop_optional_paid_google" | "disabled";
  optionalPaidWorkAllowed: boolean;
  usage: GoogleBudgetUsageItem[];
  notes: string[];
};

export type LocationReadinessResponse = {
  ok: true;
  locationId: string;
  currentSearchable: boolean;
  recommendedSearchable: boolean;
  blockers: string[];
  warnings: string[];
  claimed: boolean;
  routineGoogleRefreshAllowed: boolean;
  profile: Record<string, unknown> | null;
};

function config() {
  const baseUrl = String(process.env.AWS_LOCATION_INTELLIGENCE_API_URL || "").trim().replace(/\/$/, "");
  const secret = String(
    process.env.AWS_LOCATION_INTELLIGENCE_API_SECRET
      || process.env.AWS_PLATFORM_JOB_GATEWAY_SECRET
      || "",
  ).trim();
  if (!baseUrl || !secret) throw new Error("aws_location_intelligence_api_not_configured");
  if (!/^https:\/\//i.test(baseUrl)) throw new Error("aws_location_intelligence_api_requires_https");
  return { baseUrl, secret };
}

export function locationIntelligenceApiConfigured() {
  try {
    config();
    return true;
  } catch {
    return false;
  }
}

async function signedFetch(path: string, method: "GET" | "POST", payload?: unknown, timeoutMs = 20_000) {
  const { baseUrl, secret } = config();
  const body = method === "POST" ? JSON.stringify(payload ?? {}) : "";
  const timestamp = Date.now().toString();
  const signature = createHmac("sha256", secret)
    .update([timestamp, method, path, body].join("\n"))
    .digest("hex");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${baseUrl}${path}`, {
      method,
      cache: "no-store",
      signal: controller.signal,
      headers: {
        ...(method === "POST" ? { "content-type": "application/json" } : {}),
        "x-toh-timestamp": timestamp,
        "x-toh-signature": signature,
      },
      ...(method === "POST" ? { body } : {}),
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function signedJson<T>(path: string, method: "GET" | "POST", payload?: unknown): Promise<T> {
  const response = await signedFetch(path, method, payload);
  const parsed = await response.json().catch(() => null) as T | { error?: string } | null;
  if (!response.ok) {
    throw new Error((parsed as { error?: string } | null)?.error || `aws_location_intelligence_api_http_${response.status}`);
  }
  return parsed as T;
}

export function readGoogleBudgetSummaryViaLocationIntelligenceApi() {
  return signedJson<GoogleBudgetSummary>("/v1/google-budget/summary", "GET");
}

export function evaluateLocationReadinessViaLocationIntelligenceApi(locationId: string) {
  return signedJson<LocationReadinessResponse>("/v1/location/readiness", "POST", { locationId });
}
