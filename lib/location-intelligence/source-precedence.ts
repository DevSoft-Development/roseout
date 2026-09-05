import "server-only";

export const LOCATION_SOURCE_PRECEDENCE = {
  ai_inference: 100,
  secondary_provider: 200,
  official_website: 300,
  google: 400,
  trusted_internal: 500,
  owner: 600,
} as const;

export type LocationAuthoritySource = keyof typeof LOCATION_SOURCE_PRECEDENCE;

export const OWNER_PROTECTED_FIELDS = new Set([
  "phone",
  "website",
  "external_reservation_url",
  "reservation_url",
  "reservation_link",
  "booking_url",
  "operating_hours",
  "hours_raw",
  "description",
  "main_image",
  "image_url",
  "images",
  "primary_category",
  "cuisine",
  "cuisine_type",
  "activity_type",
]);

export function isClaimedLocation(location: Record<string, unknown>) {
  const claimStatus = String(location.claim_status || "").trim().toLowerCase();
  return location.is_claimed === true
    || location.claimed === true
    || Boolean(location.owner_user_id)
    || claimStatus === "approved"
    || claimStatus === "claimed";
}

export function authorityRank(source: LocationAuthoritySource) {
  return LOCATION_SOURCE_PRECEDENCE[source];
}

export function mayReplaceLocationField(options: {
  location: Record<string, unknown>;
  field: string;
  incomingSource: LocationAuthoritySource;
  currentSource?: LocationAuthoritySource | null;
  currentValue: unknown;
  onlyWhenMissing?: boolean;
}) {
  const {
    location,
    field,
    incomingSource,
    currentSource,
    currentValue,
    onlyWhenMissing = false,
  } = options;

  const missing = currentValue === null
    || currentValue === undefined
    || currentValue === ""
    || (Array.isArray(currentValue) && currentValue.length === 0);

  if (onlyWhenMissing && !missing) return false;
  if (missing) return true;

  if (isClaimedLocation(location) && OWNER_PROTECTED_FIELDS.has(field) && incomingSource !== "owner") {
    return false;
  }

  if (!currentSource) return incomingSource === "owner" || incomingSource === "trusted_internal";
  return authorityRank(incomingSource) >= authorityRank(currentSource);
}

export function filterLocationProviderUpdate(options: {
  location: Record<string, unknown>;
  update: Record<string, unknown>;
  incomingSource: LocationAuthoritySource;
  provenance?: Record<string, LocationAuthoritySource | null | undefined>;
  onlyWhenMissingFields?: Set<string>;
}) {
  const allowed: Record<string, unknown> = {};
  const blocked: string[] = [];

  for (const [field, value] of Object.entries(options.update)) {
    const canWrite = mayReplaceLocationField({
      location: options.location,
      field,
      incomingSource: options.incomingSource,
      currentSource: options.provenance?.[field] || null,
      currentValue: options.location[field],
      onlyWhenMissing: options.onlyWhenMissingFields?.has(field) || false,
    });
    if (canWrite) allowed[field] = value;
    else blocked.push(field);
  }

  return { allowed, blocked };
}
