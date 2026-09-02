import "server-only";

import { createHmac } from "node:crypto";
import type { CrmRecordContext } from "@/lib/crm/context";

export type CoreCrmContextResponse = {
  context: CrmRecordContext;
  labels: {
    location: { id: string; name: string | null; city: string | null; state: string | null } | null;
    account: { id: string; name: string | null } | null;
    contact: { id: string; full_name: string | null; email: string | null } | null;
    opportunity: { id: string; name: string | null } | null;
  };
};

export type CoreCrmLocationHealthResponse = {
  success: true;
  rows: Array<Record<string, unknown>>;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  duplicateCount: number;
  activeRun: Record<string, unknown> | null;
  latestRun: Record<string, unknown> | null;
  reviewItems: Array<{
    locationId: string;
    name: string;
    reasons: string[];
    changedFields: string[];
    lastError: string | null;
  }>;
  ownerUpdateCount: number;
};

export type CoreCrmLocationHealthInput = {
  page: number;
  pageSize: number;
  q: string;
  view: string;
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

export type CoreCrmSmsRecipient = {
  contactId: string;
  name: string;
  role: string;
  phone: string;
  isPrimary: boolean;
  isDecisionMaker: boolean;
  smsConsentStatus: string;
  doNotContact: boolean;
};

export type CoreCrmSmsRecipientsResponse = {
  recipients: CoreCrmSmsRecipient[];
};

export type CoreAdminCommunicationSearchUser = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
};

export type CoreAdminCommunicationSearchLocation = {
  id: string;
  name: string | null;
  city: string | null;
  state: string | null;
  location_type: string;
  type?: string | null;
  email?: string | null;
  phone?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
};

export type CoreAdminCommunicationSearchResponse = {
  users: CoreAdminCommunicationSearchUser[];
  locations: CoreAdminCommunicationSearchLocation[];
};

export type CoreBusinessAnalyticsInput = {
  range: "7d" | "30d" | "90d" | "12m" | "all";
  q: string;
  filtered: boolean;
};

export type CoreBusinessAnalyticsResponse = {
  success: true;
  range: string;
  summary: Record<string, unknown>;
  daily: Array<Record<string, unknown>>;
  top_locations: Array<Record<string, unknown>>;
  low_conversion_locations: Array<Record<string, unknown>>;
  birds_eye_locations: Array<Record<string, unknown>>;
  most_searched_categories: Array<Record<string, unknown>>;
  event_breakdown: Array<Record<string, unknown>>;
  source_breakdown: Array<Record<string, unknown>>;
  contact_method_breakdown: Array<Record<string, unknown>>;
  plan_breakdown: Array<Record<string, unknown>>;
  city_breakdown: Array<Record<string, unknown>>;
  borough_breakdown: Array<Record<string, unknown>>;
  category_breakdown: Array<Record<string, unknown>>;
  conversion_breakdown: Array<Record<string, unknown>>;
  recent_activity: Array<Record<string, unknown>>;
  filtered: boolean;
  filtered_summary: Record<string, unknown> | null;
  filter_meta: { q: string; result_count: number; total_count: number };
};

export type CoreAdminOverviewResponse = {
  success: true;
  totalLocations: number;
  reservations: number;
  todayReservations: number;
  upcomingReservations: number;
  activeEvents: number;
  activeExperiences: number;
  eventOrders: number;
  eventTickets: number;
  eventSalesCents: number;
  eventPlatformRevenueCents: number;
  experienceBookingCount: number;
  experienceGuests: number;
  experienceEstimatedValueCents: number;
  activePaidLocations: number;
  mrrCents: number;
  subscriptionCollected30dCents: number;
  trackedPlatformRevenue30dCents: number;
  openTickets: number;
  mlScored: number;
  mlIntentRows: number;
  mlPairRows: number;
  mlLastRunCreatedAt: string | null;
  generatedSites: number;
  liveGeneratedSites: number;
  hostingNodes: number;
  healthyHostingNodes: number;
};

function configuredSecret() {
  return String(
    process.env.AWS_PLATFORM_CORE_API_SECRET
      || process.env.AWS_PLATFORM_JOB_GATEWAY_SECRET
      || "",
  ).trim();
}

function getConfig() {
  const baseUrl = String(process.env.AWS_PLATFORM_CORE_API_URL || "").trim().replace(/\/$/, "");
  const secret = configuredSecret();
  if (!baseUrl || !secret) throw new Error("aws_platform_core_api_not_configured");
  if (!/^https:\/\//i.test(baseUrl)) throw new Error("aws_platform_core_api_requires_https");
  return { baseUrl, secret };
}

export function platformCoreApiConfigured() {
  return Boolean(process.env.AWS_PLATFORM_CORE_API_URL?.trim() && configuredSecret());
}

async function signedRequest<T>(method: "GET" | "POST", path: string, body = "", timeoutMs = 12_000): Promise<T> {
  const { baseUrl, secret } = getConfig();
  const timestamp = Date.now().toString();
  const signature = createHmac("sha256", secret)
    .update([timestamp, method, path, body].join("\n"))
    .digest("hex");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
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
    const payload = await response.json().catch(() => null) as T | { error?: string } | null;
    if (!response.ok) {
      throw new Error((payload as { error?: string } | null)?.error || `aws_platform_core_api_http_${response.status}`);
    }
    return payload as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolveCrmContextViaCoreApi(context: CrmRecordContext): Promise<CoreCrmContextResponse> {
  return signedRequest<CoreCrmContextResponse>(
    "POST",
    "/v1/crm/context",
    JSON.stringify({ context }),
  );
}

export async function readCrmLocationHealthViaCoreApi(
  input: CoreCrmLocationHealthInput,
): Promise<CoreCrmLocationHealthResponse> {
  return signedRequest<CoreCrmLocationHealthResponse>(
    "POST",
    "/v1/crm/location-health/read",
    JSON.stringify(input),
    15_000,
  );
}

export async function readCrmCommunicationCenterViaCoreApi(
  scope: CoreCommunicationScope,
): Promise<CoreCrmCommunicationCenterResponse> {
  return signedRequest<CoreCrmCommunicationCenterResponse>(
    "POST",
    "/v1/crm/communication-center/read",
    JSON.stringify({ scope }),
    15_000,
  );
}

export async function readCrmSmsRecipientsViaCoreApi(
  locationId: string,
): Promise<CoreCrmSmsRecipientsResponse> {
  return signedRequest<CoreCrmSmsRecipientsResponse>(
    "POST",
    "/v1/crm/sms/recipients/read",
    JSON.stringify({ locationId }),
  );
}

export async function readAdminCommunicationSearchViaCoreApi(
  q: string,
): Promise<CoreAdminCommunicationSearchResponse> {
  return signedRequest<CoreAdminCommunicationSearchResponse>(
    "POST",
    "/v1/admin/communication/search/read",
    JSON.stringify({ q }),
  );
}

export async function readBusinessAnalyticsViaCoreApi(
  input: CoreBusinessAnalyticsInput,
): Promise<CoreBusinessAnalyticsResponse> {
  return signedRequest<CoreBusinessAnalyticsResponse>(
    "POST",
    "/v1/admin/business-analytics/read",
    JSON.stringify(input),
    18_000,
  );
}

export async function readAdminOverviewViaCoreApi(): Promise<CoreAdminOverviewResponse> {
  return signedRequest<CoreAdminOverviewResponse>(
    "POST",
    "/v1/admin/overview/read",
    "{}",
    18_000,
  );
}
