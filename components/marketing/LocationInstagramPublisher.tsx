"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

function localDateTimeValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export default function LocationInstagramPublisher({
  locationId,
  connected,
  username,
  mediaOptions,
}: {
  locationId: string;
  connected: boolean;
  username: string | null;
  mediaOptions: string[];
}) {
  const router = useRouter();
  const [caption, setCaption] = useState("");
  const [mediaUrl, setMediaUrl] = useState(mediaOptions[0] || "");
  const [customMediaUrl, setCustomMediaUrl] = useState("");
  const [mode, setMode] = useState<"now" | "schedule">("now");
  const [publishAt, setPublishAt] = useState(localDateTimeValue(new Date(Date.now() + 60 * 60 * 1000)));
  const [busy, setBusy] = useState<"generate" | "publish" | "sync" | null>(null);
  const [message, setMessage] = useState("");
  const [permalink, setPermalink] = useState<string | null>(null);

  const selectedMedia = useMemo(() => customMediaUrl.trim() || mediaUrl, [customMediaUrl, mediaUrl]);

  async function generateCaption() {
    setBusy("generate");
    setMessage("");
    try {
      const response = await fetch("/api/business/marketing/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          locationId,
          contentType: "Instagram caption",
          goal: "engagement and visits",
          tone: "brand",
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || json.message || "Could not generate a caption.");
      const generated = String(json.copy || json.draft?.body || "").trim();
      if (!generated) throw new Error("The caption generator returned no copy.");
      setCaption(generated.slice(0, 2200));
      setMessage("Caption generated. Review it before publishing.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not generate a caption.");
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    setBusy("publish");
    setMessage("");
    setPermalink(null);
    try {
      const response = await fetch("/api/locations/marketing/instagram/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          locationId,
          caption,
          mediaUrl: selectedMedia,
          publishAt: mode === "schedule" ? new Date(publishAt).toISOString() : undefined,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Instagram publishing failed.");
      if (json.status === "scheduled") {
        setMessage(`Instagram post scheduled for ${new Date(json.publishAt).toLocaleString()}.`);
      } else {
        setMessage("Published to Instagram successfully.");
        if (typeof json.permalink === "string") setPermalink(json.permalink);
      }
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Instagram publishing failed.");
    } finally {
      setBusy(null);
    }
  }

  async function syncInsights() {
    setBusy("sync");
    setMessage("");
    try {
      const response = await fetch("/api/locations/social/instagram/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locationId }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Could not sync Instagram insights.");
      setMessage(`Insights synced: ${json.accounts || 0} account snapshot, ${json.posts || 0} post snapshots.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not sync Instagram insights.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/25 p-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">Publishing account</p>
          <p className="mt-1 text-sm font-black text-white/85">{connected ? (username ? `@${username.replace(/^@/, "")}` : "Instagram connected") : "Instagram not connected"}</p>
        </div>
        {connected ? (
          <button type="button" onClick={syncInsights} disabled={Boolean(busy)} className="min-h-11 rounded-xl border border-white/10 bg-white/[0.06] px-4 text-sm font-black disabled:opacity-40">
            {busy === "sync" ? "Syncing…" : "Sync insights"}
          </button>
        ) : (
          <a href={`/locations/dashboard/social-accounts?locationId=${encodeURIComponent(locationId)}`} className="min-h-11 rounded-xl bg-white px-4 py-3 text-sm font-black text-black">Connect Instagram</a>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ff6b86]">Caption</p>
            <p className="mt-1 text-xs font-semibold text-white/40">Generate a draft or write your own. Nothing publishes until you press Publish.</p>
          </div>
          <button type="button" onClick={generateCaption} disabled={Boolean(busy)} className="min-h-10 rounded-xl border border-white/10 bg-white/[0.06] px-4 text-xs font-black disabled:opacity-40">
            {busy === "generate" ? "Generating…" : "Generate caption"}
          </button>
        </div>
        <textarea value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={2200} rows={8} placeholder="Write your Instagram caption…" className="mt-4 w-full resize-y rounded-2xl border border-white/10 bg-[#070708] p-4 text-sm font-semibold text-white outline-none placeholder:text-white/25 focus:border-[#ff2142]/50" />
        <p className="mt-2 text-right text-[11px] font-bold text-white/30">{caption.length}/2200</p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ff6b86]">Media</p>
        <p className="mt-1 text-xs font-semibold text-white/40">Choose an existing public profile image or paste a public HTTPS image/video URL.</p>
        {mediaOptions.length ? (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {mediaOptions.slice(0, 8).map((url) => (
              <button key={url} type="button" onClick={() => { setMediaUrl(url); setCustomMediaUrl(""); }} className={`overflow-hidden rounded-2xl border text-left ${mediaUrl === url && !customMediaUrl ? "border-[#ff2142]" : "border-white/10"}`}>
                <img src={url} alt="Location media option" className="aspect-square w-full object-cover" />
              </button>
            ))}
          </div>
        ) : null}
        <input value={customMediaUrl} onChange={(event) => setCustomMediaUrl(event.target.value)} placeholder="https://… image or video" className="mt-4 min-h-12 w-full rounded-xl border border-white/10 bg-[#070708] px-4 text-sm font-semibold text-white outline-none placeholder:text-white/25 focus:border-[#ff2142]/50" />
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ff6b86]">When</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => setMode("now")} className={`min-h-11 rounded-xl px-4 text-sm font-black ${mode === "now" ? "bg-white text-black" : "border border-white/10 bg-white/[0.04]"}`}>Publish now</button>
          <button type="button" onClick={() => setMode("schedule")} className={`min-h-11 rounded-xl px-4 text-sm font-black ${mode === "schedule" ? "bg-white text-black" : "border border-white/10 bg-white/[0.04]"}`}>Schedule</button>
        </div>
        {mode === "schedule" ? <input type="datetime-local" value={publishAt} onChange={(event) => setPublishAt(event.target.value)} className="mt-4 min-h-12 rounded-xl border border-white/10 bg-[#070708] px-4 text-sm font-semibold text-white" /> : null}
      </div>

      {message ? <div role="status" className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-bold text-white/75">{message}{permalink ? <a href={permalink} target="_blank" rel="noreferrer" className="ml-2 underline">Open post</a> : null}</div> : null}

      <button type="button" onClick={publish} disabled={!connected || Boolean(busy) || !caption.trim() || !selectedMedia.trim()} className="min-h-14 w-full rounded-2xl bg-[#e1062a] px-5 text-base font-black text-white transition hover:bg-[#ff2142] disabled:cursor-not-allowed disabled:opacity-35">
        {busy === "publish" ? "Publishing…" : mode === "schedule" ? "Schedule Instagram post" : "Publish to Instagram"}
      </button>
    </div>
  );
}
