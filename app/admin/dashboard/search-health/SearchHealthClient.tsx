"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import BatchQaRunner from "./BatchQaRunner";

async function copyJsonToClipboard(value: unknown) {
  const text =
    typeof value === "string" ? value : JSON.stringify(value ?? {}, null, 2);

  try {
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard?.writeText &&
      typeof window !== "undefined" &&
      window.isSecureContext
    ) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    if (typeof document !== "undefined") {
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
      if (!copied) throw new Error("document.execCommand copy failed");
      return true;
    }

    throw new Error("Clipboard unavailable");
  } catch (error) {
    console.error("Failed to copy JSON", error);
    if (typeof window !== "undefined") {
      window.prompt("Copy JSON manually:", text);
    }
    return false;
  }
}

type CountRow = {
  reason?: string;
  type?: string;
  count: number;
  exampleQuery?: string | null;
};
type SearchEventRow = {
  id: string;
  created_at: string;
  source?: string | null;
  route?: string | null;
  raw_query?: string | null;
  normalized_query?: string | null;
  search_type?: string | null;
  primary_domain?: string | null;
  intent_parser_source?: string | null;
  city?: string | null;
  state?: string | null;
  borough?: string | null;
  neighborhood?: string | null;
  outing_date?: string | null;
  outing_time?: string | null;
  restaurant_count?: number | null;
  activity_count?: number | null;
  pair_count?: number | null;
  result_count?: number | null;
  distance_mode?: string | null;
  max_pair_distance_miles?: number | null;
  max_pair_walking_minutes?: number | null;
  timing_ms?: number | null;
  speed_status?: string | null;
  success?: boolean | null;
  had_issue?: boolean | null;
  issue_label?: string | null;
};

type SearchHealthData = {
  summary?: Record<string, any>;
  recentEvents?: any[];
  allSearches?: SearchEventRow[];
  matchCount?: number;
  filters?: Record<string, any>;
  topEventTypes?: CountRow[];
  topNoPairReasons?: CountRow[];
  topNoResultReasons?: CountRow[];
  slowestSearches?: any[];
  commonFailingQueries?: any[];
  eventsBySource?: { source: string; count: number }[];
  lastDigestRun?: any | null;
};

const ranges = ["24h", "7d", "30d"];
const tabs = [
  { key: "issues", label: "Recent Issues" },
  { key: "all", label: "All Searches" },
  { key: "slow", label: "Slow Searches" },
  { key: "no_results", label: "No Results" },
  { key: "no_pairs", label: "No Valid Pairs" },
  { key: "debug", label: "Debug Events" },
] as const;
const sources = [
  "",
  "admin_search_lab",
  "public_create_search",
  "public_explore_search",
  "public_plan_search",
  "beta_tester_search",
  "search_api",
  "admin_test_event",
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

function formatPairLimit(value: number | null | undefined, unit: "mi" | "min") {
  if (value == null) return "Any";
  return `${value}${unit === "mi" ? " mi" : " min"}`;
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
  const [range, setRange] = useState("24h");
  const [view, setView] = useState<
    "issues" | "all" | "slow" | "no_results" | "no_pairs" | "debug"
  >("issues");
  const [date, setDate] = useState("");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [exactQuery, setExactQuery] = useState(false);
  const [source, setSource] = useState("");
  const [status, setStatus] = useState("");
  const [speed, setSpeed] = useState("");
  const [severity, setSeverity] = useState("");
  const [eventType, setEventType] = useState("");
  const [data, setData] = useState<SearchHealthData>({});
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reviewStatus, setReviewStatus] = useState("new");
  const [reviewNotes, setReviewNotes] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 300);

    return () => window.clearTimeout(timer);
  }, [query]);

  const params = useMemo(() => {
    const next = new URLSearchParams({ range, view });

    if (date) next.set("date", date);
    if (debouncedQuery) next.set("q", debouncedQuery);
    if (exactQuery) next.set("exactQuery", "true");

    if (source) next.set("source", source);
    if (status) next.set("review_status", status);
    if (speed) next.set("speed_status", speed);
    if (severity) next.set("severity", severity);
    if (eventType) next.set("event_type", eventType);

    if (view === "slow") next.set("speed_status", speed || "slow");
    if (view === "no_results") next.set("event_type", eventType || "no_results");
    if (view === "no_pairs") next.set("event_type", eventType || "no_valid_pairs");
    if (view === "debug") next.set("event_type", eventType || "successful_debug_run");

    return next;
  }, [
    range,
    view,
    date,
    debouncedQuery,
    exactQuery,
    source,
    status,
    speed,
    severity,
    eventType,
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

    const copied = await copyJsonToClipboard(selected.debug ?? {});
    if (copied) {
      setNotice("Debug JSON copied.");
      setError(null);
    } else {
      setError(
        "Could not copy Debug JSON. You can still copy it manually from the popup or detail panel.",
      );
    }
  }

  async function copyFullEventJson() {
    if (!selected) return;

    const copied = await copyJsonToClipboard(selected);
    if (copied) {
      setNotice("Full event JSON copied.");
      setError(null);
    } else {
      setError(
        "Could not copy full event JSON. You can still copy it manually from the popup or detail panel.",
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
  const cards = [
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

      <section className="space-y-4 rounded-3xl border border-white/10 bg-[#120d0b] p-4">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setView(tab.key)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                view === tab.key
                  ? "border-amber-300/60 bg-amber-300/15 text-amber-100"
                  : "border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.06]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {ranges.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                setRange(item);
                setDate("");
              }}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                range === item && !date
                  ? "border-amber-300/60 bg-amber-300/15 text-amber-100"
                  : "border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.06]"
              }`}
            >
              {item === "24h" ? "Last 24h" : item === "7d" ? "7 days" : "30 days"}
            </button>
          ))}

          <input
            type="date"
            value={date}
            onChange={(event) => {
              setDate(event.target.value);
              setRange("24h");
            }}
            className="rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-white outline-none focus:border-amber-300/60"
          />

          {date ? (
            <button
              type="button"
              onClick={() => {
                setDate("");
                setRange("24h");
              }}
              className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/60 hover:bg-white/[0.06]"
            >
              Clear date
            </button>
          ) : null}
        </div>

        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          <Filter
            label="Source"
            value={source}
            values={sources}
            onChange={setSource}
            empty="All sources"
          />
          <Filter
            label="Severity"
            value={severity}
            values={severities}
            onChange={setSeverity}
            empty="All severities"
          />
          <Filter
            label="Type"
            value={eventType}
            values={eventTypes}
            onChange={setEventType}
            empty="All types"
          />
          <Filter
            label="Status"
            value={status}
            values={statuses}
            onChange={setStatus}
            empty="All statuses"
          />
          <Filter
            label="Speed"
            value={speed}
            values={speeds}
            onChange={setSpeed}
            empty="All speeds"
          />
        </div>
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

      <section className="rounded-3xl border border-white/10 bg-[#120d0b] p-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">
              {view === "all" ? "All Searches" : "Recent Search Issues"}
            </h2>
            <p className="text-xs text-white/50">
              {date
                ? `Showing ${date}`
                : range === "24h"
                  ? "Showing last 24 hours"
                  : range === "7d"
                    ? "Showing last 7 days"
                    : "Showing last 30 days"}
              {debouncedQuery
                ? ` · ${exactQuery ? "exact query" : "search"} · ${
                    data?.matchCount ?? 0
                  } matches`
                : ""}
            </p>
          </div>

          <div className="flex w-full flex-col gap-2 md:w-auto md:min-w-[420px]">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search exact query, user search, source, issue, market, route..."
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white placeholder:text-white/35 outline-none focus:border-amber-300/60"
            />

            <label className="flex items-center gap-2 text-xs text-white/55">
              <input
                type="checkbox"
                checked={exactQuery}
                onChange={(event) => setExactQuery(event.target.checked)}
                className="h-4 w-4 rounded border-white/20 bg-black"
              />
              Exact query only
            </label>
          </div>
        </div>

        <div className="mt-3 text-xs text-white/45">
          Active filters: {view.replace(/_/g, " ")} · {date || range}
          {source ? ` · source ${source}` : ""}
          {severity ? ` · severity ${severity}` : ""}
          {eventType ? ` · type ${eventType}` : ""}
          {status ? ` · status ${status}` : ""}
          {speed ? ` · speed ${speed}` : ""}
        </div>

        {view === "all" ? (
          <div className="mt-4 overflow-x-auto rounded-3xl border border-white/10">
            <table className="min-w-[1100px] w-full text-left text-sm">
              <thead className="bg-white/[0.03] text-xs uppercase tracking-[0.2em] text-white/40">
                <tr>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Search</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Route</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Outing</th>
                  <th className="px-4 py-3">Pair Limit</th>
                  <th className="px-4 py-3">Results</th>
                  <th className="px-4 py-3">Speed</th>
                  <th className="px-4 py-3">Issue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {(data?.allSearches ?? []).map((row) => (
                  <tr key={row.id} className="hover:bg-white/[0.03]">
                    <td className="px-4 py-3 text-white/60">
                      {formatTime(row.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="max-w-[320px] truncate font-medium text-white">
                        {row.raw_query || "—"}
                      </div>
                      <div className="text-xs text-white/40">
                        {row.intent_parser_source || "parser unknown"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-white/60">{row.source || "—"}</td>
                    <td className="px-4 py-3 text-white/60">{row.route || "—"}</td>
                    <td className="px-4 py-3 text-white/60">
                      {row.search_type || "—"} / {row.primary_domain || "—"}
                    </td>
                    <td className="px-4 py-3 text-white/60">
                      {[row.neighborhood, row.borough, row.city, row.state]
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </td>
                    <td className="px-4 py-3 text-white/60">
                      {[row.outing_date, row.outing_time].filter(Boolean).join(" · ") ||
                        "—"}
                    </td>
                    <td className="px-4 py-3 text-white/60">
                      <div>{row.distance_mode || "any"}</div>
                      <div className="text-xs text-white/35">
                        {formatPairLimit(row.max_pair_distance_miles, "mi")} · {formatPairLimit(row.max_pair_walking_minutes, "min")}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-white/60">
                      {row.result_count ?? 0}
                      <span className="ml-2 text-white/35">
                        R {row.restaurant_count ?? 0} · A {row.activity_count ?? 0} · P{" "}
                        {row.pair_count ?? 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white/60">
                      {row.timing_ms ? `${row.timing_ms}ms` : "—"}
                      {row.speed_status ? (
                        <span className="ml-2 text-white/35">{row.speed_status}</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      {row.had_issue ? (
                        <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-2 py-1 text-xs text-amber-100">
                          {row.issue_label || "Issue"}
                        </span>
                      ) : (
                        <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-1 text-xs text-emerald-100">
                          OK
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[1450px] text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.2em] text-white/45">
                <tr>
                  {[
                    "Time",
                    "Query",
                    "Source",
                    "Route",
                    "Parser",
                    "Event Type",
                    "Severity",
                    "Issue Label",
                    "Restaurant Count",
                    "Activity Count",
                    "Pair Count",
                    "Speed",
                    "Review Status",
                    "Debug",
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
                    <td className="px-3 py-3 text-white/60">{event.source || "—"}</td>
                    <td className="px-3 py-3 text-white/60">{event.route || "—"}</td>
                    <td className="px-3 py-3 text-white/60">
                      {event.intentParserSource || "—"}
                    </td>
                    <td className="px-3 py-3">{event.event_type || "—"}</td>
                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full border px-2 py-1 text-xs font-black ${severityClass(event.severity)}`}
                      >
                        {event.severity || "info"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-rose-100">
                      {issueLabel(event)}
                    </td>
                    <td className="px-3 py-3">{event.restaurant_count ?? "—"}</td>
                    <td className="px-3 py-3">{event.activity_count ?? "—"}</td>
                    <td className="px-3 py-3">{event.pair_count ?? "—"}</td>
                    <td className="px-3 py-3">
                      {event.timing_ms
                        ? `${event.timing_ms}ms`
                        : event.speed_status || "—"}
                    </td>
                    <td className="px-3 py-3">{event.review_status}</td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={(clickEvent) => {
                          clickEvent.stopPropagation();
                          void copyJsonToClipboard(event.debug ?? {});
                        }}
                        className="rounded-full border border-white/10 px-2 py-1 text-xs text-white/65 hover:bg-white/[0.06]"
                      >
                        Copy Debug JSON
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {view === "all" && !loading && (data?.allSearches ?? []).length === 0 ? (
          <div className="mt-4 rounded-3xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/60">
            No searches found for this filter. If you expected searches here, confirm
            logSearchEvent is being called from /api/generate and /api/explore/search.
          </div>
        ) : null}

        {view !== "all" && !loading && (data?.recentEvents ?? []).length === 0 ? (
          <div className="mt-4 rounded-3xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/60">
            No search health events found for this filter. Successful searches only
            appear here if search health logging is enabled for that route. Use the All
            Searches tab for normal successful searches.
          </div>
        ) : null}
      </section>

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
              <button
                type="button"
                className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-black text-white"
                onClick={copyFullEventJson}
              >
                Copy Full Event JSON
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

function Filter({
  label,
  value,
  values,
  empty,
  onChange,
}: {
  label: string;
  value: string;
  values: string[];
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
        {values.map((item) => (
          <option key={item || "all"} value={item}>
            {item || empty || item}
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
