"use client";

import { useMemo, useState } from "react";

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

function statusClass(good: boolean) {
  return good
    ? "border-emerald-300/20 bg-emerald-500/10 text-emerald-100"
    : "border-amber-300/20 bg-amber-500/10 text-amber-100";
}

export default function SeoOperationsClient({ priorityUrls }: { priorityUrls: string[] }) {
  const [url, setUrl] = useState("/about");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Inspection | null>(null);
  const [error, setError] = useState<string | null>(null);

  const absoluteUrl = useMemo(() => {
    const value = url.trim();
    if (!value) return "https://theouthaven.com/";
    if (value.startsWith("http://") || value.startsWith("https://")) return value;
    return `https://theouthaven.com${value.startsWith("/") ? value : `/${value}`}`;
  }, [url]);

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

  return (
    <section className="space-y-4">
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
          <button
            onClick={() => void inspect()}
            disabled={loading}
            className="rounded-2xl bg-[#e1062a] px-6 py-3 text-sm font-black text-white transition hover:bg-red-500 disabled:opacity-50"
          >
            {loading ? "Inspecting…" : "Run Live Inspection"}
          </button>
          <a
            href="https://search.google.com/search-console?resource_id=sc-domain%3Atheouthaven.com"
            target="_blank"
            rel="noreferrer"
            className="rounded-2xl border border-white/15 px-6 py-3 text-center text-sm font-black text-white transition hover:bg-white hover:text-black"
          >
            Request Google Recrawl ↗
          </a>
        </div>
        <p className="mt-3 text-xs text-white/40">Current target: {absoluteUrl}. Google’s final Request Indexing action must still be completed inside Search Console.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {priorityUrls.map((path) => (
          <button
            key={path}
            onClick={() => void inspect(path)}
            className="rounded-2xl border border-white/10 bg-black/20 p-4 text-left transition hover:border-rose-400/40 hover:bg-white/[.04]"
          >
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
              <ul className="mt-4 space-y-2">
                {result.issues.map((issue) => <li key={issue} className="rounded-2xl border border-amber-300/15 bg-amber-500/10 p-3 text-sm text-amber-100">{issue}</li>)}
              </ul>
            ) : (
              <div className="mt-4 rounded-2xl border border-emerald-300/15 bg-emerald-500/10 p-4 text-sm text-emerald-100">No blocking SEO issues detected. If Google has an older version, request recrawl in Search Console.</div>
            )}
            <p className="mt-4 text-xs text-white/35">Checked {new Date(result.checkedAt).toLocaleString()}</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
