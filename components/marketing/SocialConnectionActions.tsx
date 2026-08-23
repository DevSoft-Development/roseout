"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SocialConnectionActions({ provider, connectionId, configured, connected }: { provider: string; connectionId?: string | null; configured: boolean; connected: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const label = connected ? "Reconnect" : "Connect";

  async function disconnect() {
    if (!connectionId) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/marketing/social/connections/${connectionId}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not disconnect account.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5 flex flex-wrap gap-2">
      {configured ? <a href={`/api/admin/marketing/social/oauth/${provider}`} className="min-h-11 rounded-xl bg-neutral-950 px-4 py-2.5 text-sm font-semibold text-white">{label}</a> : <span className="min-h-11 rounded-xl bg-neutral-100 px-4 py-2.5 text-sm font-semibold text-neutral-500">Credentials required</span>}
      {connected && connectionId ? <button type="button" disabled={busy} onClick={() => void disconnect()} className="min-h-11 rounded-xl border px-4 py-2.5 text-sm font-semibold disabled:opacity-50">{busy ? "Disconnecting…" : "Disconnect"}</button> : null}
    </div>
  );
}
