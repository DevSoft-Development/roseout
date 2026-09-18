import { getLocationQrStatus } from "@/lib/admin/location-qr-status";
export const ACTIVITY_CHILD_TABS = [
  "overview",
  "analytics",
  "reviews",
  "search-performance",
  "reservations",
  "growth-performance",
  "communications-performance",
  "audit-history",
  "system-logs",
  "health-score",
  "reports",
] as const;

export type ActivityChildTab = (typeof ACTIVITY_CHILD_TABS)[number];
export type TrustState = "verified" | "complete" | "partial" | "estimated" | "attributed" | "stale" | "unavailable" | "experimental";
export type FreshnessState = "fresh" | "delayed" | "stale" | "unavailable";

export const ACTIVITY_TAB_ALIASES: Record<string, ActivityChildTab> = {
  analytics: "overview",
  "reviews-feedback": "reviews",
  logs: "system-logs",
  reviews: "reviews",
  search: "search-performance",
  reservations: "reservations",
  growth: "growth-performance",
  communication: "communications-performance",
  communications: "communications-performance",
  audit: "audit-history",
  health: "health-score",
  reports: "reports",
};

export const HEALTH_SCORE_WEIGHTS = {
  profileCompleteness: 12,
  searchVisibility: 12,
  publishability: 12,
  photoQuality: 8,
  listingAccuracy: 8,
  categoryTaggingQuality: 7,
  reservationReadiness: 7,
  operationalHealth: 7,
  claimOwnershipSetup: 6,
  growthReadiness: 5,
  communicationReadiness: 5,
  reviewHealth: 4,
  systemReliability: 5,
  dataFreshness: 2,
} as const;

export const FRESHNESS_THRESHOLDS_HOURS = { fresh: 24, delayed: 72, stale: 168 } as const;

export function normalizeActivityChildTab(tab?: string | null, activityTab?: string | null): ActivityChildTab {
  const raw = (activityTab || tab || "overview").toLowerCase().trim().replace(/_/g, "-");
  if (!activityTab && ACTIVITY_TAB_ALIASES[raw]) return ACTIVITY_TAB_ALIASES[raw];
  if ((ACTIVITY_CHILD_TABS as readonly string[]).includes(raw)) return raw as ActivityChildTab;
  return ACTIVITY_TAB_ALIASES[raw] || "overview";
}

export function compareMetric(current: number, previous: number | null | undefined) {
  if (previous == null) return { absolute: current, percent: null, direction: current > 0 ? "new" : "flat", label: current > 0 ? "New" : "No prior data" };
  const absolute = current - previous;
  if (previous === 0) return { absolute, percent: null, direction: current > 0 ? "up" : "flat", label: current > 0 ? "New" : "No prior data" };
  const percent = Math.round((absolute / previous) * 1000) / 10;
  return { absolute, percent, direction: absolute > 0 ? "up" : absolute < 0 ? "down" : "flat", label: `${percent}%` };
}

export function freshnessState(value?: string | null, now = new Date()): FreshnessState {
  if (!value) return "unavailable";
  const hours = (now.getTime() - new Date(value).getTime()) / 36e5;
  if (!Number.isFinite(hours)) return "unavailable";
  if (hours <= FRESHNESS_THRESHOLDS_HOURS.fresh) return "fresh";
  if (hours <= FRESHNESS_THRESHOLDS_HOURS.delayed) return "delayed";
  return "stale";
}

export function maskSensitiveValue(value: unknown, role = "viewer") {
  const text = String(value ?? "");
  if (!text) return "—";
  if (["superadmin", "admin"].includes(role)) return text.replace(/(api[_-]?key|token|password|secret)=([^\s&]+)/gi, "$1=••••");
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, (m) => `${m.slice(0, 2)}•••@•••`)
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "•••-•••-••••")
    .replace(/(api[_-]?key|token|password|secret)=([^\s&]+)/gi, "$1=••••");
}

export function calculateLocationHealthScore(input: Record<string, any>) {
  const checks = {
    profileCompleteness: [input.name, input.address, input.city, input.description, input.phone || input.website],
    searchVisibility: [input.is_searchable, !input.hidden, input.location_type !== "unsupported", input.latitude || input.lat, input.longitude || input.lng],
    publishability: [input.publishReady, input.readyToApprove, input.status !== "draft"],
    photoQuality: [input.main_image || input.image_url, (input.galleryCount || 0) >= 3],
    listingAccuracy: [input.address, input.hours || input.operating_hours, input.category || input.cuisine],
    categoryTaggingQuality: [input.category || input.cuisine, input.search_tags || input.tags],
    reservationReadiness: [input.reservation_url || input.external_reservation_url, !input.brokenReservationLink],
    operationalHealth: [!input.unresolvedCriticalSupport, !input.highNoShowRate],
    claimOwnershipSetup: [input.is_claimed || input.owner_id, input.claim_code || input.claim_url],
    growthReadiness: [input.activeOfferCount > 0 || getLocationQrStatus({ location: input, qrCodes: input.qrCodes || [] }).hasQrCode || input.qrCodeCount > 0],
    communicationReadiness: [input.phone || input.owner_email, !input.highCommunicationFailureRate],
    reviewHealth: [(input.average_rating || 0) >= 3.5 || (input.reviewCount || 0) === 0, !input.repeatedNegativeTheme],
    systemReliability: [!input.unresolvedCriticalLogs, !input.repeatedSaveFailures],
    dataFreshness: [input.hasFreshData],
  } as Record<keyof typeof HEALTH_SCORE_WEIGHTS, unknown[]>;
  const categories = Object.entries(HEALTH_SCORE_WEIGHTS).map(([key, weight]) => {
    const values = checks[key as keyof typeof HEALTH_SCORE_WEIGHTS];
    const passed = values.filter(Boolean).length;
    const score = Math.round((passed / values.length) * 100);
    return { key, weight, score, completed: passed, failed: values.length - passed, warnings: 0, unavailable: values.length ? 0 : 1 };
  });
  const score = Math.round(categories.reduce((sum, c) => sum + c.score * c.weight, 0) / Object.values(HEALTH_SCORE_WEIGHTS).reduce((a, b) => a + b, 0));
  return { score, categories };
}

export function dedupeRecommendations<T extends { key?: string; complete?: boolean; title: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (item.complete) return false;
    const key = item.key || item.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
