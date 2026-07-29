const GENERIC_ACTIVITY_FALLBACKS = new Set([
  "activity",
  "date night",
  "date_night",
  "romantic",
  "couples",
  "creative",
]);

const ADDRESS_WORDS = /\b(st|street|ave|avenue|road|rd|boulevard|blvd|drive|dr|lane|ln|highway|hwy|suite|floor|fl|unit)\b/i;
const ZIP_CODE = /\b\d{5}(?:-\d{4})?\b/;
const STREET_NUMBER = /^\s*\d{1,6}[a-z]?\s+/i;

export function normalizeClassificationToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized || normalized.length > 80) return null;
  if (STREET_NUMBER.test(normalized) || ZIP_CODE.test(normalized) || ADDRESS_WORDS.test(normalized)) return null;
  if (/^[\d\W_]+$/.test(normalized)) return null;
  return normalized;
}

export function sanitizeClassificationValues(values: unknown[], options: { allowGeneric?: boolean } = {}): string[] {
  const sanitized = values
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .map(normalizeClassificationToken)
    .filter((value): value is string => Boolean(value))
    .filter((value) => options.allowGeneric === true || !GENERIC_ACTIVITY_FALLBACKS.has(value));
  return [...new Set(sanitized)];
}

export function isGenericActivityFallback(value: string): boolean {
  return GENERIC_ACTIVITY_FALLBACKS.has(value.trim().toLowerCase());
}
