"use client";

import { useState } from "react";

type CutoverCheck = { key: string; label: string; ok: boolean; detail: string };
type CutoverResult = { ready: boolean; domain?: string | null; redirect_count?: number; checks: CutoverCheck[]; blocking?: string[] };

export function WebsiteCutoverReadinessPanel({ locationId, hasCustomDomain }: { locationId: string; hasCustomDomain: boolean }) {
  const [result, setResult] = useState<CutoverResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function runCheck() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/business/website/cutover-readiness?location_id=${encodeURIComponent(locationId)}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(data?.error || "We could not check domain readiness.");
        return;
      }
      setResult(data);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mb-5 rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ff2142]">Domain cutover</p>
          <h2 className="mt-2 text-xl font-black">Know when your custom domain is safe to switch</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">Checks publishing, DNS, SSL, apex and www reachability, sitemap, robots.txt, last publish health, and imported-page redirect planning before you send customers to the new website.</p>
        </div>
        <button type="button" onClick={() => void runCheck()} disabled={loading || !hasCustomDomain} className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-xs font-black text-white disabled:opacity-40">
          {loading ? "Checking…" : "Check cutover readiness"}
        </button>
      </div>

      {!hasCustomDomain ? <p className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/55">Select a custom domain above to run cutover checks. The included TheOutHaven subdomain does not require a customer-domain cutover.</p> : null}
      {message ? <p className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-500/10 px-4 py-3 text-sm font-bold text-rose-100">{message}</p> : null}

      {result ? <div className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 p-4">
          <div><p className="text-sm font-black">{result.domain || "Custom domain"}</p><p className="mt-1 text-xs text-white/45">{result.redirect_count ? `${result.redirect_count} imported source paths mapped for migration` : "No imported redirect plan required"}</p></div>
          <span className={`rounded-full px-3 py-2 text-xs font-black ${result.ready ? "bg-emerald-500/10 text-emerald-200" : "bg-amber-500/10 text-amber-100"}`}>{result.ready ? "Ready for cutover" : "Not ready yet"}</span>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{result.checks.map((check) => <div key={check.key} className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-sm font-black">{check.ok ? "✓" : "!"} {check.label}</p><p className="mt-1 text-xs text-white/45">{check.detail}</p></div>)}</div>
      </div> : null}
    </section>
  );
}
