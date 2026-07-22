import { PublicSearchError } from "./errors";
import type { PublicSearchRequest } from "./contracts";

function finiteNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}
function stringValue(...values: unknown[]): string | null {
  for (const value of values)
    if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

export async function parseJsonBody(
  request: Request,
): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new PublicSearchError(
        "INVALID_JSON",
        "Request body must be a JSON object.",
        400,
        false,
      );
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof PublicSearchError) throw error;
    throw new PublicSearchError(
      "MALFORMED_JSON",
      "Request body must be valid JSON.",
      400,
      false,
    );
  }
}

export function normalizePublicSearchRequest(
  body: Record<string, unknown>,
  request: Request,
): PublicSearchRequest {
  const anyBody = body as any;
  const query =
    stringValue(anyBody.message, anyBody.input, anyBody.query) ?? "";
  if (!query)
    throw new PublicSearchError(
      "QUERY_REQUIRED",
      "Please enter what you want to search for.",
      400,
      false,
    );
  if (query.length > 500)
    throw new PublicSearchError(
      "QUERY_TOO_LONG",
      "Search query is too long.",
      400,
      false,
    );

  const latitude = finiteNumber(
    anyBody.latitude,
    anyBody.lat,
    anyBody.userLatitude,
    anyBody.user_latitude,
    anyBody.userLocation?.latitude,
    anyBody.user_location?.latitude,
    anyBody.userLocation?.lat,
    anyBody.user_location?.lat,
  );
  const longitude = finiteNumber(
    anyBody.longitude,
    anyBody.lng,
    anyBody.lon,
    anyBody.userLongitude,
    anyBody.user_longitude,
    anyBody.userLocation?.longitude,
    anyBody.user_location?.longitude,
    anyBody.userLocation?.lng,
    anyBody.user_location?.lng,
  );
  const radiusMiles = finiteNumber(
    anyBody.radiusMiles,
    anyBody.radius_miles,
    anyBody.radius,
  );
  if (latitude !== null && (latitude < -90 || latitude > 90))
    throw new PublicSearchError(
      "INVALID_LATITUDE",
      "Latitude must be between -90 and 90.",
      400,
      false,
    );
  if (longitude !== null && (longitude < -180 || longitude > 180))
    throw new PublicSearchError(
      "INVALID_LONGITUDE",
      "Longitude must be between -180 and 180.",
      400,
      false,
    );
  if (radiusMiles !== null && (radiusMiles <= 0 || radiusMiles > 100))
    throw new PublicSearchError(
      "INVALID_RADIUS",
      "Radius must be between 0 and 100 miles.",
      400,
      false,
    );
  const url = new URL(request.url);
  return {
    rawBody: body,
    query,
    timezone: stringValue(anyBody.timezone) ?? "America/New_York",
    latitude,
    longitude,
    radiusMiles,
    useCurrentLocation:
      anyBody.useCurrentLocation === true ||
      anyBody.use_current_location === true,
    debug:
      anyBody.debug === true ||
      anyBody.betaDebug === true ||
      url.searchParams.get("debug") === "true",
    anonymousId: stringValue(
      anyBody.anonymousId,
      anyBody.anonymous_id,
      request.headers.get("x-anonymous-id"),
    ),
    betaAssignmentId: stringValue(
      anyBody.betaAssignmentId,
      anyBody.beta_assignment_id,
      url.searchParams.get("betaAssignmentId"),
      request.headers.get("x-beta-assignment-id"),
    ),
    betaTesterId: stringValue(
      anyBody.betaTesterId,
      anyBody.beta_tester_id,
      request.headers.get("x-beta-tester-id"),
    ),
  };
}
