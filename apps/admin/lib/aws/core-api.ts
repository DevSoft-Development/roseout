import "server-only";

import { createHmac } from "node:crypto";

export type CoreAdminBillingMetrics = {
  activePaidLocations: number;
  trialingLocations: number;
  pastDueLocations: number;
  canceledThisMonth: number;
  mrrCents: number;
  arrCents: number;
  collectedThisMonthCents: number;
  upcoming7d: number;
  upcoming30d: number;
  pastDueEstimatedCents: number;
};

export type CoreAdminBillingResponse = {
  success: true;
  sourceError: boolean;
  metrics: CoreAdminBillingMetrics;
  upcomingRows: Array<Record<string, unknown>>;
  pastDueRows: Array<Record<string, unknown>>;
  recentEvents: Array<Record<string, unknown>>;
  trialRows: Array<Record<string, unknown>>;
};

export type CoreSupportOperationsSettingsResponse = {
  success: true;
  groups: Array<Record<string, unknown>>;
  slas: Array<Record<string, unknown>>;
  businessHours: Array<Record<string, unknown>>;
  macros: Array<Record<string, unknown>>;
  triggers: Array<Record<string, unknown>>;
  automations: Array<Record<string, unknown>>;
};

export type CoreCommunicationScope = "crm" | "reservations" | "support";
export type CoreCommunicationFeedItem = {
  id: string;
  locationId: string | null;
  locationName: string | null;
  channel: string;
  direction: string | null;
  title: string;
  preview: string;
  status: string | null;
  unread: boolean;
  timestamp: string;
  href: string;
};
export type CoreCrmCommunicationCenterResponse = {
  scope: CoreCommunicationScope;
  items: CoreCommunicationFeedItem[];
  unreadCount: number;
  waitingCount: number;
};

export type CoreSupportCaseResponse = {
  success: true;
  ticket: Record<string, unknown>;
  messages: Array<Record<string, unknown>>;
  activities: Array<Record<string, unknown>>;
};

export type CoreCrmOperationsBucket = {
  data: Array<Record<string, unknown>>;
  count: number;
};

export type CoreCrmOperationsSnapshotResponse = {
  success: true;
  claims: CoreCrmOperationsBucket;
  hidden: CoreCrmOperationsBucket;
  support: CoreCrmOperationsBucket;
  tasks: CoreCrmOperationsBucket;
  codes: CoreCrmOperationsBucket;
};

export type CoreCrmReportSnapshotResponse = {
  success: true;
  start: string;
  end: string;
  opps: Array<Record<string, unknown>>;
  claims: Array<Record<string, unknown>>;
  support: Array<Record<string, unknown>>;
  outreach: Array<Record<string, unknown>>;
};

function config() {
  const baseUrl = String(process.env.AWS_PLATFORM_CORE_API_URL || "").trim().replace(/\/$/, "");
  const secret = String(process.env.AWS_PLATFORM_CORE_API_SECRET || process.env.AWS_PLATFORM_JOB_GATEWAY_SECRET || "").trim();
  if (!baseUrl || !secret) throw new Error("aws_platform_core_api_not_configured");
  if (!/^https:\/\//i.test(baseUrl)) throw new Error("aws_platform_core_api_requires_https");
  return { baseUrl, secret };
}

async function signedJson<T>(path: string, body = "{}", timeoutMs = 18_000): Promise<T> {
  const { baseUrl, secret } = config();
  const timestamp = Date.now().toString();
  const signature = createHmac("sha256", secret).update([timestamp, "POST", path, body].join("\n")).digest("hex");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: { "content-type": "application/json", "x-toh-timestamp": timestamp, "x-toh-signature": signature },
      body,
    });
    const payload = await response.json().catch(() => null) as T | { error?: string } | null;
    if (!response.ok) throw new Error((payload as { error?: string } | null)?.error || `aws_platform_core_api_http_${response.status}`);
    return payload as T;
  } finally {
    clearTimeout(timeout);
  }
}

export function platformCoreApiConfigured() {
  return Boolean(
    String(process.env.AWS_PLATFORM_CORE_API_URL || "").trim()
      && String(process.env.AWS_PLATFORM_CORE_API_SECRET || process.env.AWS_PLATFORM_JOB_GATEWAY_SECRET || "").trim(),
  );
}

export function readCrmOperationsSnapshotViaCoreApi() {
  return signedJson<CoreCrmOperationsSnapshotResponse>("/v1/crm/operations-snapshot/read", "{}", 15_000);
}

export function readCrmReportSnapshotViaCoreApi(input: { start?: string; end?: string }) {
  return signedJson<CoreCrmReportSnapshotResponse>(
    "/v1/crm/report-snapshot/read",
    JSON.stringify(input),
    15_000,
  );
}

export function readSupportOperationsSettingsViaCoreApi() {
  return signedJson<CoreSupportOperationsSettingsResponse>("/v1/crm/support/settings/read", "{}", 15_000);
}

export function readCrmCommunicationCenterViaCoreApi(scope: CoreCommunicationScope) {
  return signedJson<CoreCrmCommunicationCenterResponse>(
    "/v1/crm/communication-center/read",
    JSON.stringify({ scope }),
    15_000,
  );
}

export function readSupportCaseViaCoreApi(ticketId: string) {
  return signedJson<CoreSupportCaseResponse>(
    "/v1/crm/support/case/read",
    JSON.stringify({ ticketId }),
    15_000,
  );
}

export function readAdminBillingViaCoreApi() {
  return signedJson<CoreAdminBillingResponse>("/v1/admin/billing/read");
}
