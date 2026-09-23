"use client";

import { useState } from "react";
import { ExternalLink, RefreshCw, Unplug } from "lucide-react";

type Provider = "facebook" | "tiktok" | "youtube";

type Connection = {
  id: string;
  display_name: string | null;
  username: string | null;
  status: string;
  connected_at: string | null;
  token_expires_at: string | null;
  last_error: string | null;
};

const labels: Record<Provider, string> = {
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
};

const descriptions: Record<Provider, string> = {
  facebook: "Publish approved posts to this location's Facebook Page.",
  tiktok: "Publish approved video content with creator-controlled TikTok privacy settings.",
  youtube: "Publish approved video content to this location's YouTube channel.",
};

export default function LocationSocialChannelCard({
  provider,
  locationId,
  configured,
  connection,
}: {
  provider: Provider;
  locationId: string;
  configured: boolean;
  connection: Connection | null;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const connected = Boolean(connection && connection.status !== "disconnected");
  const returnTo = `/locations/dashboard/social-accounts?locationId=${encodeURIComponent(locationId)}`;
  const connectHref = `/api/locations/social/${provider}?locationId=${encodeURIComponent(locationId)}&returnTo=${encodeURIComponent(returnTo)}`;
  const account = connection?.username || connection?.display_name || "Connected account";

  async function disconnect() {
    if (!window.confirm(`Disconnect ${labels[provider]} from this location?`)) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/locations/social/${provider}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locationId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not disconnect this account.");
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not disconnect this account.");
      setBusy(false);
    }
  }

  return (
    <section className="rounded-[2rem] border border-white/10 bg-[#110d0d] p-5 shadow-xl sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">Social publishing</p>
          <h2 className="mt-1 text-xl font-black">{labels[provider]}</h2>
          <p className="mt-2 text-sm font-semibold leading-5 text-white/45">{descriptions[provider]}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-black ${connected ? "border-emerald-300/20 bg-emerald-500/10 text-emerald-100" : "border-white/10 bg-white/[0.04] text-white/45"}`}>
          {connected ? String(connection?.status || "connected").replaceAll("_", " ") : "Not connected"}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">Account</p>
          <p className="mt-2 truncate text-sm font-black text-white/75">{connected ? account : "—"}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">Token</p>
          <p className="mt-2 text-sm font-black text-white/75">{connection?.token_expires_at ? `Expires ${new Date(connection.token_expires_at).toLocaleDateString()}` : connected ? "Managed" : "—"}</p>
        </div>
      </div>

      {connection?.last_error || message ? (
        <div className="mt-4 rounded-2xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-100">{message || connection?.last_error}</div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        {configured ? (
          <a href={connectHref} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-black text-black">
            {connected ? <RefreshCw className="h-4 w-4" /> : <ExternalLink className="h-4 w-4" />}
            {connected ? `Reconnect ${labels[provider]}` : `Connect ${labels[provider]}`}
          </a>
        ) : (
          <span className="inline-flex min-h-11 items-center rounded-xl border border-amber-300/20 bg-amber-500/10 px-4 text-xs font-black text-amber-100">Provider credentials need platform setup</span>
        )}
        {connected ? (
          <button disabled={busy} onClick={disconnect} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-4 text-sm font-black text-white/65 disabled:opacity-40">
            <Unplug className="h-4 w-4" />
            {busy ? "Disconnecting…" : "Disconnect"}
          </button>
        ) : null}
      </div>
    </section>
  );
}
