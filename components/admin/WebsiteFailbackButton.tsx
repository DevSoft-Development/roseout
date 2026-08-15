"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  websiteId: string;
  host: string;
  targetNodeName?: string | null;
};

export function WebsiteFailbackButton({ websiteId, host, targetNodeName }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function failBack() {
    const confirmed = window.confirm(
      `Fail ${host} back to ${targetNodeName || "the primary node"}? The system will verify node health, heartbeat freshness, and the exact published version before switching DNS.`,
    );
    if (!confirmed) return;

    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/website-hosting/failback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ websiteId }),
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string; state?: string; node?: string } | null;
      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || "failback_failed");
      }
      setMessage(`Failback complete${result.node ? ` · ${result.node}` : ""}`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "failback_failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-w-[150px]">
      <button
        type="button"
        onClick={failBack}
        disabled={busy}
        className="rounded-xl border border-emerald-300/30 bg-emerald-400/10 px-3 py-2 text-xs font-black text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Failing back…" : "Fail Back to Primary"}
      </button>
      {message ? <p className="mt-2 max-w-[220px] text-[11px] font-semibold text-white/50">{message}</p> : null}
    </div>
  );
}
