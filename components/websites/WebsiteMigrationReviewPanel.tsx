"use client";

import { useEffect, useState } from "react";

type ReviewPayload = {
  review_required?: boolean;
  review_status?: string | null;
  import?: {
    provider?: string | null;
    reservation_provider?: string | null;
    review_note?: string | null;
    content_inventory?: Record<string, string[] | undefined>;
    migration_manifest?: {
      page_count?: number;
      asset_count?: number;
      form_count?: number;
      redirect_map?: Array<{ from: string; to: string }>;
      downloads?: string[];
      social_links?: string[];
      schema_types?: string[];
    };
  } | null;
};

export function WebsiteMigrationReviewPanel({ locationId }: { locationId: string }) {
  const [data, setData] = useState<ReviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    const response = await fetch(`/api/business/website/migration-review?location_id=${encodeURIComponent(locationId)}`, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) {
      setMessage(payload?.error || "Unable to load migration review.");
      return;
    }
    setData(payload);
    setNote(payload?.import?.review_note || "");
  }

  useEffect(() => { void load(); }, [locationId]);

  async function decide(decision: "approved" | "needs_changes") {
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/business/website/migration-review", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ location_id: locationId, decision, note }),
    });
    const payload = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setMessage(payload?.error || "Unable to save migration review.");
      return;
    }
    setMessage(decision === "approved" ? "Migration review approved. Publishing can continue." : "Marked for changes. Publishing will remain blocked until approved.");
    await load();
  }

  if (loading) return <section className="mb-5 rounded-3xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/55">Loading migration review…</section>;
  if (!data?.review_required || !data.import) return null;

  const manifest = data.import.migration_manifest || {};
  const redirects = manifest.redirect_map || [];
  const inventory = data.import.content_inventory || {};
  const status = data.review_status || "pending";

  return <section className="mb-5 rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ff2142]">Migration review</p>
        <h2 className="mt-2 text-xl font-black">Review what will move before publishing</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">Confirm the imported pages, booking provider, downloads, and old URL redirects. An imported website cannot publish until this review is approved.</p>
      </div>
      <span className={`rounded-full px-3 py-2 text-xs font-black ${status === "approved" ? "bg-emerald-500/15 text-emerald-100" : status === "needs_changes" ? "bg-amber-500/15 text-amber-100" : "bg-white/10 text-white/60"}`}>{status === "approved" ? "Approved" : status === "needs_changes" ? "Changes needed" : "Review required"}</span>
    </div>

    <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
      <Metric label="Platform" value={data.import.provider || "Detected website"} />
      <Metric label="Pages" value={String(manifest.page_count || 0)} />
      <Metric label="Assets" value={String(manifest.asset_count || 0)} />
      <Metric label="Forms" value={String(manifest.form_count || 0)} />
      <Metric label="Reservations" value={data.import.reservation_provider || "Not detected"} />
    </div>

    <div className="mt-4 grid gap-3 lg:grid-cols-2">
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-white/40">Content detected</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-white/70">
          <span>Menu pages: {inventory.menu_pages?.length || 0}</span><span>Event pages: {inventory.event_pages?.length || 0}</span>
          <span>About pages: {inventory.about_pages?.length || 0}</span><span>Private events: {inventory.private_event_pages?.length || 0}</span>
          <span>FAQ pages: {inventory.faq_pages?.length || 0}</span><span>Contact pages: {inventory.contact_pages?.length || 0}</span>
          <span>Downloads: {manifest.downloads?.length || 0}</span><span>Social links: {manifest.social_links?.length || 0}</span>
        </div>
      </div>
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-white/40">Old URL redirects</p>
        <div className="mt-3 max-h-48 space-y-2 overflow-auto text-xs text-white/65">{redirects.length ? redirects.slice(0, 20).map((item) => <div key={`${item.from}-${item.to}`} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 px-3 py-2"><span className="truncate">{item.from}</span><span>→</span><span className="truncate text-white">{item.to}</span></div>) : <p>No legacy redirects are required.</p>}</div>
      </div>
    </div>

    <label className="mt-4 block text-sm font-black">Review note <span className="font-normal text-white/40">(optional)</span></label>
    <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} rows={3} className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none focus:border-[#ff2142]/50" placeholder="Anything that needs attention before publishing…" />
    <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" disabled={saving} onClick={() => void decide("approved")} className="rounded-xl bg-emerald-400 px-5 py-3 text-sm font-black text-emerald-950 disabled:opacity-50">Approve migration</button>
      <button type="button" disabled={saving} onClick={() => void decide("needs_changes")} className="rounded-xl border border-amber-300/30 bg-amber-400/10 px-5 py-3 text-sm font-black text-amber-100 disabled:opacity-50">Needs changes</button>
    </div>
    {message ? <p className="mt-3 text-sm font-bold text-white/65">{message}</p> : null}
  </section>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-[11px] font-black uppercase tracking-[0.14em] text-white/35">{label}</p><p className="mt-2 text-sm font-black">{value}</p></div>;
}
