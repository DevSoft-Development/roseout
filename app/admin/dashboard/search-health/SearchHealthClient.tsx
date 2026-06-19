"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import BatchQaRunner from "./BatchQaRunner";

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.clipboard?.writeText === "function" &&
      typeof window !== "undefined" &&
      window.isSecureContext
    ) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);

    if (!copied) throw new Error("Copy command failed");
    return true;
  } catch (error) {
    console.error("Copy failed", error);
    return false;
  }
}

function cleanValue(value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function sanitizeForCopy(value: unknown): unknown {
  const redactedKeys = [
    "token",
    "secret",
    "apikey",
    "api_key",
    "authorization",
    "password",
    "service_role",
    "bearer",
  ];
  if (Array.isArray(value)) return value.map(sanitizeForCopy);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, val]) => {
      const normalized = key.toLowerCase().replace(/[^a-z0-9_]/g, "");
      const shouldRedact = redactedKeys.some((needle) =>
        normalized.includes(needle),
      );
      return [key, shouldRedact ? "[REDACTED]" : sanitizeForCopy(val)];
    }),
  );
}

function formatSearchEventForCopy(row: any): string {
  const lines = [
    "TheOutHaven Search Log",
    "",
    `Created: ${cleanValue(row.created_at)}`,
    `Source: ${cleanValue(row.source)}`,
    `Route: ${cleanValue(row.route)}`,
    `Raw Query: ${cleanValue(row.raw_query)}`,
    `Normalized Query: ${cleanValue(row.normalized_query)}`,
    `Search Type: ${cleanValue(row.search_type)}`,
    `Primary Domain: ${cleanValue(row.primary_domain)}`,
    "",
    "Counts:",
    `Restaurants: ${cleanValue(row.restaurant_count)}`,
    `Activities: ${cleanValue(row.activity_count)}`,
    `Pairs: ${cleanValue(row.pair_count)}`,
    `Results: ${cleanValue(row.result_count)}`,
    "",
    "Performance:",
    `Timing: ${cleanValue(row.timing_ms ? `${row.timing_ms} ms` : null)}`,
    `LLM: ${cleanValue(row.llm_ms ? `${row.llm_ms} ms` : null)}`,
    `RPC: ${cleanValue(row.rpc_ms ? `${row.rpc_ms} ms` : null)}`,
    `Pairing: ${cleanValue(row.pairing_ms ? `${row.pairing_ms} ms` : null)}`,
    `Ranking: ${cleanValue(row.ranking_ms ? `${row.ranking_ms} ms` : null)}`,
    `Speed Status: ${cleanValue(row.speed_status)}`,
    "",
    "Status:",
    `Success: ${cleanValue(row.success)}`,
    `Had Issue: ${cleanValue(row.had_issue)}`,
    `Issue Type: ${cleanValue(row.issue_type)}`,
    `Issue Label: ${cleanValue(row.issue_label)}`,
    `No Results Reason: ${cleanValue(row.no_results_reason)}`,
    `No Pairs Reason: ${cleanValue(row.no_pairs_reason)}`,
    "",
    "Location:",
    `City: ${cleanValue(row.city)}`,
    `State: ${cleanValue(row.state)}`,
    `Borough: ${cleanValue(row.borough)}`,
    `Neighborhood: ${cleanValue(row.neighborhood)}`,
    "",
    "Outing Time:",
    `Date: ${cleanValue(row.outing_date)}`,
    `Time: ${cleanValue(row.outing_time)}`,
    `DateTime: ${cleanValue(row.outing_datetime)}`,
    `Time Label: ${cleanValue(row.outing_time_label)}`,
  ];
  return lines.join("\n");
}

function formatSearchEventsForCopy(rows: any[], context: any): string {
  return [
    "TheOutHaven All Searches",
    `Range: ${cleanValue(context.range)}`,
    `Source: ${cleanValue(context.source || "All")}`,
    "View: All Searches",
    `Generated: ${new Date().toISOString()}`,
    "",
    ...rows.map((row, index) =>
      [
        `${index + 1}. ${cleanValue(row.raw_query)}`,
        `Created: ${cleanValue(row.created_at)}`,
        `Source: ${cleanValue(row.source)}`,
        `Route: ${cleanValue(row.route)}`,
        `Search Type: ${cleanValue(row.search_type)}`,
        `Primary Domain: ${cleanValue(row.primary_domain)}`,
        `Counts: Restaurants ${cleanValue(row.restaurant_count)} · Activities ${cleanValue(row.activity_count)} · Pairs ${cleanValue(row.pair_count)} · Results ${cleanValue(row.result_count)}`,
        `Timing: ${cleanValue(row.timing_ms ? `${row.timing_ms} ms` : null)}`,
        `Success: ${cleanValue(row.success)}`,
        `Had Issue: ${cleanValue(row.had_issue)}`,
        `Issue: ${cleanValue(row.issue_label || row.issue_type || row.no_results_reason || row.no_pairs_reason)}`,
      ].join("\n"),
    ),
  ].join("\n\n");
}

function formatSearchQueriesForCopy(rows: any[]): string {
  return rows
    .map((row) => row.raw_query)
    .filter(Boolean)
    .join("\n");
}

function csvEscape(value: unknown): string {
  const text = value === undefined || value === null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function formatSearchEventsCsv(rows: any[]): string {
  const headers = [
    "created_at",
    "source",
    "route",
    "raw_query",
    "normalized_query",
    "search_type",
    "primary_domain",
    "restaurant_count",
    "activity_count",
    "pair_count",
    "result_count",
    "timing_ms",
    "speed_status",
    "success",
    "had_issue",
    "issue_type",
    "issue_label",
  ];
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((key) => csvEscape(row[key])).join(",")),
  ].join("\n");
}

type CountRow = {
  reason?: string;
  type?: string;
  count: number;
  exampleQuery?: string | null;
};
type SearchHealthData = {
  view?: string;
  summary?: Record<string, any>;
  recentEvents?: any[];
  allSearches?: any[];
  topEventTypes?: CountRow[];
  topNoPairReasons?: CountRow[];
  topNoResultReasons?: CountRow[];
  slowestSearches?: any[];
  commonFailingQueries?: any[];
  eventsBySource?: { source: string; count: number }[];
  lastDigestRun?: any | null;
  allSearchStats?: {
    totalVisible: number;
    publicCreateCount: number;
    adminSearchLabCount: number;
    cleanCount: number;
    issueCount: number;
    failedCount: number;
  };
  allSearchCount?: number;
  publicCreateSearchCount?: number;
  adminSearchLabCount?: number;
  failedSearchCount?: number;
  issueSearchCount?: number;
};

const ranges = ["24h", "7d", "30d"];
const views = [
  { label: "Issues", value: "issues" },
  { label: "All Searches", value: "all" },
  { label: "No Results", value: "no_results" },
  { label: "No Pairs", value: "no_pairs" },
  { label: "Slow", value: "slow" },
  { label: "Debug Runs", value: "debug" },
];
const sourceOptions = [
  { label: "All sources", value: "" },
  { label: "Create searches", value: "public_create_search" },
  { label: "Search Lab", value: "admin_search_lab" },
  { label: "Explore", value: "public_explore_search" },
  { label: "Plan", value: "public_plan_search" },
  { label: "Beta tester", value: "beta_tester_search" },
  { label: "Search API", value: "search_api" },
  { label: "Test events", value: "admin_test_event" },
];
const statuses = ["", "new", "reviewing", "fixed", "ignored", "archived"];
const speeds = [
  "",
  "slow",
  "critical",
  "failed",
  "timeout",
  "degraded",
  "test",
];
const severities = ["", "info", "warning", "error", "critical"];
const eventTypes = [
  "",
  "test_event",
  "search_error",
  "no_restaurant_results",
  "no_activity_results",
  "no_valid_pairs",
  "low_pair_count",
  "slow_search",
  "walking_route_warning",
  "quality_warning",
  "successful_debug_run",
  "search_event",
];

function formatTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function issueLabel(event: any) {
  return (
    event?.event_label ||
    event?.no_pairs_reason ||
    event?.no_results_reason ||
    event?.speed_status ||
    "Search event"
  );
}

function severityClass(severity?: string) {
  if (severity === "error" || severity === "critical")
    return "bg-red-500/15 text-red-100 border-red-300/25";
  if (severity === "warning")
    return "bg-amber-500/15 text-amber-100 border-amber-300/25";
  return "bg-sky-500/15 text-sky-100 border-sky-300/25";
}

export default function SearchHealthClient() {
  const [view, setView] = useState("issues");
  const [range, setRange] = useState("30d");
  const [source, setSource] = useState("");
  const [status, setStatus] = useState("");
  const [speed, setSpeed] = useState("");
  const [severity, setSeverity] = useState("");
  const [eventType, setEventType] = useState("");
  const [query, setQuery] = useState("");
  const [exactQuery, setExactQuery] = useState(false);
  const [data, setData] = useState<SearchHealthData>({});
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reviewStatus, setReviewStatus] = useState("new");
  const [reviewNotes, setReviewNotes] = useState("");

  const params = useMemo(() => {
    const next = new URLSearchParams({ range, view });
    if (source) next.set("source", source);
    if (status) next.set("review_status", status);
    if (speed) next.set("speed_status", speed);
    if (severity) next.set("severity", severity);
    if (eventType) next.set("event_type", eventType);
    if (query.trim()) next.set("q", query.trim());
    if (exactQuery) next.set("exactQuery", "true");
    return next;
  }, [
    range,
    view,
    source,
    status,
    speed,
    severity,
    eventType,
    query,
    exactQuery,
  ]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/search-health?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = await res.json();
      if (!payload.success)
        throw new Error(payload.error || "Failed to load search health");
      setData(payload);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load search health",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  async function openDetail(id: string) {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/search-health/${id}`, {
        cache: "no-store",
      });
      const payload = await res.json();
      if (!payload.success)
        throw new Error(payload.error || "Failed to load event");
      setSelected(payload.row);
      setReviewStatus(payload.row.review_status || "new");
      setReviewNotes(payload.row.review_notes || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load event");
    } finally {
      setDetailLoading(false);
    }
  }

  async function createTestEvent() {
    setActionLoading("test");
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/search-health/test-event", {
        method: "POST",
      });
      const payload = await res.json();
      if (!payload.success)
        throw new Error(payload.error || "Failed to create test event");
      setNotice("Search Health test event created.");
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create test event",
      );
    } finally {
      setActionLoading(null);
    }
  }

  async function sendDigest() {
    setActionLoading("digest");
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/search-health/send-digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true, hours: 24 }),
      });
      const payload = await res.json();
      if (!payload.success)
        throw new Error(payload.error || "Failed to send digest");
      setNotice(
        payload.sent === false
          ? "Search Health digest checked; no events required sending."
          : "Search Health digest sent.",
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send digest");
    } finally {
      setActionLoading(null);
    }
  }

  async function copyDebugJson() {
    if (!selected) return;
    const copied = await copyTextToClipboard(
      JSON.stringify(sanitizeForCopy(selected.debug ?? {}), null, 2),
    );
    if (copied) {
      setNotice("Debug JSON copied.");
      setError(null);
    } else {
      setError(
        "Could not copy Debug JSON. You can still select and copy it manually below.",
      );
    }
  }

  async function copyWithNotice(text: string, successNotice: string) {
    const copied = await copyTextToClipboard(text);
    if (copied) {
      setNotice(successNotice);
      setError(null);
    } else {
      setError(
        "Could not copy to clipboard. Please try selecting the text manually.",
      );
    }
  }

  async function saveReview() {
    if (!selected?.id) return;
    setActionLoading("review");
    try {
      const res = await fetch(`/api/admin/search-health/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          review_status: reviewStatus,
          review_notes: reviewNotes,
        }),
      });
      const payload = await res.json();
      if (!payload.success)
        throw new Error(payload.error || "Failed to save review");
      setSelected(payload.row);
      setNotice("Search Health review saved.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save review");
    } finally {
      setActionLoading(null);
    }
  }

  const summary = data.summary ?? {};
  const eventsBySource = data.eventsBySource ?? [];
  const totalEvents = Number(summary.totalEvents ?? 0);
  const onlyAdminSearchLab =
    eventsBySource.length === 1 &&
    eventsBySource[0]?.source === "admin_search_lab";
  const isAllSearchesView = view === "all" || data.view === "all";
  const allSearches = data.allSearches ?? [];
  const allSearchCards = [
    ["All Searches", data.allSearchCount ?? allSearches.length],
    [
      "/create Searches",
      data.allSearchStats?.publicCreateCount ??
        data.publicCreateSearchCount ??
        allSearches.filter((row) => row.source === "public_create_search")
          .length,
    ],
    [
      "Search Lab Runs",
      data.allSearchStats?.adminSearchLabCount ??
        data.adminSearchLabCount ??
        allSearches.filter((row) => row.source === "admin_search_lab").length,
    ],
    [
      "Clean Searches",
      data.allSearchStats?.cleanCount ??
        allSearches.filter(
          (row) => row.success === true && row.had_issue === false,
        ).length,
    ],
    [
      "Failed Searches",
      data.allSearchStats?.failedCount ??
        data.failedSearchCount ??
        allSearches.filter((row) => row.success === false).length,
    ],
    [
      "Issue Searches",
      data.allSearchStats?.issueCount ??
        data.issueSearchCount ??
        allSearches.filter((row) => row.had_issue).length,
    ],
  ];
  const cards = isAllSearchesView
    ? allSearchCards
    : [
        ["Total Events", totalEvents],
        ["Errors", Number(summary.errors ?? 0)],
        ["Warnings", Number(summary.warnings ?? 0)],
        ["No Valid Pair Searches", Number(summary.noPairSearches ?? 0)],
        ["No Result Searches", Number(summary.noResultSearches ?? 0)],
        ["Low Pair Count Searches", Number(summary.lowPairCountSearches ?? 0)],
        ["Slow Searches", Number(summary.slowSearches ?? 0)],
        ["Unresolved Events", Number(summary.unresolvedEvents ?? 0)],
      ];

  return (
    <>
      <section className="rounded-3xl border border-white/10 bg-[#120d0b] p-4">
        <div className="flex flex-wrap gap-2">
          {views.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setView(item.value)}
              className={`rounded-2xl px-4 py-2 text-sm font-black transition ${view === item.value ? "bg-white text-black" : "bg-white/10 text-white hover:bg-white/15"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        {view !== "all" ? (
          <p className="mt-3 rounded-2xl border border-sky-300/25 bg-sky-500/10 p-3 text-sm font-semibold text-sky-100">
            Search Health shows issues and warnings by default. To review every
            /create search, switch to All Searches.
          </p>
        ) : (
          <p className="mt-3 rounded-2xl border border-emerald-300/25 bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-100">
            All Searches includes normal /create searches from search_events,
            including clean searches that were not marked as issues.
          </p>
        )}
      </section>

      <BatchQaRunner />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {cards.map(([title, value]) => (
          <div
            key={title}
            className="rounded-3xl border border-white/10 bg-white/[0.05] p-5"
          >
            <p className="text-sm font-black text-white">{title}</p>
            <p className="mt-5 text-3xl font-black text-white">
              {loading ? "—" : value}
            </p>
          </div>
        ))}
      </section>

      <section className="rounded-3xl border border-white/10 bg-[#120d0b] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-white/65">
            <p>
              <span className="font-black text-white">Logging status:</span>{" "}
              {totalEvents > 0 ? "Logging active" : "No events logged yet"}
            </p>
            <p className="mt-1">
              Latest event: {formatTime(summary.latestEventCreatedAt)}
            </p>
            <p className="mt-1">
              Last digest sent: {formatTime(data.lastDigestRun?.created_at)}{" "}
              {data.lastDigestRun?.sent === false ? "(not sent)" : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={createTestEvent}
              disabled={Boolean(actionLoading)}
              className="rounded-2xl bg-white px-4 py-2 text-sm font-black text-black disabled:opacity-60"
            >
              {actionLoading === "test" ? "Creating…" : "Create test event"}
            </button>
            <button
              onClick={sendDigest}
              disabled={Boolean(actionLoading)}
              className="rounded-2xl bg-rose-600 px-4 py-2 text-sm font-black text-white disabled:opacity-60"
            >
              {actionLoading === "digest" ? "Sending…" : "Send digest now"}
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-3 rounded-3xl border border-white/10 bg-[#120d0b] p-4 md:grid-cols-3 xl:grid-cols-6">
        <Filter
          label="Date range"
          value={range}
          values={ranges}
          onChange={setRange}
        />
        <Filter
          label="Source"
          value={source}
          options={sourceOptions}
          onChange={setSource}
        />
        <label className="text-xs font-black uppercase tracking-[0.2em] text-white/45 xl:col-span-2">
          Search
          <input
            className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-3 text-sm normal-case tracking-normal text-white"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search query, source, route, issue..."
          />
        </label>
        <label className="flex items-end gap-2 rounded-2xl border border-white/10 bg-black/20 px-3 py-3 text-sm font-semibold text-white/75">
          <input
            type="checkbox"
            checked={exactQuery}
            onChange={(event) => setExactQuery(event.target.checked)}
          />
          Exact query
        </label>
        <Filter
          label="Speed"
          value={speed}
          values={speeds}
          onChange={setSpeed}
          empty="All speeds"
        />
        {isAllSearchesView ? (
          <button
            type="button"
            className="rounded-2xl border border-rose-300/30 bg-rose-500/15 px-3 py-3 text-sm font-black text-rose-100"
            onClick={() => {
              setView("all");
              setSource("public_create_search");
            }}
          >
            Show /create searches
          </button>
        ) : null}
        {!isAllSearchesView ? (
          <Filter
            label="Severity"
            value={severity}
            values={severities}
            onChange={setSeverity}
            empty="All severities"
          />
        ) : null}
        {!isAllSearchesView ? (
          <Filter
            label="Type"
            value={eventType}
            values={eventTypes}
            onChange={setEventType}
            empty="All types"
          />
        ) : null}
        {!isAllSearchesView ? (
          <Filter
            label="Status"
            value={status}
            values={statuses}
            onChange={setStatus}
            empty="All statuses"
          />
        ) : null}
      </section>

      {notice ? (
        <div className="rounded-2xl border border-emerald-300/25 bg-emerald-500/10 p-4 text-sm font-semibold text-emerald-100">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">
          {error}
        </div>
      ) : null}
      {onlyAdminSearchLab ? (
        <div className="rounded-2xl border border-amber-300/25 bg-amber-300/10 p-4 text-sm font-semibold text-amber-100">
          Currently showing Search Lab events. Public warning logs will appear
          here when user-facing searches trigger warnings.
        </div>
      ) : null}
      {!loading && totalEvents === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/65">
          No search health events logged yet. Create a test event or run Search
          Lab with logging enabled.
        </div>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-2">
        <CountTable
          title="Top Event Types"
          rows={data.topEventTypes ?? []}
          valueKey="type"
        />
        <section className="rounded-3xl border border-white/10 bg-[#120d0b] p-6">
          <h2 className="text-lg font-black">Events by Source</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {eventsBySource.map((row) => (
              <div
                key={row.source}
                className="rounded-2xl bg-white/[0.04] p-4 text-sm"
              >
                <div className="font-black text-white">{row.source}</div>
                <div className="mt-2 text-2xl font-black text-rose-100">
                  {row.count}
                </div>
              </div>
            ))}
            {!eventsBySource.length ? (
              <div className="text-sm text-white/50">
                No source data for this filter.
              </div>
            ) : null}
          </div>
        </section>
      </section>

      {isAllSearchesView ? (
        <section className="rounded-3xl border border-white/10 bg-[#120d0b] p-4 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-xl font-black">All Searches</h2>
              <p className="mt-1 max-w-3xl text-sm text-white/60">
                Showing latest 200 searches for this filter. Clean means the
                system considered the search successful. You can still copy it
                for manual review.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <CopyButton
                disabled={!allSearches.length}
                onClick={() =>
                  copyWithNotice(
                    formatSearchEventsForCopy(allSearches, { range, source }),
                    "Copied visible searches.",
                  )
                }
              >
                Copy Visible Searches
              </CopyButton>
              <CopyButton
                disabled={!allSearches.length}
                onClick={() =>
                  copyWithNotice(
                    formatSearchQueriesForCopy(allSearches),
                    "Copied queries.",
                  )
                }
              >
                Copy Visible Queries
              </CopyButton>
              <CopyButton
                disabled={!allSearches.length}
                onClick={() =>
                  copyWithNotice(
                    formatSearchEventsCsv(allSearches),
                    "Copied CSV.",
                  )
                }
              >
                Copy Search CSV
              </CopyButton>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {allSearches.map((event) => (
              <SearchEventCard
                key={event.id}
                event={event}
                onCopySearch={() =>
                  copyWithNotice(
                    formatSearchEventForCopy(event),
                    "Copied search.",
                  )
                }
                onCopyMetadata={() =>
                  copyWithNotice(
                    JSON.stringify(sanitizeForCopy(event), null, 2),
                    "Copied metadata.",
                  )
                }
              />
            ))}
            {!loading && !allSearches.length ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center text-sm text-white/50">
                No searches match these filters.
              </div>
            ) : null}
          </div>
        </section>
      ) : (
        <section className="rounded-3xl border border-white/10 bg-[#120d0b] p-6">
          <h2 className="text-lg font-black">Recent Search Issues</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[1180px] text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.2em] text-white/45">
                <tr>
                  {[
                    "Time",
                    "Query",
                    "Event Label",
                    "Severity",
                    "Type",
                    "Pair Count",
                    "Restaurant Count",
                    "Activity Count",
                    "Speed",
                    "Market",
                    "Status",
                  ].map((h) => (
                    <th key={h} className="px-3 py-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {(data.recentEvents ?? []).map((event) => (
                  <tr
                    key={event.id}
                    className="cursor-pointer hover:bg-white/[0.04]"
                    onClick={() => openDetail(event.id)}
                  >
                    <td className="px-3 py-3 text-white/60">
                      {formatTime(event.created_at)}
                    </td>
                    <td className="max-w-[280px] truncate px-3 py-3 font-semibold">
                      {event.raw_query || "—"}
                    </td>
                    <td className="px-3 py-3 text-rose-100">
                      {issueLabel(event)}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full border px-2 py-1 text-xs font-black ${severityClass(event.severity)}`}
                      >
                        {event.severity || "info"}
                      </span>
                    </td>
                    <td className="px-3 py-3">{event.event_type || "—"}</td>
                    <td className="px-3 py-3">{event.pair_count ?? "—"}</td>
                    <td className="px-3 py-3">
                      {event.restaurant_count ?? "—"}
                    </td>
                    <td className="px-3 py-3">{event.activity_count ?? "—"}</td>
                    <td className="px-3 py-3">
                      {event.timing_ms
                        ? `${event.timing_ms}ms`
                        : event.speed_status || "—"}
                    </td>
                    <td className="px-3 py-3">
                      {event.default_market_id || "—"}
                    </td>
                    <td className="px-3 py-3">{event.review_status}</td>
                  </tr>
                ))}
                {!loading && !(data.recentEvents ?? []).length ? (
                  <tr>
                    <td
                      className="px-3 py-8 text-center text-white/50"
                      colSpan={11}
                    >
                      No search health events match these filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="grid gap-4 xl:grid-cols-2">
        <CountTable
          title="Top No-Pair Reasons"
          rows={data.topNoPairReasons ?? []}
          valueKey="reason"
          showExample
        />
        <div className="rounded-3xl border border-white/10 bg-[#120d0b] p-6">
          <h2 className="text-lg font-black">Slowest Searches</h2>
          <div className="mt-4 space-y-3">
            {(data.slowestSearches ?? []).map((row) => (
              <div
                key={row.id}
                className="rounded-2xl bg-white/[0.04] p-3 text-sm"
              >
                <div className="font-semibold">{row.raw_query || "—"}</div>
                <div className="mt-1 text-white/55">
                  {row.timing_ms}ms · {row.source} ·{" "}
                  {formatTime(row.last_seen || row.created_at)}
                </div>
              </div>
            ))}
            {!(data.slowestSearches ?? []).length ? (
              <div className="text-sm text-white/50">
                No slow searches found.
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <CountTable
          title="Top No-Result Reasons"
          rows={data.topNoResultReasons ?? []}
          valueKey="reason"
          showExample
        />
        <div className="rounded-3xl border border-white/10 bg-[#120d0b] p-6">
          <h2 className="text-lg font-black">Common Failing Queries</h2>
          <div className="mt-4 space-y-3">
            {(data.commonFailingQueries ?? []).map((row) => (
              <div
                key={row.query}
                className="rounded-2xl bg-white/[0.04] p-3 text-sm"
              >
                <div className="font-semibold">{row.query}</div>
                <div className="mt-1 text-white/55">
                  {row.count} events · last seen {formatTime(row.lastSeen)}
                </div>
              </div>
            ))}
            {!(data.commonFailingQueries ?? []).length ? (
              <div className="text-sm text-white/50">
                No repeated failing queries found.
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {selected ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-5xl overflow-auto rounded-3xl border border-white/10 bg-[#120d0b] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-200">
                  Search Health Detail
                </p>
                <h3 className="mt-2 text-2xl font-black">
                  {selected.raw_query || "Untitled event"}
                </h3>
                <p className="mt-1 text-sm text-white/55">
                  {formatTime(selected.created_at)} · {selected.source} ·{" "}
                  {selected.event_type}
                </p>
              </div>
              <button
                className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold"
                onClick={() => setSelected(null)}
              >
                Close
              </button>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {[
                "event_label",
                "severity",
                "no_pairs_reason",
                "no_results_reason",
                "restaurant_count",
                "activity_count",
                "pair_count",
                "timing_ms",
                "speed_status",
              ].map((key) => (
                <div
                  key={key}
                  className="rounded-2xl bg-white/[0.04] p-3 text-sm"
                >
                  <p className="text-xs uppercase tracking-[0.18em] text-white/40">
                    {key}
                  </p>
                  <p className="mt-1 font-semibold">
                    {String(selected[key] ?? "—")}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-2xl bg-white px-4 py-2 text-sm font-black text-black"
                onClick={copyDebugJson}
              >
                Copy Debug JSON
              </button>
              {selected.raw_query ? (
                <Link
                  className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-black text-white"
                  href={`/admin/dashboard/beta/search-lab?q=${encodeURIComponent(selected.raw_query)}`}
                >
                  Re-run in Search Lab
                </Link>
              ) : null}
            </div>
            <section className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
              <h4 className="font-black">Review</h4>
              <div className="mt-3 grid gap-3 md:grid-cols-[220px_1fr_auto]">
                <select
                  className="rounded-2xl border border-white/10 bg-black/40 px-3 py-3 text-sm text-white"
                  value={reviewStatus}
                  onChange={(event) => setReviewStatus(event.target.value)}
                >
                  {statuses.filter(Boolean).map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
                <input
                  className="rounded-2xl border border-white/10 bg-black/40 px-3 py-3 text-sm text-white"
                  value={reviewNotes}
                  onChange={(event) => setReviewNotes(event.target.value)}
                  placeholder="Review notes"
                />
                <button
                  className="rounded-2xl bg-rose-600 px-4 py-2 text-sm font-black text-white disabled:opacity-60"
                  disabled={actionLoading === "review"}
                  onClick={saveReview}
                >
                  {actionLoading === "review" ? "Saving…" : "Save"}
                </button>
              </div>
            </section>
            <pre className="mt-4 overflow-auto rounded-2xl bg-black/40 p-4 text-xs leading-5 text-white/70">
              {JSON.stringify(selected.debug ?? {}, null, 2)}
            </pre>
          </div>
        </div>
      ) : null}
      {detailLoading ? (
        <div className="fixed bottom-4 right-4 rounded-full bg-white px-4 py-2 text-sm font-black text-black">
          Loading event…
        </div>
      ) : null}
    </>
  );
}

function CopyButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-2xl bg-white px-3 py-2 text-xs font-black text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  const classes = {
    neutral: "border-white/15 bg-white/10 text-white/75",
    good: "border-emerald-300/25 bg-emerald-500/15 text-emerald-100",
    warn: "border-amber-300/25 bg-amber-500/15 text-amber-100",
    bad: "border-red-300/25 bg-red-500/15 text-red-100",
  }[tone];
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-xs font-black ${classes}`}
    >
      {children}
    </span>
  );
}

function SearchEventCard({
  event,
  onCopySearch,
  onCopyMetadata,
}: {
  event: any;
  onCopySearch: () => void;
  onCopyMetadata: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isIssue = event.had_issue || event.success === false;
  const normalizedDiffers =
    event.normalized_query && event.normalized_query !== event.raw_query;
  return (
    <article className="rounded-3xl border border-white/10 bg-white/[0.045] p-4 shadow-sm shadow-black/20 sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="break-words text-lg font-black text-white sm:text-xl">
              {event.raw_query || "Untitled search"}
            </h3>
            <Badge>{event.source || "unknown"}</Badge>
            <Badge tone={isIssue ? "bad" : "good"}>
              {isIssue ? "Issue" : "Clean"}
            </Badge>
            {event.success === false ? (
              <Badge tone="bad">Failed</Badge>
            ) : (
              <Badge tone="good">Success</Badge>
            )}
          </div>
          <p className="mt-2 text-sm text-white/55">
            {formatTime(event.created_at)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CopyButton onClick={onCopySearch}>Copy Search</CopyButton>
          <CopyButton onClick={onCopyMetadata}>Copy Metadata</CopyButton>
          {event.raw_query ? (
            <Link
              className="rounded-2xl bg-rose-600 px-3 py-2 text-xs font-black text-white transition hover:bg-rose-500"
              href={`/admin/dashboard/beta/search-lab?query=${encodeURIComponent(event.raw_query)}`}
            >
              Re-run in Search Lab
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="rounded-2xl bg-white/10 px-3 py-2 text-xs font-black text-white transition hover:bg-white/15"
          >
            {expanded ? "Hide Details" : "View Details"}
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 text-sm text-white/70 md:grid-cols-2 xl:grid-cols-4">
        <Info label="Route" value={event.route} />
        <Info label="Search type" value={event.search_type} />
        <Info label="Primary domain" value={event.primary_domain} />
        {normalizedDiffers ? (
          <Info label="Normalized" value={event.normalized_query} />
        ) : null}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Restaurants" value={event.restaurant_count} />
        <Stat label="Activities" value={event.activity_count} />
        <Stat label="Pairs" value={event.pair_count} />
        <Stat label="Results" value={event.result_count} />
        <Stat
          label="Time"
          value={event.timing_ms ? `${event.timing_ms} ms` : "—"}
          sub={event.speed_status || "good"}
        />
      </div>

      {isIssue ? (
        <div className="mt-4 rounded-2xl border border-red-300/20 bg-red-500/10 p-3 text-sm text-red-100">
          <span className="font-black">Issue:</span>{" "}
          {cleanValue(
            event.issue_label ||
              event.issue_type ||
              event.no_results_reason ||
              event.no_pairs_reason,
          )}
          <div className="mt-2 grid gap-2 text-xs text-red-100/80 sm:grid-cols-2 lg:grid-cols-4">
            <span>had_issue: {cleanValue(event.had_issue)}</span>
            <span>type: {cleanValue(event.issue_type)}</span>
            <span>no results: {cleanValue(event.no_results_reason)}</span>
            <span>no pairs: {cleanValue(event.no_pairs_reason)}</span>
          </div>
        </div>
      ) : null}

      {expanded ? (
        <pre className="mt-4 max-h-96 overflow-auto rounded-2xl border border-white/10 bg-black/30 p-4 text-xs leading-5 text-white/70">
          {JSON.stringify(sanitizeForCopy(event), null, 2)}
        </pre>
      ) : null}
    </article>
  );
}

function Info({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-2xl bg-black/20 p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">
        {label}
      </p>
      <p className="mt-1 break-words font-semibold text-white/80">
        {cleanValue(value)}
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: unknown;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <p className="text-xs font-bold text-white/45">{label}</p>
      <p className="mt-1 text-lg font-black text-white">{cleanValue(value)}</p>
      {sub ? (
        <p className="mt-1 text-xs font-semibold text-white/45">Speed: {sub}</p>
      ) : null}
    </div>
  );
}

function Filter({
  label,
  value,
  values,
  options,
  empty,
  onChange,
}: {
  label: string;
  value: string;
  values?: string[];
  options?: { label: string; value: string }[];
  empty?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">
      {label}
      <select
        className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-3 text-sm normal-case tracking-normal text-white"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {(
          options ??
          values?.map((item) => ({
            label: item || empty || item,
            value: item,
          })) ??
          []
        ).map((item) => (
          <option key={item.value || "all"} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function CountTable({
  title,
  rows,
  valueKey,
  showExample,
}: {
  title: string;
  rows: CountRow[];
  valueKey: "type" | "reason";
  showExample?: boolean;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-[#120d0b] p-6">
      <h2 className="text-lg font-black">{title}</h2>
      <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.2em] text-white/45">
            <tr>
              <th className="px-4 py-3">
                {valueKey === "type" ? "Type" : "Reason"}
              </th>
              <th className="px-4 py-3">Count</th>
              {showExample ? (
                <th className="px-4 py-3">Example Query</th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {rows.map((row) => (
              <tr key={String(row[valueKey])}>
                <td className="px-4 py-3">{row[valueKey]}</td>
                <td className="px-4 py-3 font-black">{row.count}</td>
                {showExample ? (
                  <td className="max-w-[260px] truncate px-4 py-3 text-white/60">
                    {row.exampleQuery || "—"}
                  </td>
                ) : null}
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td
                  className="px-4 py-6 text-white/50"
                  colSpan={showExample ? 3 : 2}
                >
                  No data found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
