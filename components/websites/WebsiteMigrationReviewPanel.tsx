"use client";

import { useEffect, useState } from "react";

type MigrationException = {
  key?: string;
  code: string;
  severity: "info" | "warning" | "blocking";
  title: string;
  detail: string;
  page_url?: string;
};

type ReviewPayload = {
  review_required?: boolean;
  review_status?: string | null;
  import?: {
    provider?: string | null;
    reservation_provider?: string | null;
    review_note?: string | null;
    exceptions?: MigrationException[];
    unresolved_exceptions?: MigrationException[];
    blocking_exception_count?: number;
    warning_exception_count?: number;
    resolutions?: Record<string, unknown>;
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

const PROVIDERS = ["Resy", "OpenTable", "SevenRooms", "Tock", "Toast Tables", "Yelp Reservations", "Quandoo", "External"];
const REDIRECT_TARGETS = ["/", "/about/", "/menu/", "/reservations/", "/events/", "/gallery/", "/reviews/", "/visit/", "/contact/"];

function exceptionKey(item: MigrationException) {
  return item.key || (item.page_url ? `${item.code}:${item.page_url}` : item.code);
}

function actionLabel(code: string) {
  if (code === "missing_images") return "I’ll add business photos";
  if (code === "forms_need_review") return "Mark form reviewed";
  if (code === "menu_pdf_only") return "Keep PDF menu for now";
  if (code === "canonical_host_mismatch") return "Confirm current domain";
  if (code === "external_assets") return "Mark assets reviewed";
  return "Mark reviewed";
}

export function WebsiteMigrationReviewPanel({ locationId }: { locationId: string }) {
  const [data, setData] = useState<ReviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [provider, setProvider] = useState("External");
  const [redirectTargets, setRedirectTargets] = useState<Record<string, string>>({});

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
    if (payload?.import?.reservation_provider) setProvider(payload.import.reservation_provider);
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

  async function resolve(item: MigrationException, action: string, value?: string) {
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/business/website/migration-review/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ location_id: locationId, key: exceptionKey(item), action, value: value || "" }),
    });
    const payload = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setMessage(payload?.error || "Unable to save this migration item.");
      return;
    }
    setMessage("Migration item saved.");
    await load();
  }

  if (loading) return <section className="mb-5 rounded-3xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/55">Loading migration review…</section>;
  if (!data?.review_required || !data.import) return null;

  const manifest = data.import.migration_manifest || {};
  const redirects = manifest.redirect_map || [];
  const inventory = data.import.content_inventory || {};
  const exceptions = data.import.unresolved_exceptions || data.import.exceptions || [];
  const blockingCount = data.import.blocking_exception_count || exceptions.filter((item) => item.severity === "blocking").length;
  const warningCount = data.import.warning_exception_count || exceptions.filter((item) => item.severity === "warning").length;
  const status = data.review_status || "pending";

  return <section className="mb-5 rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ff2142]">Move existing website</p>
        <h2 className="mt-2 text-xl font-black">Review and resolve anything that needs attention</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">Confirm imported pages, booking, assets, forms, downloads, and old URL redirects. You can resolve most items here before approving the move.</p>
      </div>
      <span className={`rounded-full px-3 py-2 text-xs font-black ${status === "approved" ? "bg-emerald-500/15 text-emerald-100" : status === "needs_changes" ? "bg-amber-500/15 text-amber-100" : "bg-white/10 text-white/60"}`}>{status === "approved" ? "Approved" : status === "needs_changes" ? "Changes needed" : "Review required"}</span>
    </div>

    <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
      <Metric label="Platform" value={data.import.provider || "Detected website"} />
      <Metric label="Pages" value={String(manifest.page_count || 0)} />
      <Metric label="Assets" value={String(manifest.asset_count || 0)} />
      <Metric label="Forms" value={String(manifest.form_count || 0)} />
      <Metric label="Warnings" value={String(warningCount)} />
      <Metric label="Reservations" value={data.import.reservation_provider || "Not detected"} />
    </div>

    {exceptions.length ? <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-black uppercase tracking-[0.14em] text-white/40">Items to review</p>{blockingCount ? <span className="rounded-full bg-rose-500/15 px-3 py-1 text-xs font-black text-rose-100">{blockingCount} blocking</span> : null}</div>
      <div className="mt-3 space-y-2">{exceptions.map((item, index) => {
        const key = exceptionKey(item);
        return <article key={`${key}-${index}`} className={`rounded-xl border px-4 py-3 ${item.severity === "blocking" ? "border-rose-300/25 bg-rose-500/10" : item.severity === "warning" ? "border-amber-300/20 bg-amber-500/10" : "border-white/10 bg-white/[0.03]"}`}>
          <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-black">{item.title}</p><span className="text-[10px] font-black uppercase tracking-[0.12em] text-white/40">{item.severity}</span></div>
          <p className="mt-1 text-xs leading-5 text-white/60">{item.detail}</p>
          {item.severity === "blocking" ? <p className="mt-3 text-xs font-bold text-rose-100">Fix the source website or re-run the import after correcting this item.</p> : item.code === "reservation_provider_unknown" ? <div className="mt-3 flex flex-wrap gap-2"><select value={provider} onChange={(event) => setProvider(event.target.value)} className="rounded-xl border border-white/10 bg-black px-3 py-2 text-xs text-white">{PROVIDERS.map((itemProvider) => <option key={itemProvider}>{itemProvider}</option>)}</select><button type="button" disabled={saving} onClick={() => void resolve(item, "provider_confirmed", provider)} className="rounded-xl bg-white px-4 py-2 text-xs font-black text-black disabled:opacity-50">Confirm provider</button></div> : item.code === "redirect_needs_review" ? <div className="mt-3 flex flex-wrap gap-2"><select value={redirectTargets[key] || "/"} onChange={(event) => setRedirectTargets((current) => ({ ...current, [key]: event.target.value }))} className="rounded-xl border border-white/10 bg-black px-3 py-2 text-xs text-white">{REDIRECT_TARGETS.map((target) => <option key={target} value={target}>{target}</option>)}</select><button type="button" disabled={saving} onClick={() => void resolve(item, "redirect_confirmed", redirectTargets[key] || "/")} className="rounded-xl bg-white px-4 py-2 text-xs font-black text-black disabled:opacity-50">Save redirect</button></div> : <button type="button" disabled={saving} onClick={() => void resolve(item, item.code === "menu_pdf_only" ? "keep_pdf" : item.code === "forms_need_review" ? "form_reviewed" : "acknowledge")} className="mt-3 rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2 text-xs font-black text-white disabled:opacity-50">{actionLabel(item.code)}</button>}
        </article>;
      })}</div>
    </div> : <div className="mt-4 rounded-2xl border border-emerald-300/15 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-100">All migration items are resolved.</div>}

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
      <button type="button" disabled={saving || blockingCount > 0} onClick={() => void decide("approved")} className="rounded-xl bg-emerald-400 px-5 py-3 text-sm font-black text-emerald-950 disabled:cursor-not-allowed disabled:opacity-40">{blockingCount ? "Resolve blocking items first" : "Approve website move"}</button>
      <button type="button" disabled={saving} onClick={() => void decide("needs_changes")} className="rounded-xl border border-amber-300/30 bg-amber-400/10 px-5 py-3 text-sm font-black text-amber-100 disabled:opacity-50">Needs changes</button>
    </div>
    {message ? <p className="mt-3 text-sm font-bold text-white/65">{message}</p> : null}
  </section>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-[11px] font-black uppercase tracking-[0.14em] text-white/35">{label}</p><p className="mt-2 text-sm font-black">{value}</p></div>;
}
