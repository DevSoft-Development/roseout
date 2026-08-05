export const EXPLORER_SECTIONS = [
  "summary",
  "query",
  "intent",
  "geo",
  "pipeline",
  "results",
  "ranking",
  "performance",
  "metadata",
  "raw",
] as const;

export type ExplorerSection = (typeof EXPLORER_SECTIONS)[number];
export type JsonObject = Record<string, unknown>;

export interface SearchExplorerEvent extends JsonObject {
  id: string;
  created_at: string | null;
  source: string | null;
  route: string | null;
  raw_query: string | null;
  normalized_query: string | null;
  search_type: string | null;
  primary_domain: string | null;
  intent_parser_source: string | null;
  user_id: string | null;
  anonymous_id: string | null;
  session_id: string | null;
  beta_tester_id: string | null;
  beta_assignment_id: string | null;
  default_market_id: string | null;
  environment: string | null;
  city: string | null;
  state: string | null;
  borough: string | null;
  neighborhood: string | null;
  latitude: number | null;
  longitude: number | null;
  radius_miles: number | null;
  distance_mode: string | null;
  wants_pairing: boolean | null;
  needs_restaurant: boolean | null;
  needs_activity: boolean | null;
  outing_date: string | null;
  outing_time: string | null;
  outing_datetime: string | null;
  outing_time_label: string | null;
  restaurant_count: number | null;
  activity_count: number | null;
  pair_count: number | null;
  result_count: number | null;
  timing_ms: number | null;
  llm_ms: number | null;
  rpc_ms: number | null;
  pairing_ms: number | null;
  ranking_ms: number | null;
  speed_status: string | null;
  success: boolean | null;
  had_issue: boolean | null;
  issue_type: string | null;
  issue_label: string | null;
  no_results_reason: string | null;
  no_pairs_reason: string | null;
  metadata: JsonObject | null;
  debug: JsonObject | null;
}

export function resolveExplorerSection(value: unknown): ExplorerSection {
  return typeof value === "string" &&
    EXPLORER_SECTIONS.includes(value as ExplorerSection)
    ? (value as ExplorerSection)
    : "summary";
}

export function isRecord(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function getNested(value: unknown, ...paths: string[]): unknown {
  for (const path of paths) {
    let cursor: unknown = value;
    let found = true;
    for (const segment of path.split(".")) {
      if (!isRecord(cursor) || !(segment in cursor)) {
        found = false;
        break;
      }
      cursor = cursor[segment];
    }
    if (found && cursor !== undefined) return cursor;
  }
  return undefined;
}

export function formatUnknown(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export type FlatJsonEntry = { path: string; key: string; value: unknown };
export function flattenJson(
  value: unknown,
  root = "",
  maxDepth = 40,
): FlatJsonEntry[] {
  const output: FlatJsonEntry[] = [];
  const seen = new WeakSet<object>();
  function visit(item: unknown, path: string, depth: number) {
    const key = path.split(/\.|\[/).at(-1)?.replace(/\]$/, "") ?? path;
    if (item === null || typeof item !== "object" || depth >= maxDepth) {
      output.push({ path, key, value: item });
      return;
    }
    if (seen.has(item)) {
      output.push({ path, key, value: "[Circular]" });
      return;
    }
    seen.add(item);
    const entries = Array.isArray(item)
      ? item.map((child, index) => [String(index), child] as const)
      : Object.entries(item);
    if (!entries.length) output.push({ path, key, value: item });
    for (const [childKey, child] of entries) {
      visit(
        child,
        Array.isArray(item)
          ? `${path}[${childKey}]`
          : path
            ? `${path}.${childKey}`
            : childKey,
        depth + 1,
      );
    }
  }
  visit(value, root, 0);
  return output;
}

const SENSITIVE_KEY =
  /authorization|password|passwd|token|secret|cookie|service.?role|api.?key|private.?key|bearer/i;
export function redactSensitive(
  value: unknown,
  seen = new WeakSet<object>(),
): unknown {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value))
    return value.map((item) => redactSensitive(item, seen));
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? "[REDACTED]" : redactSensitive(item, seen),
    ]),
  );
}

export type HealthStatus =
  | "Healthy"
  | "Issue"
  | "Failed"
  | "Slow"
  | "Partial Results"
  | "Recovery Used";
export function deriveHealthStatuses(
  row: Partial<SearchExplorerEvent>,
): HealthStatus[] {
  const statuses: HealthStatus[] = [];
  if (row.success === false) statuses.push("Failed");
  if (row.had_issue === true || row.issue_type || row.issue_label)
    statuses.push("Issue");
  if (
    ["slow", "critical", "timeout", "degraded"].includes(
      String(row.speed_status).toLowerCase(),
    ) ||
    (row.timing_ms ?? 0) > 5000
  )
    statuses.push("Slow");
  if (
    getNested(
      row,
      "metadata.partialResultsReturned",
      "debug.partialResultsReturned",
      "metadata.partial_results_returned",
    ) === true
  )
    statuses.push("Partial Results");
  if (
    getNested(
      row,
      "metadata.recoveryLayerUsed",
      "debug.recoveryLayerUsed",
      "debug.recovery_layer_used",
    )
  )
    statuses.push("Recovery Used");
  return statuses.length ? [...new Set(statuses)] : ["Healthy"];
}

export function extractRequestId(
  row: Partial<SearchExplorerEvent>,
): string | null {
  const value = getNested(
    row,
    "metadata.request_id",
    "metadata.requestId",
    "metadata.trace_id",
    "debug.request_id",
    "debug.requestId",
    "debug.trace_id",
  );
  return typeof value === "string" && value ? value : null;
}

export function extractIntentValues(row: Partial<SearchExplorerEvent>) {
  return {
    needsRestaurant:
      getNested(
        row,
        "needs_restaurant",
        "metadata.needsRestaurant",
        "metadata.normalizedIntent.needsRestaurant",
        "debug.normalizedIntent.needsRestaurant",
      ) ?? null,
    needsActivity:
      getNested(
        row,
        "needs_activity",
        "metadata.needsActivity",
        "metadata.normalizedIntent.needsActivity",
        "debug.normalizedIntent.needsActivity",
      ) ?? null,
    wantsPairing:
      getNested(
        row,
        "wants_pairing",
        "metadata.wantsPairing",
        "metadata.normalizedIntent.wantsPairing",
        "debug.normalizedIntent.wantsPairing",
      ) ?? null,
    recoveryUsed:
      getNested(row, "metadata.recoveryLayerUsed", "debug.recoveryLayerUsed") ??
      null,
    partialResults:
      getNested(
        row,
        "metadata.partialResultsReturned",
        "debug.partialResultsReturned",
      ) ?? null,
  };
}

export function extractGeoValues(row: Partial<SearchExplorerEvent>) {
  return {
    latitude:
      getNested(
        row,
        "latitude",
        "metadata.latitude",
        "metadata.geo.latitude",
        "debug.geo.latitude",
      ) ?? null,
    longitude:
      getNested(
        row,
        "longitude",
        "metadata.longitude",
        "metadata.geo.longitude",
        "debug.geo.longitude",
      ) ?? null,
    requestedMarket:
      getNested(row, "metadata.requestedMarket", "debug.requestedMarket") ??
      null,
    resolvedMarket:
      getNested(
        row,
        "metadata.resolvedMarket",
        "metadata.market",
        "debug.resolvedMarket",
      ) ?? null,
  };
}

export type TimingMap = Record<string, number | null>;
const timingPaths: Record<string, string[]> = {
  total: [
    "timing_ms",
    "metadata.performance.totalMs",
    "debug.performance.totalMs",
  ],
  llm: ["llm_ms", "metadata.performance.llmMs", "debug.timings.llmMs"],
  rpc: ["rpc_ms", "metadata.performance.rpcMs"],
  pairing: ["pairing_ms", "metadata.performance.pairingMs"],
  ranking: ["ranking_ms", "metadata.performance.rankingMs"],
  parse: [
    "metadata.performance.parseMs",
    "metadata.performance.publicSearchTimings.parseMs",
    "debug.timings.parseMs",
  ],
  identity: ["metadata.performance.identityMs", "debug.timings.identityMs"],
  limit: ["metadata.performance.limitMs", "debug.timings.limitMs"],
  geo: [
    "metadata.performance.geoMs",
    "metadata.searchTelemetry.geoMs",
    "debug.timings.geoMs",
  ],
  anchor: ["metadata.performance.anchorMs", "debug.timings.anchorMs"],
  intent: [
    "metadata.performance.intentMs",
    "metadata.searchTelemetry.intentMs",
    "debug.timings.intentMs",
  ],
  search: ["metadata.performance.searchMs", "debug.timings.searchMs"],
  normalize: ["metadata.performance.normalizeMs", "debug.timings.normalizeMs"],
  telemetry: ["metadata.performance.telemetryMs", "debug.timings.telemetryMs"],
};
export function extractPerformanceTimings(
  row: Partial<SearchExplorerEvent>,
): TimingMap {
  return Object.fromEntries(
    Object.entries(timingPaths).map(([name, paths]) => {
      const value = getNested(row, ...paths);
      const number =
        typeof value === "number"
          ? value
          : typeof value === "string" && value.trim()
            ? Number(value)
            : NaN;
      return [name, Number.isFinite(number) && number >= 0 ? number : null];
    }),
  );
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function downloadJson(value: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(redactSensitive(value), null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
