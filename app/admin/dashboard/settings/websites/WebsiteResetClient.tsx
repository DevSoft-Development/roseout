"use client";

import { useEffect, useMemo, useState } from "react";

type WebsiteRow = {
  id: string;
  location_id: string;
  location_name: string;
  site_title: string | null;
  domain: string | null;
  platform_domain: string | null;
  status: string | null;
  deployment_status: string | null;
  last_publish_status: string | null;
  published_version: number | null;
  published_at: string | null;
};

export default function WebsiteResetClient() {
  const [websites, setWebsites] = useState<WebsiteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<WebsiteRow | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadWebsites() {
    setLoading(true);
    setError("");
    const response = await fetch("/api/admin/websites", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) {
      setError(data?.error || "Unable to load generated websites.");
      return;
    }
    setWebsites(Array.isArray(data.websites) ? data.websites : []);
  }

  useEffect(() => {
    void loadWebsites();
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return websites;
    return websites.filter((row) =>
      [row.location_name, row.site_title, row.domain, row.platform_domain, row.location_id]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [query, websites]);

  async function deleteSelected() {
    if (!selected || confirmation !== "DELETE") return;
    setDeleting(true);
    setMessage("");
    setError("");
    const response = await fetch("/api/admin/websites", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        website_id: selected.id,
        location_id: selected.location_id,
        confirmation,
      }),
    });
    const data = await response.json().catch(() => ({}));
    setDeleting(false);
    if (!response.ok) {
      setError(data?.error || "Unable to delete this location website.");
      return;
    }
    setWebsites((current) => current.filter((row) => row.id !== selected.id));
    setMessage(data?.message || `${selected.location_name} website deleted.`);
    setSelected(null);
    setConfirmation("");
  }

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-amber-300/20 bg-amber-400/[0.07] p-5">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-200">Superadmin only</p>
        <h2 className="mt-2 text-xl font-black">Delete one location website at a time</h2>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-white/65">
          Use this to reset a generated website so you can test the creation flow again. This deletes the website builder record and its publish-version history for that location only. It does not delete the location, unregister a domain, or restore a used first-year domain benefit.
        </p>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-rose-200">Generated websites</p>
            <h2 className="mt-1 text-2xl font-black">{websites.length} location website{websites.length === 1 ? "" : "s"}</h2>
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search location, domain, or ID"
            className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none focus:border-rose-300/40 sm:max-w-sm"
          />
        </div>
      </section>

      {message ? <div className="rounded-2xl border border-emerald-300/20 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-100">{message}</div> : null}
      {error ? <div className="rounded-2xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-100">{error}</div> : null}

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#0d0b0a]">
        {loading ? <div className="p-8 text-sm font-bold text-white/50">Loading generated websites…</div> : filtered.length === 0 ? <div className="p-8 text-sm font-bold text-white/50">No generated websites match this search.</div> : <div className="divide-y divide-white/10">{filtered.map((row) => {
          const host = row.domain || row.platform_domain || "Not assigned yet";
          return <article key={row.id} className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_180px_160px_auto] lg:items-center">
            <div className="min-w-0">
              <p className="truncate text-lg font-black">{row.location_name}</p>
              <p className="mt-1 truncate text-sm text-[#f5b700]">{host}</p>
              <p className="mt-2 text-xs text-white/35">Location ID: {row.location_id}</p>
            </div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-white/35">Website status</p>
              <p className="mt-1 text-sm font-bold text-white/75">{row.last_publish_status || row.status || "draft"}</p>
            </div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-white/35">Version</p>
              <p className="mt-1 text-sm font-bold text-white/75">{row.published_version ? `v${row.published_version}` : "Not published"}</p>
            </div>
            <button
              type="button"
              onClick={() => { setSelected(row); setConfirmation(""); setMessage(""); setError(""); }}
              className="rounded-xl border border-red-300/25 bg-red-500/10 px-4 py-3 text-sm font-black text-red-100 transition hover:bg-red-500/20"
            >
              Delete website
            </button>
          </article>;
        })}</div>}
      </section>

      {selected ? <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-label="Confirm website deletion">
        <div className="w-full max-w-xl rounded-3xl border border-red-300/20 bg-[#120d0b] p-6 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-red-300">Permanent website reset</p>
          <h3 className="mt-2 text-2xl font-black">Delete {selected.location_name}&apos;s website?</h3>
          <p className="mt-3 text-sm leading-6 text-white/65">
            Only this location&apos;s generated website record and version history will be removed. The location itself and any registered domain stay intact. If this site was already published, its existing static copy may remain reachable until hosting cleanup or a future publish replaces it.
          </p>
          <label className="mt-5 block text-sm font-black">Type DELETE to confirm</label>
          <input
            autoFocus
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-black/30 px-4 font-black text-white outline-none focus:border-red-300/50"
          />
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => { setSelected(null); setConfirmation(""); }} className="rounded-xl border border-white/10 px-5 py-3 text-sm font-black">Cancel</button>
            <button type="button" onClick={deleteSelected} disabled={deleting || confirmation !== "DELETE"} className="rounded-xl bg-red-600 px-5 py-3 text-sm font-black text-white disabled:opacity-35">{deleting ? "Deleting…" : "Delete this website"}</button>
          </div>
        </div>
      </div> : null}
    </div>
  );
}
