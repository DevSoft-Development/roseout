import { normalizePhotoUrlForPublic } from "@/lib/locations/photo-public";

const PHOTO_KEYS = new Set([
  "image_url",
  "main_image",
  "images",
  "gallery_images",
  "photo_url",
  "primary_photo_url",
  "google_photo_url",
]);

const SENSITIVE_QUERY_KEYS = new Set([
  "key",
  "api_key",
  "apikey",
  "access_token",
  "token",
  "secret",
  "signature",
]);

function stripSensitiveQueryParameters(value: string): string {
  if (!/^https?:\/\//i.test(value)) return value;

  try {
    const url = new URL(value);
    let changed = false;
    for (const parameter of Array.from(url.searchParams.keys())) {
      if (SENSITIVE_QUERY_KEYS.has(parameter.toLowerCase())) {
        url.searchParams.delete(parameter);
        changed = true;
      }
    }
    return changed ? url.toString() : value;
  } catch {
    return value.replace(
      /([?&])(key|api_key|apikey|access_token|token|secret|signature)=[^&#]*/gi,
      (_match, separator) => (separator === "?" ? "?" : ""),
    ).replace(/\?&/, "?").replace(/[?&]$/, "");
  }
}

function sanitizePublicString(value: string, key?: string): string {
  const withoutSecrets = stripSensitiveQueryParameters(value);
  if (key && PHOTO_KEYS.has(key)) {
    return normalizePhotoUrlForPublic(withoutSecrets) ?? withoutSecrets;
  }
  return withoutSecrets;
}

export function hardenPublicSearchPayload(value: unknown, key?: string): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => hardenPublicSearchPayload(item, key));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => [
        childKey,
        hardenPublicSearchPayload(childValue, childKey),
      ]),
    );
  }

  if (typeof value === "string") {
    return sanitizePublicString(value, key);
  }

  return value;
}

export function correctZeroPairRenderState<T extends Record<string, any>>(payload: T): T {
  const restaurants = Array.isArray(payload.restaurants) ? payload.restaurants : [];
  const activities = Array.isArray(payload.activities) ? payload.activities : [];
  const pairs = Array.isArray(payload.pairs) ? payload.pairs : [];

  if (!restaurants.length || !activities.length || pairs.length) return payload;

  if (
    payload.primaryResultType !== "pairs" &&
    payload.renderMode !== "pairs" &&
    payload.render_mode !== "pairs"
  ) {
    return payload;
  }

  return {
    ...payload,
    primaryResultType: "partial_mixed",
    renderMode: "partial_mixed",
    render_mode: "partial_mixed",
    no_pairs_reason:
      payload.no_pairs_reason ?? "valid_candidates_but_no_pair_recovered",
  };
}
