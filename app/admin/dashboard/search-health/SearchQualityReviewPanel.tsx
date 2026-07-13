"use client";

import { useEffect, useMemo, useState } from "react";

type Row = {
  id: string;
  created_at: string;
  raw_query: string | null;
  normalized_query: string | null;
  search_type: string | null;
  primary_domain: string | null;
  result_count: number | null;
  technical_success: boolean | null;
  quality_success: boolean | null;
  quality_severity: string | null;
  quality_issue_type: string | null;
  quality_issue_label: string | null;
  suspicious_flags: string[] | null;
  quality_findings: any[] | null;
  quality_metrics: Record<string, unknown> | null;
  quality_review_status: string | null;
  quality_review_notes: string | null;
  metadata: Record<string, unknown> | null;
};

type QueueFilter = "attention" | "critical" | "high" | "medium" | "low" | "info" | "all";

const filters: Array<{ key: QueueFilter; label: string }> = [
  { key: "attention", label: "Needs attention" },
  { key: "critical", label: "Critical" },
  { key: "high", label: "High" },
  { key: "medium", label: "Medium" },
  { key: "low", label: "Low" },
  { key: "info", label: "Info" },
  { key: "all", label: "All" },
];

const priority: Record<string, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

export default function SearchQualityReviewPanel() {
  const [filter, setFilter] = useState<QueueFilter>("attention");
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Row | null>(null);
  const [loading, setLoading] = useState(false);
  const [visibleCount, setVisibleCount] = useState(6);

  async function load() {
    setLoading(true);
    const response = await fetch("/api/admin/search-health/quality-review?severity=all", {
      cache: "no-store",
    });
    const payload = await response.json();
    setRows(Array.isArray(payload?.rows) ? payload.rows : []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    setVisibleCount(6);
  }, [filter]);

  async function mark(status: "reviewed" | "false_positive") {
    if (!selected) return;
    await fetch("/api/admin/search-health/quality-review", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: selected.id, status }),
    });
    setSelected(null);
    await load();
  }

  const counts = useMemo(
    () =>
      rows.reduce<Record<string, number>>((acc, row) => {
        const key = row.quality_severity ?? "info";
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {}),
    [rows],
  );

  const attentionCount = (counts.critical ?? 0) + (counts.high ?? 0);
  const lowerPriorityCount =
    (counts.medium ?? 0) + (counts.low ?? 0) + (counts.info ?? 0);

  const filteredRows = useMemo(() => {
    const next = rows.filter((row) => {
      const severity = row.quality_severity ?? "info";
      if (filter === "attention") return severity === "critical" || severity === "high";
      if (filter === "all") return true;
      return severity === filter;
    });

    return [...next].sort((a, b) => {
      const severityDifference =
        (priority[b.quality_severity ?? "info"] ?? 0) -
        (priority[a.quality_severity ?? "info"] ?? 0);
      if (severityDifference !== 0) return severityDifference;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [filter, rows]);

  const visibleRows = filteredRows.slice(0, visibleCount);

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-rose-200">
            Quality review
          </p>
          <h2 className="mt-2 text-2xl font-black">Priority review queue</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
            Start with searches that are most likely to affect users. Medium, low, and informational findings remain available without filling the top of the page.
          </p>
        </div>

        <div className="grid min-w-[260px] grid-cols-2 gap-2 text-sm">
          <div className="rounded-2xl border border-rose-400/25 bg-rose-600/10 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-rose-100/70">Needs attention</p>
            <p className="mt-1 text-2xl font-black text-white">{attentionCount}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-white/45">Lower priority</p>
            <p className="mt-1 text-2xl font-black text-white">{lowerPriorityCount}</p>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {filters.map((item) => {
          const count =
            item.key === "attention"
              ? attentionCount
              : item.key === "all"
                ? rows.length
                : counts[item.key] ?? 0;

          return (
            <button
              key={item.key}
              onClick={() => setFilter(item.key)}
              className={`rounded-full px-3 py-2 text-xs font-black ${
                filter === item.key
                  ? "bg-rose-600 text-white"
                  : "border border-white/10 text-white/70 hover:border-white/25"
              }`}
            >
              {item.label} ({count})
            </button>
          );
        })}
      </div>

      {filter === "attention" && attentionCount === 0 && !loading ? (
        <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
          <p className="font-black text-emerald-100">No critical or high-priority searches need review.</p>
          <p className="mt-1 text-sm text-emerald-100/65">
            Use the Medium, Low, Info, or All filters when you want a broader quality audit.
          </p>
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {loading ? <p className="text-sm text-white/55">Loading quality findings…</p> : null}
        {!loading && !filteredRows.length && attentionCount > 0 ? (
          <p className="text-sm text-white/55">No unreviewed searches match this filter.</p>
        ) : null}
        {visibleRows.map((row) => (
          <button
            key={row.id}
            onClick={() => setSelected(row)}
            className="rounded-2xl border border-white/10 bg-black/20 p-4 text-left hover:border-rose-400/50"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="rounded-full bg-rose-600/20 px-2 py-1 text-[10px] font-black uppercase text-rose-100">
                {row.quality_severity ?? "info"}
              </span>
              <span className="text-xs text-white/35">
                {new Date(row.created_at).toLocaleString()}
              </span>
            </div>
            <p className="mt-3 font-black text-white">
              {row.raw_query || row.normalized_query || "Untitled search"}
            </p>
            <p className="mt-2 text-sm text-white/60">
              {row.quality_issue_label || "Search quality issue"}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-white/45">
              <span>Technical: {row.technical_success === false ? "failed" : "success"}</span>
              <span>Quality: {row.quality_success === false ? "failed" : "passed"}</span>
              <span>Results: {row.result_count ?? 0}</span>
            </div>
          </button>
        ))}
      </div>

      {!loading && filteredRows.length > visibleRows.length ? (
        <div className="mt-5 flex justify-center">
          <button
            onClick={() => setVisibleCount((current) => current + 6)}
            className="rounded-xl border border-white/15 px-4 py-3 text-sm font-black text-white/75 hover:border-white/30"
          >
            Show 6 more ({filteredRows.length - visibleRows.length} remaining)
          </button>
        </div>
      ) : null}

      {selected ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/70" onClick={() => setSelected(null)}>
          <aside
            className="h-full w-full max-w-2xl overflow-y-auto border-l border-white/10 bg-[#100b0b] p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-rose-200">Evidence drawer</p>
                <h3 className="mt-2 text-2xl font-black">{selected.raw_query || selected.normalized_query}</h3>
              </div>
              <button onClick={() => setSelected(null)} className="rounded-full border border-white/10 px-3 py-2 text-sm">Close</button>
            </div>
            <dl className="mt-6 grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm sm:grid-cols-2">
              <div><dt className="text-white/40">Issue type</dt><dd className="font-bold">{selected.quality_issue_type || "—"}</dd></div>
              <div><dt className="text-white/40">Severity</dt><dd className="font-bold">{selected.quality_severity || "—"}</dd></div>
              <div><dt className="text-white/40">Search type</dt><dd className="font-bold">{selected.search_type || "—"}</dd></div>
              <div><dt className="text-white/40">Primary domain</dt><dd className="font-bold">{selected.primary_domain || "—"}</dd></div>
            </dl>
            <div className="mt-5">
              <h4 className="font-black">Suspicious flags</h4>
              <div className="mt-2 flex flex-wrap gap-2">{(selected.suspicious_flags ?? []).map((flag) => <span key={flag} className="rounded-full border border-rose-400/30 bg-rose-600/10 px-3 py-1 text-xs text-rose-100">{flag}</span>)}</div>
            </div>
            <div className="mt-5">
              <h4 className="font-black">Findings and result evidence</h4>
              <pre className="mt-2 overflow-x-auto rounded-2xl border border-white/10 bg-black/30 p-4 text-xs text-white/70">{JSON.stringify({ findings: selected.quality_findings, metrics: selected.quality_metrics, metadata: selected.metadata }, null, 2)}</pre>
            </div>
            <div className="mt-6 flex gap-3">
              <button onClick={() => void mark("reviewed")} className="rounded-xl bg-rose-600 px-4 py-3 text-sm font-black">Mark reviewed</button>
              <button onClick={() => void mark("false_positive")} className="rounded-xl border border-white/15 px-4 py-3 text-sm font-black">Mark false positive</button>
            </div>
          </aside>
        </div>
      ) : null}
    </section>
  );
}
