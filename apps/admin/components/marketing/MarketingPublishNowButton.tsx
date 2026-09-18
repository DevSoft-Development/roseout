"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function MarketingPublishNowButton({ contentId }: { contentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function publish() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/marketing/content/${contentId}/publish-now`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Publish Now failed.");
      const failed = Array.isArray(body.results) ? body.results.filter((row: { ok?: boolean }) => !row.ok).length : 0;
      setMessage(failed ? `Publishing started, but ${failed} platform job(s) need attention.` : "Publishing started successfully.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Publish Now failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" disabled={busy} onClick={() => void publish()} className="min-h-11 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
        {busy ? "Publishing…" : "Publish Now"}
      </button>
      {message ? <div className="mt-2 max-w-sm text-xs font-medium text-neutral-700">{message}</div> : null}
    </div>
  );
}
