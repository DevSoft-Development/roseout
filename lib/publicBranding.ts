const LEGACY_BRAND_PATTERN = /roseout|rose out/gi;
const LEGACY_DOMAIN_PATTERN = /(?:www\.)?roseout\.com|(?:www\.)?roseout\.vercel\.app/gi;
const LEGACY_TOKEN_PATTERN = /^(?:roseout|rose out|roseout\.com|www\.roseout\.com|roseout\.vercel\.app|www\.roseout\.vercel\.app)$/i;

const ARRAY_FIELDS_WITH_SEARCH_TOKENS = new Set([
  "search_keywords",
  "tags",
  "semantic_tags",
  "intent_tags",
  "metadata",
]);

const PRIVATE_PUBLIC_FIELDS = new Set([
  // Legacy DB column kept for compatibility; do not expose publicly.
  "roseout_score",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function sanitizeBrandString(value: string, parentKey?: string): string {
  const trimmed = value.trim();

  if (
    parentKey &&
    ARRAY_FIELDS_WITH_SEARCH_TOKENS.has(parentKey) &&
    LEGACY_TOKEN_PATTERN.test(trimmed)
  ) {
    return "";
  }

  return value
    .replace(LEGACY_DOMAIN_PATTERN, (match) =>
      match.toLowerCase().includes("vercel.app")
        ? "theouthaven.com"
        : match.toLowerCase().startsWith("www.")
          ? "www.theouthaven.com"
          : "theouthaven.com",
    )
    .replace(LEGACY_BRAND_PATTERN, "TheOutHaven")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function sanitizePublicBranding(value: unknown, parentKey?: string): unknown {
  if (typeof value === "string") return sanitizeBrandString(value, parentKey);

  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizePublicBranding(item, parentKey))
      .filter((item) => !(typeof item === "string" && item.trim() === ""));
  }

  if (!isPlainObject(value)) return value;

  return Object.entries(value).reduce<Record<string, unknown>>((acc, [key, item]) => {
    if (PRIVATE_PUBLIC_FIELDS.has(key)) return acc;
    const sanitized = sanitizePublicBranding(item, key);
    if (typeof sanitized === "string" && sanitized.trim() === "") return acc;
    acc[key] = sanitized;
    return acc;
  }, {});
}

export function containsLegacyPublicBranding(value: unknown): boolean {
  return /roseout|rose out/i.test(JSON.stringify(value));
}
