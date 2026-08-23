"use client";

import { useMemo, useState } from "react";

type AssetPermission = {
  id?: string | null;
  url: string;
  allowed: boolean;
  rightsStatus?: string | null;
};

export default function LocationMediaPermissions({
  locationId,
  initialAssets,
}: {
  locationId: string;
  initialAssets: AssetPermission[];
}) {
  const [assets, setAssets] = useState(initialAssets);
  const [busyUrl, setBusyUrl] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const approvedCount = useMemo(() => assets.filter((asset) => asset.allowed).length, [assets]);

  async function updatePermission(asset: AssetPermission, allow: boolean) {
    setBusyUrl(asset.url);
    setMessage("");
    try {
      const response = await fetch("/api/business/marketing/media-permissions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locationId, assetUrl: asset.url, allow }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not update media permission.");
      setAssets((current) => current.map((item) => item.url === asset.url ? { ...item, id: payload.asset?.id || item.id, allowed: allow, rightsStatus: payload.asset?.rights_status || item.rightsStatus } : item));
      setMessage(allow ? "Permission granted. This asset can now be selected for TheOutHaven organic social features." : "Permission revoked. TheOutHaven will not select this asset for new social features.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update media permission.");
    } finally {
      setBusyUrl(null);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-white/40">TheOutHaven feature permission</p>
            <h2 className="mt-2 text-2xl font-black text-white">Choose which media TheOutHaven may feature</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">Grant permission only for photos or videos you own or have authority to license. This permission lets TheOutHaven use the selected asset in organic recommendations and organic social posts. Revoking permission prevents new use; previously published posts may remain live unless separately removed.</p>
          </div>
          <div className="rounded-2xl border border-emerald-300/20 bg-emerald-500/10 px-4 py-3 text-center"><div className="text-2xl font-black text-emerald-100">{approvedCount}</div><div className="text-[10px] font-black uppercase tracking-wide text-emerald-200/70">Approved assets</div></div>
        </div>
      </section>

      {message ? <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4 text-sm font-semibold text-white/75">{message}</div> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {assets.map((asset) => (
          <article key={asset.url} className="overflow-hidden rounded-3xl border border-white/10 bg-black/25">
            <div className="aspect-[4/3] bg-black/40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={asset.url} alt="Location media" className="h-full w-full object-cover" />
            </div>
            <div className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-3"><span className={`rounded-full px-2.5 py-1 text-xs font-black ${asset.allowed ? "bg-emerald-500/15 text-emerald-200" : "bg-white/[0.06] text-white/50"}`}>{asset.allowed ? "Feature allowed" : "Not shared"}</span><span className="text-[10px] uppercase text-white/35">{asset.rightsStatus?.replaceAll("_", " ") || "location media"}</span></div>
              <button type="button" disabled={busyUrl === asset.url} onClick={() => updatePermission(asset, !asset.allowed)} className={`min-h-11 w-full rounded-2xl px-4 py-2.5 text-sm font-black transition disabled:opacity-50 ${asset.allowed ? "border border-white/15 bg-white/[0.04] text-white" : "bg-[#ff2142] text-white"}`}>{busyUrl === asset.url ? "Saving…" : asset.allowed ? "Revoke permission" : "Allow TheOutHaven to feature"}</button>
            </div>
          </article>
        ))}
      </section>

      {!assets.length ? <div className="rounded-3xl border border-dashed border-white/15 p-8 text-center text-sm text-white/55">Add photos to your location profile first. They will appear here for optional feature permission.</div> : null}
    </div>
  );
}
