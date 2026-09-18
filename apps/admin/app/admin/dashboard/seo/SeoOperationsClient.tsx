"use client";

import { useEffect, useMemo, useState } from "react";

type Inspection = {
  url: string;
  status: number;
  ok: boolean;
  indexable: boolean;
  title: string | null;
  description: string | null;
  canonical: string | null;
  robots: string | null;
  hasJsonLd: boolean;
  inSitemap: boolean;
  issues: string[];
  checkedAt: string;
};

type AuditRun = {
  id: string;
  status: string;
  score: number | null;
  pages_scanned: number;
  issues_found: number;
  critical_count: number;
  warning_count: number;
  improvement_count: number;
  passed_count: number;
  created_at: string;
  completed_at?: string | null;
};

type AuditIssue = {
  id: string;
  severity: string;
  title: string;
  description?: string | null;
  affected_route?: string | null;
  recommended_fix?: string | null;
  status: string;
  created_at: string;
};

function statusClass(good: boolean) {
  return good
    ? "border-emerald-300/20 bg-emerald-500/10 text-emerald-100"
    : "border-amber-300/20 bg-amber-500/10 text-amber-100";
}

function severityClass(severity: string) {
  if (severity === "critical") return "border-red-300/20 bg-red-500/10 text-red-100";
  if (severity === "warning") return "border-amber-300/20 bg-amber-500/10 text-amber-100";
  return "border-sky-300/20 bg-sky-500/10 text-sky-100";
}

export default function SeoOperationsClient({ priorityUrls }: { priorityUrls: string[] }) {
  const [url, setUrl] = useState("/about");
  const [loading, setLoading] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [result, setResult] = useState<Inspection | null>(null);
  const [runs, setRuns] = useState<AuditRun[]>([]);
  const [auditIssues, setAuditIssues] = useState<AuditIssue[]>([]);
  const [error, setError] = useState<string | null>(null);

  const absoluteUrl = useMemo(() => {
    const value = url.trim();
    if (!value) return "https://theouthaven.com/";
    if (value.startsWith("http://") || value.startsWith("https://")) return value;
    return `https://theouthaven.com${value.startsWith("/") ? value : `/${value}`}`;
  }, [url]);

  const latestRun = runs[0] || null;
  const openIssues = auditIssues.filter((issue) => issue.status === "open");

  async function loadOperationsData() {
    setDataLoading(true);
    try {
      const [runsResponse, issuesResponse] = await Promise.all([
        fetch("/api/admin/seo/runs", { cache: "no-store" }),
        fetch("/api/admin/seo/issues", { cache: "no-store" }),
      ]);
      const [runsPayload, issuesPayload] = await Promise.all([runsResponse.json(), issuesResponse.json()]);
      if (runsResponse.ok) setRuns(runsPayload.runs || []);
      if (issuesResponse.ok) setAuditIssues(issuesPayload.issues || []);
    } finally {
      setDataLoading(false);
    }
  }

  useEffect(() => {
    void loadOperationsData();
  }, []);

  async function inspect(nextUrl = url) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/seo/inspect?url=${encodeURIComponent(nextUrl)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Inspection failed");
      setResult(payload);
      setUrl(nextUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Inspection failed");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  async function runAudit() {
    setAuditLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/seo/audit", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "SEO audit failed");
      await loadOperationsData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "SEO audit failed");
    } finally {
      setAuditLoading(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["SEO score", latestRun?.score == null ? "—" : `${latestRun.score}/100`],
          ["Pages audited", latestRun ? String(latestRun.pages_scanned || 0) : "—"],
          ["Open issues", dataLoading ? "…" : String(openIssues.length)],
          ["Critical", latestRun ? String(latestRun.critical_count || 0) : "—"],
          ["Warnings", latestRun ? String(latestRun.warning_count || 0) : "—"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">{label}</p>
            <p className="mt-2 text-2xl font-black text-white">{value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-3xl border border-white/10 bg-black/25 p-5 md:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end">
          <div className="min-w-0 flex-1">
            <label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Inspect public URL</label>
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") void inspect(); }}
              placeholder="/about or https://theouthaven.com/about"
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition focus:border-rose-400/50"
            />
          </div>
          <button onClick={() => void inspect()} disabled={loading} className="rounded-2xl bg-[#e1062a] px-6 py-3 text-sm font-black text-white transition hover:bg-red-500 disabled:opacity-50">
            {loading ? "Inspecting…" : "Run Live Inspection"}
          </button>
          <button onClick={() => void runAudit()} disabled={auditLoading} className="rounded-2xl border border-rose-400/40 bg-rose-500/10 px-6 py-3 text-sm font-black text-rose-100 transition hover:bg-rose-500/20 disabled:opacity-50">
            {auditLoading ? "Auditing…" : "Run SEO Audit"}
          </button>
          <a href="https://search.google.com/search-console?resource_id=sc-domain%3Atheouthaven.com" target="_blank" rel="noreferrer" className="rounded-2xl border border-white/15 px-6 py-3 text-center text-sm font-black text-white transition hover:bg-white hover:text-black">
            Request Google Recrawl ↗
          </a>
        </div>
        <p className="mt-3 text-xs text-white/40">Current target: {absoluteUrl}. Google’s final Request Indexing action must still be completed inside Search Console.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {priorityUrls.map((path) => (
          <button key={path} onClick={() => void inspect(path)} className="rounded-2xl border border-white/10 bg-black/20 p-4 text-left transition hover:border-rose-400/40 hover:bg-white/[.04]">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-white/35">Priority URL</p>
            <p className="mt-2 truncate text-sm font-black text-white">{path}</p>
          </button>
        ))}
      </div>

      {error ? <div className="rounded-2xl border border-red-300/20 bg-red-500/10 p-4 text-sm text-red-100">{error}</div> : null}

      {result ? (
        <div className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
          <div className="rounded-3xl border border-white/10 bg-black/25 p-5 md:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusClass(result.ok)}`}>HTTP {result.status}</span>
              <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusClass(result.indexable)}`}>{result.indexable ? "Indexable" : "Not indexable"}</span>
              <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusClass(result.inSitemap)}`}>{result.inSitemap ? "In sitemap" : "Not in sitemap"}</span>
              <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusClass(result.hasJsonLd)}`}>{result.hasJsonLd ? "Schema found" : "No JSON-LD"}</span>
            </div>
            <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
              <div><dt className="text-white/40">URL</dt><dd className="mt-1 break-all font-bold text-white">{result.url}</dd></div>
              <div><dt className="text-white/40">Canonical</dt><dd className="mt-1 break-all font-bold text-white">{result.canonical || "Missing"}</dd></div>
              <div><dt className="text-white/40">Title</dt><dd className="mt-1 font-bold text-white">{result.title || "Missing"}</dd></div>
              <div><dt className="text-white/40">Robots</dt><dd className="mt-1 font-bold text-white">{result.robots || "Default indexable"}</dd></div>
              <div className="sm:col-span-2"><dt className="text-white/40">Description</dt><dd className="mt-1 text-white/75">{result.description || "Missing"}</dd></div>
            </dl>
          </div>
          <div className="rounded-3xl border border-white/10 bg-black/25 p-5 md:p-6">
            <h3 className="text-lg font-black">Action queue</h3>
            {result.issues.length ? (
              <ul className="mt-4 space-y-2">{result.issues.map((issue) => <li key={issue} className="rounded-2xl border border-amber-300/15 bg-amber-500/10 p-3 text-sm text-amber-100">{issue}</li>)}</ul>
            ) : (
              <div className="mt-4 rounded-2xl border border-emerald-300/15 bg-emerald-500/10 p-4 text-sm text-emerald-100">No blocking SEO issues detected. If Google has an older version, request recrawl in Search Console.</div>
            )}
            <p className="mt-4 text-xs text-white/35">Checked {new Date(result.checkedAt).toLocaleString()}</p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
        <div className="rounded-3xl border border-white/10 bg-black/25 p-5 md:p-6">
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-xs font-black uppercase tracking-[0.18em] text-rose-300">Persistent findings</p><h3 className="mt-1 text-xl font-black">Open SEO Issues</h3></div>
            <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-black text-white/60">{openIssues.length} open</span>
          </div>
          {dataLoading ? <p className="mt-4 text-sm text-white/45">Loading SEO operations data…</p> : openIssues.length ? (
            <div className="mt-4 space-y-2">
              {openIssues.slice(0, 12).map((issue) => (
                <article key={issue.id} className={`rounded-2xl border p-4 ${severityClass(issue.severity)}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2"><h4 className="font-black">{issue.title}</h4><span className="text-[10px] font-black uppercase tracking-[0.16em]">{issue.severity}</span></div>
                  <p className="mt-1 text-xs opacity-70">{issue.affected_route || "Platform SEO"}</p>
                  {issue.description ? <p className="mt-2 text-sm opacity-80">{issue.description}</p> : null}
                  {issue.recommended_fix ? <p className="mt-2 text-xs opacity-70">Fix: {issue.recommended_fix}</p> : null}
                </article>
              ))}
            </div>
          ) : <div className="mt-4 rounded-2xl border border-emerald-300/15 bg-emerald-500/10 p-4 text-sm text-emerald-100">No open persisted SEO issues.</div>}
        </div>

        <div className="rounded-3xl border border-white/10 bg-black/25 p-5 md:p-6">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-rose-300">Audit trail</p>
          <h3 className="mt-1 text-xl font-black">Recent Runs</h3>
          <div className="mt-4 space-y-2">
            {runs.slice(0, 8).map((run) => (
              <div key={run.id} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <div className="flex items-center justify-between gap-3"><span className="text-sm font-black text-white">{run.score == null ? run.status : `${run.score}/100`}</span><span className="text-xs text-white/40">{new Date(run.created_at).toLocaleDateString()}</span></div>
                <p className="mt-1 text-xs text-white/45">{run.pages_scanned || 0} pages · {run.issues_found || 0} issues · {run.status}</p>
              </div>
            ))}
            {!dataLoading && !runs.length ? <p className="text-sm text-white/45">No audit runs yet. Run the first live SEO audit.</p> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
