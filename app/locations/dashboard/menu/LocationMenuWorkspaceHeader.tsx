"use client";

import { useState } from "react";

type Props = {
  locationId: string;
  status: string;
  previewUrl?: string | null;
  contextKey: "locationId" | "adminLocationId" | "demoLocationId";
  contextPayload: Record<string, unknown>;
};

export default function LocationMenuWorkspaceHeader({
  locationId,
  status,
  previewUrl,
  contextKey,
  contextPayload,
}: Props) {
  const [currentStatus, setCurrentStatus] = useState(status || "draft");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const published = currentStatus === "published";

  async function togglePublish() {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      const res = await fetch("/api/business/menu", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...contextPayload,
          [contextKey]: locationId,
          locationId,
          action: published ? "unpublish_page" : "publish_page",
          status: published ? "draft" : "published",
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice(json?.message || "Menu status could not be updated.");
        return;
      }
      const nextStatus = String(json?.data?.page?.status || (published ? "draft" : "published"));
      setCurrentStatus(nextStatus);
      setNotice(nextStatus === "published" ? "Your menu is now live." : "Your menu is now hidden from guests.");
    } catch {
      setNotice("Menu status could not be updated. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 sm:items-end">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => previewUrl && window.open(previewUrl, "_blank", "noopener,noreferrer")}
          disabled={!previewUrl}
          className="rounded-full border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-black text-white/80 transition hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Preview as guest
        </button>
        <button
          type="button"
          onClick={togglePublish}
          disabled={busy}
          className={`rounded-full px-5 py-2.5 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${published ? "border border-white/10 bg-white/[0.05] text-white/75 hover:bg-white/[0.09]" : "bg-[#f5b700] text-black hover:brightness-105"}`}
        >
          {busy ? "Saving..." : published ? "Hide menu" : "Publish menu"}
        </button>
      </div>
      <div className="flex items-center gap-2 text-xs font-bold text-white/55">
        <span className={`h-2 w-2 rounded-full ${published ? "bg-emerald-400" : "bg-amber-300"}`} />
        {published ? "Live to guests" : "Draft — only your team can see changes"}
      </div>
      {notice ? <p className="max-w-sm text-right text-xs font-bold text-white/60">{notice}</p> : null}
    </div>
  );
}
