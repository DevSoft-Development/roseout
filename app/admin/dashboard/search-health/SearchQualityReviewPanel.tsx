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

const severities = ["all", "critical", "high", "medium", "low", "info"];

export default function SearchQualityReviewPanel() {
  const [severity, setSeverity] = useState("all");
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Row | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const response = await fetch(`/api/admin/search-health/quality-review?severity=${severity}`, { cache: "no-store" });
    const payload = await response.json();
    setRows(Array.isArray(payload?.rows) ? payload.rows : []);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [severity]);

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

  const counts = useMemo(() => rows.reduce<Record<string, number>>((acc, row) => {
    const key = row.quality_severity ?? "info";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {}), [rows]);

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-rose-200">Quality review</p>
          <h2 className="mt-2 text-2xl font-black">Flagged searches</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {severities.map((item) => (
            <button key={item} onClick={() => setSeverity(item)} className={`rounded-full px-3 py-2 text-xs font-black ${severity === item ? "bg-rose-600 text-white" : "border border-white/10 text-white/70"}`}>
              {item} {item !== "all" && counts[item] ? `(${counts[item]})` : ""}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {loading ? <p className="text-sm text-white/55">Loading quality findings…</p> : null}
        {!loading && !rows.length ? <p className="text-sm text-white/55">No unreviewed searches match this filter.</p> : null}
        {rows.map((row) => (
          <button key={row.id} onClick={() => setSelected(row)} className="rounded-2xl border border-white/10 bg-black/20 p-4 text-left hover:border-rose-400/50">
            <div className="flex items-center justify-between gap-3">
              <span className="rounded-full bg-rose-600/20 px-2 py-1 text-[10px] font-black uppercase text-rose-100">{row.quality_severity ?? "info"}</span>
              <span className="text-xs text-white/35">{new Date(row.created_at).toLocaleString()}</span>
            </div>
            <p className="mt-3 font-black text-white">{row.raw_query || row.normalized_query || "Untitled search"}</p>
            <p className="mt-2 text-sm text-white/60">{row.quality_issue_label || "Search quality issue"}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-white/45">
              <span>Technical: {row.technical_success === false ? "failed" : "success"}</span>
              <span>Quality: {row.quality_success === false ? "failed" : "passed"}</span>
              <span>Results: {row.result_count ?? 0}</span>
            </div>
          </button>
        ))}
      </div>

      {selected ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/70" onClick={() => setSelected(null)}>
          <aside className="h-full w-full max-w-2xl overflow-y-auto border-l border-white/10 bg-[#100b0b] p-6" onClick={(event) => event.stopPropagation()}>
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
