export type CronOutcomeMetric = {
  key: string;
  label: string;
  count: number;
};

export type CronOutcome = {
  processed: number;
  checked: number;
  added: number;
  updated: number;
  fixed: number;
  unchanged: number;
  skipped: number;
  review: number;
  failed: number;
  actions: CronOutcomeMetric[];
  summary: string;
  materialChangeTotal: number;
};

type Row = Record<string, any>;

function n(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function flatten(value: unknown, prefix = "", out: Record<string, number> = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const [rawKey, child] of Object.entries(value as Record<string, unknown>)) {
    const key = rawKey.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === "number" && Number.isFinite(child)) out[path] = child;
    else if (child && typeof child === "object" && !Array.isArray(child)) flatten(child, path, out);
  }
  return out;
}

function first(flat: Record<string, number>, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const entry = Object.entries(flat).find(([key, value]) => value >= 0 && pattern.test(key));
    if (entry) return n(entry[1]);
  }
  return 0;
}

function sum(flat: Record<string, number>, patterns: RegExp[]) {
  const seen = new Set<string>();
  let total = 0;
  for (const [key, value] of Object.entries(flat)) {
    if (value <= 0 || seen.has(key)) continue;
    if (patterns.some((pattern) => pattern.test(key))) {
      total += value;
      seen.add(key);
    }
  }
  return total;
}

function labelForKey(key: string) {
  return key.split(".").pop()!.replace(/_count$|_total$/g, "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const IGNORED_ACTION = /(duration|latency|milliseconds|seconds|minutes|hours|rate$|success_rate|api_calls?|estimated|limit|batch|lease|attempt|timestamp|time$|id$|bytes|size|included_jobs|cron_runs|edge_runs)/i;
const STANDARD = /(checked|scanned|processed|evaluated|examined|added|inserted|imported|discovered|updated|enriched|synced|applied|refreshed|changed|fixed|repaired|reconciled|recovered|restored|corrected|resolved|backfilled|unchanged|no_change|skipped|ignored|review|pending|failed|errors?|success_count|matched|no_match|no_useful)/i;

function actionMetrics(flat: Record<string, number>) {
  return Object.entries(flat)
    .filter(([key, value]) => value > 0 && !IGNORED_ACTION.test(key) && !STANDARD.test(key))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([key, count]) => ({ key, label: labelForKey(key), count }));
}

function part(count: number, singular: string, plural = `${singular}s`) {
  return count > 0 ? `${count} ${count === 1 ? singular : plural}` : null;
}

export function summarizeCronOutcome(row: Row): CronOutcome {
  const jobKey = String(row.job_key || row.job_name || row.function_name || "").toLowerCase();
  const source = row.details ?? row.output_summary ?? row.metadata ?? {};
  const flat = flatten(source);

  let checked = n(row.checked_count) || first(flat, [/\.checked_count$|^checked_count$/, /\.checked$|^checked$/, /\.scanned$|^scanned$/, /\.evaluated$|^evaluated$/, /\.examined$|^examined$/]);
  let processed = first(flat, [/\.processed_count$|^processed_count$/, /\.processed$|^processed$/]) || checked;
  let added = sum(flat, [/photos?_added$/, /locations?_added$/, /events?_added$/, /records?_added$/, /\.added$/, /\.inserted$/, /\.imported$/, /\.discovered$/]);
  let updated = sum(flat, [/\.updated$/, /\.enriched$/, /\.synced$/, /\.refreshed$/, /\.changed$/, /\.auto_applied$/, /\.applied$/]);
  let fixed = sum(flat, [/\.fixed$/, /\.repaired$/, /\.reconciled$/, /\.recovered$/, /\.restored$/, /\.corrected$/, /\.resolved$/, /\.backfilled$/]);
  let unchanged = sum(flat, [/\.unchanged$/, /\.no_change$/, /\.already_current$/, /\.already_complete$/]);
  let skipped = n(row.skipped_count) || sum(flat, [/\.skipped$/, /\.ignored$/]);
  let review = sum(flat, [/\.pending_review$/, /\.needs_review$/, /\.sent_to_review$/, /\.review_required$/]);
  let failed = n(row.failed_count) || sum(flat, [/\.failed$/, /\.error_count$/, /\.errors$/]);

  if (jobKey.includes("google-location-enrichment")) {
    checked = first(flat, [/\.scanned$|^scanned$/]) || checked;
    processed = checked;
    added = 0;
    updated = first(flat, [/\.auto_applied$|^auto_applied$/]);
    review = first(flat, [/\.pending_review$|^pending_review$/]) + first(flat, [/\.auto_apply_ready$|^auto_apply_ready$/]);
    unchanged = first(flat, [/\.no_match$|^no_match$/]) + first(flat, [/\.no_useful_terms$|^no_useful_terms$/]);
    skipped = unchanged;
    failed = first(flat, [/\.failed$|^failed$/]) || failed;
  } else if (jobKey.includes("photo-backfill")) {
    processed = checked || n(row.success_count) + skipped + failed;
    if (!added) added = n(row.success_count);
    unchanged = unchanged || skipped;
  }

  if (!processed) processed = checked || n(row.success_count) + skipped + failed;
  if (!checked) checked = processed;

  const actions = actionMetrics(flat);
  const isGoogleEnrichment = jobKey.includes("google-location-enrichment");
  const summaryParts = [
    part(processed, "processed"),
    part(added, "added"),
    part(updated, isGoogleEnrichment ? "live-search update" : "updated"),
    part(fixed, "fixed"),
    part(review, isGoogleEnrichment ? "needs review/action" : "needs review", isGoogleEnrichment ? "need review/action" : "need review"),
    part(unchanged, "unchanged"),
    part(skipped && skipped !== unchanged ? skipped : 0, "skipped"),
    ...actions.slice(0, 2).map((metric) => `${metric.count} ${metric.label.toLowerCase()}`),
    part(failed, "failed"),
  ].filter(Boolean) as string[];

  const summary = summaryParts.length
    ? summaryParts.slice(0, 6).join(" · ")
    : String(row.status || "unknown").toLowerCase() === "success"
      ? "Completed · no material change reported"
      : `Status: ${String(row.status || "unknown")}`;

  return { processed, checked, added, updated, fixed, unchanged, skipped, review, failed, actions, summary, materialChangeTotal: added + updated + fixed };
}
