"use client";

import { useEffect, useState } from "react";

type VersionRow = { id: string; version: number; source: string; created_at: string; published_at: string | null };

export function WebsiteVersionHistory({ locationId }: { locationId: string }) {
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [publishedVersion, setPublishedVersion] = useState<number | null>(null);
  const [busyVersion, setBusyVersion] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  async function load() {
    const response = await fetch(`/api/business/website/versions?location_id=${encodeURIComponent(locationId)}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setMessage(data?.error || "Unable to load version history.");
    setVersions(data.versions || []);
    setPublishedVersion(typeof data.published_version === "number" ? data.published_version : null);
  }

  useEffect(() => { void load(); }, [locationId]);

  async function restore(version: number) {
    if (!window.confirm(`Restore version ${version}? This creates a new editable version and does not immediately replace the live site.`)) return;
    setBusyVersion(version); setMessage("");
    const response = await fetch("/api/business/website/versions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ location_id: locationId, version }),
    });
    const data = await response.json().catch(() => ({}));
    setBusyVersion(null);
    if (!response.ok) return setMessage(data?.error || "Unable to restore that version.");
    setMessage(`Version ${version} restored as new version ${data.version}. Review it before publishing.`);
    await load();
  }

  return <section className="rounded-3xl border border-white/10 bg-black/25 p-5">
    <div className="flex items-center justify-between gap-4"><div><h3 className="text-lg font-black">Version history</h3><p className="mt-1 text-sm text-white/50">Restoring a version creates a new draft state. The live site stays unchanged until you publish.</p></div>{publishedVersion ? <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-black text-emerald-200">Live v{publishedVersion}</span> : null}</div>
    <div className="mt-4 space-y-2">{versions.length ? versions.map((item) => <div key={item.id} className="flex flex-col gap-3 rounded-2xl border border-white/10 px-4 py-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="text-sm font-black">Version {item.version}{item.version === publishedVersion ? " · Live" : ""}</p><p className="mt-1 text-xs text-white/45">{item.source || "manual"} · {new Date(item.created_at).toLocaleString()}</p></div><button type="button" onClick={() => restore(item.version)} disabled={busyVersion !== null || item.version === publishedVersion} className="rounded-full border border-white/15 px-4 py-2 text-xs font-black disabled:opacity-30">{busyVersion === item.version ? "Restoring..." : item.version === publishedVersion ? "Currently live" : "Restore"}</button></div>) : <p className="text-sm text-white/45">No saved versions yet.</p>}</div>
    {message ? <p className="mt-4 text-sm font-bold text-white/65">{message}</p> : null}
  </section>;
}
