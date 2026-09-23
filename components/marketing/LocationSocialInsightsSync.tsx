"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

export default function LocationSocialInsightsSync({
  locationId,
  connectedCount,
}: {
  locationId: string;
  connectedCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function sync() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/locations/social/metrics/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locationId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not sync social insights.");
      const successful = Array.isArray(body.results)
        ? body.results.filter((item: { ok?: boolean }) => item.ok).length
        : 0;
      setMessage(`Synced ${successful} of ${body.connections || connectedCount} connected channels.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not sync social insights.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={sync}
        disabled={busy || connectedCount === 0}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-4 text-sm font-black text-white transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-35"
      >
        <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
        {busy ? "Syncing insights…" : "Sync all insights"}
      </button>
      {message ? <p role="status" className="text-xs font-bold text-white/50">{message}</p> : null}
    </div>
  );
}
