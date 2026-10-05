import "server-only";

import { isClaimedLocation } from "@/lib/location-intelligence/source-precedence";
import type { LocationMaintenanceMode, ProviderExecutionPurpose } from "@/lib/location-intelligence/v2/contracts";

export const MATERIAL_CHANGE_TYPES = new Set([
  "temporarily_closed",
  "permanently_closed",
  "moved",
  "renamed",
  "reopened",
  "replaced",
  "duplicate",
  "identity_conflict",
]);

export function maintenanceModeForLocation(location: Record<string, unknown>): LocationMaintenanceMode {
  return isClaimedLocation(location) ? "owner_maintained" : "theouthaven_managed";
}

export function allowRoutinePaidProfileEnrichment(location: Record<string, unknown>) {
  // V2 policy: deep enrichment is a bootstrap operation, never a routine refresh.
  // Claimed locations are owner-maintained and are always excluded.
  return false;
}

export function allowPaidMaterialChangeVerification(input: {
  location: Record<string, unknown>;
  changeType: string;
  confidence: number;
}) {
  if (!MATERIAL_CHANGE_TYPES.has(input.changeType)) return false;
  if (input.confidence < 0.5) return false;
  // Claimed locations may still receive targeted integrity verification for material changes.
  return true;
}

export function reviewRefreshCadenceDays(popularityScore: number) {
  if (popularityScore >= 90) return 30;
  if (popularityScore >= 70) return 60;
  if (popularityScore >= 40) return 90;
  if (popularityScore >= 10) return 180;
  return null;
}


export function allowPaidProviderExecution(input: {
  purpose?: ProviderExecutionPurpose;
  ownerMaintained?: boolean;
}) {
  const purpose = input.purpose || "unspecified";
  if (purpose === "routine_profile_refresh" || purpose === "unspecified") return false;
  if (
    input.ownerMaintained === true &&
    purpose !== "review_refresh" &&
    purpose !== "material_change"
  ) return false;
  return true;
}


export const GOOGLE_BOOTSTRAP_FRESHNESS_DAYS = 60;

export function isRecentGoogleEnrichment(
  enrichedAt: unknown,
  nowMs = Date.now(),
  freshnessDays = GOOGLE_BOOTSTRAP_FRESHNESS_DAYS,
) {
  const enrichedMs = Date.parse(String(enrichedAt || ""));
  if (!Number.isFinite(enrichedMs)) return false;
  return nowMs - enrichedMs <= freshnessDays * 24 * 60 * 60 * 1000;
}

function missing(value: unknown) {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length === 0;
  return false;
}

export function recentGoogleCanonicalReuse(location: Record<string, unknown>, nowMs = Date.now()) {
  if (!isRecentGoogleEnrichment(location.google_enriched_at, nowMs)) return {};

  const reusable: Record<string, unknown> = {};
  if (missing(location.website) && !missing(location.google_website_uri)) {
    reusable.website = location.google_website_uri;
  }
  if (missing(location.rating) && !missing(location.google_rating)) {
    reusable.rating = location.google_rating;
  }
  if (missing(location.review_count) && !missing(location.google_user_rating_count)) {
    reusable.review_count = location.google_user_rating_count;
  }
  return reusable;
}

export function paidBusinessProfileGaps(location: Record<string, unknown>, nowMs = Date.now()) {
  const effective = { ...location, ...recentGoogleCanonicalReuse(location, nowMs) };
  const fields = [
    "google_place_id",
    "phone",
    "website",
    "operating_hours",
    "primary_category",
    "description",
    "main_image",
    "rating",
    "review_count",
  ];

  return fields.filter((field) => missing(effective[field]));
}

export function shouldRunPaidBusinessProfileBootstrap(
  location: Record<string, unknown>,
  nowMs = Date.now(),
) {
  return paidBusinessProfileGaps(location, nowMs).length > 0;
}
