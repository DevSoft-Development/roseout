const EMPTY_DISPLAY_VALUE = "—";

/** Convert an untrusted scalar into text that is safe to render. */
export function displayValue(value: unknown, fallback = EMPTY_DISPLAY_VALUE): string {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : fallback;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "bigint") return value.toString();
  return fallback;
}

/** Format an untrusted numeric value without allowing NaN or infinity into the UI. */
export function displayNumber(
  value: unknown,
  options?: Intl.NumberFormatOptions,
  fallback = EMPTY_DISPLAY_VALUE,
): string {
  const number = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim() !== ""
      ? Number(value)
      : Number.NaN;
  return Number.isFinite(number) ? number.toLocaleString(undefined, options) : fallback;
}

/** Format latitude/longitude-style values with a stable, useful precision. */
export function displayCoordinate(value: unknown, fallback = EMPTY_DISPLAY_VALUE): string {
  const number = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim() !== ""
      ? Number(value)
      : Number.NaN;
  return Number.isFinite(number)
    ? number.toLocaleString(undefined, { maximumFractionDigits: 6, useGrouping: false })
    : fallback;
}

/** Format only actual booleans; truthy metadata must not be mistaken for true. */
export function displayBoolean(value: unknown, fallback = EMPTY_DISPLAY_VALUE): string {
  return typeof value === "boolean" ? (value ? "Yes" : "No") : fallback;
}

/**
 * Produce a JSON-compatible debug snapshot whose leaves have all passed through
 * the shared display helpers. It is deliberately cycle-safe and bounded.
 */
export function normalizeDebugValue(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (depth > 8) return "[Maximum depth reached]";
  if (typeof value === "number") return displayNumber(value);
  if (typeof value === "boolean") return displayBoolean(value);
  if (value === null || value === undefined || typeof value !== "object") return displayValue(value);
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => normalizeDebugValue(item, depth + 1, seen));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, normalizeDebugValue(item, depth + 1, seen)]),
  );
}

export function displayDebugJson(value: unknown): string {
  return JSON.stringify(normalizeDebugValue(value), null, 2);
}
