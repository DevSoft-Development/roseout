"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function providerLabel(provider: string) {
  if (provider === "instagram") return "Instagram";
  if (provider === "facebook") return "Facebook";
  if (provider === "tiktok") return "TikTok";
  if (provider === "youtube") return "YouTube";
  return provider;
}

export default function SocialConnectionActions({ provider, connectionId, configured, connected }: { provider: string; connectionId?: string | null; configured: boolean; connected: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const network = providerLabel(provider);
  const label = connected ? `Reconnect ${network}` : `Connect ${network}`;

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
      {configured ? (
        <a href={`/api/admin/marketing/social/oauth/${provider}`} className="min-h-11 rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-5 py-2.5 text-sm font-black text-white shadow-lg shadow-rose-950/30 transition hover:scale-[1.02]">
          {label}
        </a>
      ) : (
        <span className="min-h-11 rounded-full border border-white/10 bg-white/[0.05] px-5 py-2.5 text-sm font-bold text-white/35">{network} credentials required</span>
      )}
      {connected && connectionId ? (
        <button type="button" disabled={busy} onClick={() => void disconnect()} className="min-h-11 rounded-full border border-white/10 bg-white/[0.05] px-5 py-2.5 text-sm font-bold text-white/65 transition hover:border-red-400/30 hover:bg-red-400/10 hover:text-red-200 disabled:opacity-50">
          {busy ? `Disconnecting ${network}…` : `Disconnect ${network}`}
        </button>
      ) : null}
    </div>
  );
}
