type JsonRecord = Record<string, unknown>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeQueryText(value: unknown) {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/\s+/g, " ")
    : "";
}

function fnv1a(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function buildSearchQueryFingerprint(input: {
  normalizedQuery?: unknown;
  rawQuery?: unknown;
  searchType?: unknown;
  primaryDomain?: unknown;
  market?: unknown;
}) {
  const query =
    normalizeQueryText(input.normalizedQuery) ||
    normalizeQueryText(input.rawQuery);
  const searchType = normalizeQueryText(input.searchType) || "unknown";
  const primaryDomain = normalizeQueryText(input.primaryDomain) || "unknown";
  const market = normalizeQueryText(input.market) || "default";
  return `qf_v1_${fnv1a([query, searchType, primaryDomain, market].join("|"))}`;
}

export function normalizeMlResultIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => UUID_PATTERN.test(item)),
    ),
  ).slice(0, 250);
}

export function normalizeMlPairIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length > 0 && item.length <= 300),
    ),
  ).slice(0, 250);
}

export function buildMlSearchEventMetadata(args: {
  metadata?: JsonRecord | null;
  rawQuery?: unknown;
  normalizedQuery?: unknown;
  searchType?: unknown;
  primaryDomain?: unknown;
}) {
  const metadata = { ...(args.metadata ?? {}) };
  const market =
    metadata.parsed_market ??
    metadata.resolvedMarket ??
    metadata.requestedMarket ??
    (metadata.geo && typeof metadata.geo === "object"
      ? (metadata.geo as JsonRecord).market
      : null);

  return {
    ...metadata,
    ml_result_ids: normalizeMlResultIds(metadata.ml_result_ids),
    ml_pair_ids: normalizeMlPairIds(metadata.ml_pair_ids),
    query_fingerprint:
      typeof metadata.query_fingerprint === "string" &&
      metadata.query_fingerprint.trim()
        ? metadata.query_fingerprint.trim().slice(0, 120)
        : buildSearchQueryFingerprint({
            rawQuery: args.rawQuery,
            normalizedQuery: args.normalizedQuery,
            searchType: args.searchType,
            primaryDomain: args.primaryDomain,
            market,
          }),
    ml_event_schema_version: "ml_search_event_v1",
  };
}
