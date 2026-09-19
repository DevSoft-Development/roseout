"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Globe2, RefreshCw, Search, Trash2 } from "lucide-react";
import {
  AdminActionButton,
  AdminEmptyState,
  AdminSearchInput,
  AdminSectionCard,
  AdminStatusBadge,
} from "../../../../../components/admin/AdminDesignSystem";

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

function statusTone(status?: string | null): "green" | "amber" | "red" | "blue" | "muted" {
  const value = String(status || "").toLowerCase();
  if (["live", "published", "active", "success", "succeeded"].includes(value)) return "green";
  if (["failed", "error", "unhealthy"].includes(value)) return "red";
  if (["deploying", "pending", "draft", "queued"].includes(value)) return "amber";
  if (["building", "running"].includes(value)) return "blue";
  return "muted";
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "Never";
}

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
      [
        row.location_name,
        row.site_title,
        row.domain,
        row.platform_domain,
        row.location_id,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [query, websites]);

  const liveCount = websites.filter((row) =>
    ["live", "published", "active"].includes(
      String(row.last_publish_status || row.status || "").toLowerCase(),
    ),
  ).length;

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
      {message ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-100">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4 text-sm font-bold text-rose-100">
          {error}
        </div>
      ) : null}

      <AdminSectionCard>
        <div className="flex flex-col gap-4 border-b border-white/10 px-5 py-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-rose-200">Website inventory</p>
            <h2 className="mt-2 text-xl font-black text-white">
              {websites.length} generated website{websites.length === 1 ? "" : "s"}
            </h2>
            <p className="mt-1 text-sm text-white/50">
              {liveCount} live or published · search by location, domain, or ID
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            <div className="min-w-0 sm:w-80">
              <AdminSearchInput
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search location, domain, or ID"
                aria-label="Search generated websites"
              />
            </div>
            <button
              type="button"
              onClick={() => void loadWebsites()}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-black text-white/70 hover:border-white/20 hover:text-white"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <div className="grid gap-3 p-5">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-28 animate-pulse rounded-2xl border border-white/10 bg-white/[0.025]" />
            ))}
          </div>
        ) : filtered.length ? (
          <div className="divide-y divide-white/10">
            {filtered.map((row) => {
              const host = row.domain || row.platform_domain || "Domain pending";
              const state = row.last_publish_status || row.status || "draft";

              return (
                <article
                  key={row.id}
                  className="grid gap-4 px-5 py-4 transition hover:bg-white/[0.025] xl:grid-cols-[minmax(0,1.7fr)_180px_150px_180px_auto] xl:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-rose-100">
                        <Globe2 className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <h3 className="truncate font-black text-white">{row.location_name}</h3>
                        <p className="truncate text-sm text-white/50">{host}</p>
                        <p className="mt-1 truncate text-xs text-white/30">Location ID: {row.location_id}</p>
                      </div>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35">Website state</p>
                    <div className="mt-2">
                      <AdminStatusBadge tone={statusTone(state)}>{state}</AdminStatusBadge>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35">Version</p>
                    <p className="mt-2 text-sm font-black text-white/75">
                      {row.published_version ? `v${row.published_version}` : "Not published"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35">Last published</p>
                    <p className="mt-2 text-xs font-bold text-white/55">{formatDate(row.published_at)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(row);
                      setConfirmation("");
                      setMessage("");
                      setError("");
                    }}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 text-xs font-black text-rose-100 hover:bg-rose-500/15"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete website
                  </button>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="p-5">
            <AdminEmptyState
              title="No generated websites match this search"
              body="Try a broader location name, domain, or location ID."
              action={
                query ? (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-black text-white/70"
                  >
                    <Search className="h-4 w-4" />
                    Clear search
                  </button>
                ) : undefined
              }
            />
          </div>
        )}
      </AdminSectionCard>

      {selected ? (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-labelledby="website-reset-title">
          <div className="w-full max-w-xl rounded-3xl border border-rose-400/20 bg-[#101012] p-5 shadow-2xl shadow-black/50">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-rose-400/20 bg-rose-500/10 text-rose-100">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-rose-200">Permanent website reset</p>
                <h3 id="website-reset-title" className="mt-1 text-2xl font-black text-white">
                  Delete {selected.location_name}&apos;s website?
                </h3>
                <p className="mt-2 text-sm leading-6 text-white/55">
                  This removes only this location&apos;s generated website record and publish-version history.
                  The location and any registered domain stay intact.
                </p>
              </div>
            </div>

            <label className="mt-5 block text-xs font-black uppercase tracking-[0.14em] text-white/45">
              Type DELETE to confirm
            </label>
            <input
              autoFocus
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm font-bold text-white outline-none focus:border-rose-300/50"
            />

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="min-h-10 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-black text-white/70"
                onClick={() => {
                  setSelected(null);
                  setConfirmation("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void deleteSelected()}
                disabled={deleting || confirmation !== "DELETE"}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#e1062a] px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" />
                {deleting ? "Deleting…" : "Delete this website"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
