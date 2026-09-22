"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Provider = "instagram" | "facebook" | "tiktok" | "youtube";

type Connection = {
  provider: Provider;
  connected: boolean;
  displayName: string | null;
  username: string | null;
  metadata?: Record<string, unknown> | null;
};

type DemandOpportunity = {
  query: string;
  searches30d: number;
  searches7d: number;
  trendPercent: number | null;
  noResultSearches: number;
};

const providerLabels: Record<Provider, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
};

function localDateTimeValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export default function LocationSocialComposer({
  locationId,
  connections,
  mediaOptions,
  demandOpportunities,
}: {
  locationId: string;
  connections: Connection[];
  mediaOptions: string[];
  demandOpportunities?: DemandOpportunity[];
}) {
  const router = useRouter();
  const connectedProviders = useMemo(
    () => connections.filter((item) => item.connected).map((item) => item.provider),
    [connections],
  );
  const [platforms, setPlatforms] = useState<Provider[]>(connectedProviders.includes("instagram") ? ["instagram"] : connectedProviders.slice(0, 1));
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [platformCopy, setPlatformCopy] = useState<Record<Provider, string>>({
    instagram: "",
    facebook: "",
    tiktok: "",
    youtube: "",
  });
  const [mediaUrl, setMediaUrl] = useState(mediaOptions[0] || "");
  const [customMediaUrl, setCustomMediaUrl] = useState("");
  const [mode, setMode] = useState<"now" | "schedule">("now");
  const [publishAt, setPublishAt] = useState(localDateTimeValue(new Date(Date.now() + 60 * 60 * 1000)));
  const [demandQuery, setDemandQuery] = useState("");
  const [tiktokPrivacyLevel, setTiktokPrivacyLevel] = useState("");
  const [tiktokDisableComment, setTiktokDisableComment] = useState(false);
  const [tiktokDisableDuet, setTiktokDisableDuet] = useState(false);
  const [tiktokDisableStitch, setTiktokDisableStitch] = useState(false);
  const [busy, setBusy] = useState<"generate" | "publish" | null>(null);
  const [message, setMessage] = useState("");

  const selectedMedia = customMediaUrl.trim() || mediaUrl;
  const tiktokConnection = connections.find((item) => item.provider === "tiktok");
  const tiktokPrivacyOptions = Array.isArray(tiktokConnection?.metadata?.privacy_level_options)
    ? tiktokConnection?.metadata?.privacy_level_options.map(String)
    : [];

  function toggleProvider(provider: Provider) {
    const connection = connections.find((item) => item.provider === provider);
    if (!connection?.connected) return;
    setPlatforms((current) => current.includes(provider)
      ? current.filter((item) => item !== provider)
      : [...current, provider]);
  }

  async function generate() {
    setBusy("generate");
    setMessage("");
    try {
      const response = await fetch("/api/business/marketing/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          locationId,
          contentType: "Multi-channel social post",
          goal: "engagement, visits, reservations, and bookings",
          tone: "brand",
          demandQuery: demandQuery || undefined,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || json.message || "Could not generate social copy.");
      const generated = String(json.copy || json.draft?.body || "").trim();
      if (!generated) throw new Error("The generator returned no copy.");
      const limited = generated.slice(0, 2200);
      setCaption(limited);
      setPlatformCopy({
        instagram: limited,
        facebook: limited,
        tiktok: limited,
        youtube: limited,
      });
      setMessage("Draft generated. Review each selected channel before publishing.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not generate social copy.");
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    setBusy("publish");
    setMessage("");
    try {
      const response = await fetch("/api/locations/marketing/social/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          locationId,
          platforms,
          title,
          caption,
          platformCopy,
          mediaUrl: selectedMedia || undefined,
          publishAt: mode === "schedule" ? new Date(publishAt).toISOString() : undefined,
          tiktokPrivacyLevel: platforms.includes("tiktok") ? tiktokPrivacyLevel : undefined,
          tiktokDisableComment,
          tiktokDisableDuet,
          tiktokDisableStitch,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Social publishing failed.");
      if (json.status === "scheduled") {
        setMessage(`Scheduled for ${new Date(json.publishAt).toLocaleString()} across ${platforms.map((item) => providerLabels[item]).join(", ")}.`);
      } else if (json.status === "published") {
        setMessage(`Published successfully across ${platforms.map((item) => providerLabels[item]).join(", ")}.`);
      } else if (json.status === "processing") {
        setMessage("Publishing started. Provider processing and queued work will continue through the social worker.");
      } else {
        const failed = Array.isArray(json.results) ? json.results.filter((item: any) => item.status === "failed") : [];
        setMessage(failed.length ? `Some channels need attention: ${failed.map((item: any) => providerLabels[item.provider as Provider] || item.provider).join(", ")}.` : "Social post created.");
      }
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Social publishing failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ff6b86]">Channels</p>
        <p className="mt-1 text-xs font-semibold text-white/40">Create once, tailor per channel, then publish or schedule through one workflow.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {connections.map((connection) => {
            const selected = platforms.includes(connection.provider);
            const account = connection.username || connection.displayName || "Connected";
            return (
              <button
                key={connection.provider}
                type="button"
                disabled={!connection.connected}
                onClick={() => toggleProvider(connection.provider)}
                className={`rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-35 ${selected ? "border-[#ff2142]/70 bg-[#ff2142]/10" : "border-white/10 bg-white/[0.025] hover:bg-white/[0.05]"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-black">{providerLabels[connection.provider]}</p>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-black ${connection.connected ? "bg-emerald-500/10 text-emerald-200" : "bg-white/[0.05] text-white/35"}`}>{connection.connected ? "Connected" : "Connect first"}</span>
                </div>
                <p className="mt-2 truncate text-xs font-semibold text-white/40">{connection.connected ? account : "Open Connected Accounts to authorize"}</p>
              </button>
            );
          })}
        </div>
        {connectedProviders.length < 4 ? <a href={`/locations/dashboard/social-accounts?locationId=${encodeURIComponent(locationId)}`} className="mt-3 inline-block text-xs font-black text-white/50 underline">Manage connected accounts</a> : null}
      </div>

      {demandOpportunities?.length ? (
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ff6b86]">Build from live demand</p>
              <p className="mt-1 text-xs font-semibold text-white/40">Use an aggregated Search V2 query as the campaign angle.</p>
            </div>
            {demandQuery ? <button type="button" onClick={() => setDemandQuery("")} className="text-xs font-black text-white/45 underline">Clear</button> : null}
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {demandOpportunities.slice(0, 6).map((item) => (
              <button key={item.query} type="button" onClick={() => setDemandQuery(item.query)} className={`rounded-xl border p-3 text-left ${demandQuery === item.query ? "border-[#ff2142]/70 bg-[#ff2142]/10" : "border-white/10 bg-white/[0.025]"}`}>
                <p className="line-clamp-2 text-sm font-black text-white/80">{item.query}</p>
                <p className="mt-1 text-[11px] font-semibold text-white/35">{item.searches7d} searches in 7d · {item.searches30d} in 30d{item.trendPercent == null ? "" : ` · ${item.trendPercent >= 0 ? "+" : ""}${item.trendPercent}%`}</p>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ff6b86]">Master draft</p>
            <p className="mt-1 text-xs font-semibold text-white/40">The shared draft is the fallback for every selected channel. Override individual channels below when needed.</p>
          </div>
          <button type="button" onClick={generate} disabled={Boolean(busy)} className="min-h-10 rounded-xl border border-white/10 bg-white/[0.06] px-4 text-xs font-black disabled:opacity-40">{busy === "generate" ? "Generating…" : "Generate from business + demand"}</button>
        </div>
        <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} placeholder="Optional title — used by YouTube and internal content records" className="mt-4 min-h-12 w-full rounded-xl border border-white/10 bg-[#070708] px-4 text-sm font-semibold text-white outline-none placeholder:text-white/25" />
        <textarea value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={2200} rows={7} placeholder="Write the shared social post…" className="mt-3 w-full resize-y rounded-2xl border border-white/10 bg-[#070708] p-4 text-sm font-semibold text-white outline-none placeholder:text-white/25" />
        <p className="mt-2 text-right text-[11px] font-bold text-white/30">{caption.length}/2200</p>
      </div>

      {platforms.length ? (
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ff6b86]">Channel copy</p>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {platforms.map((provider) => (
              <label key={provider} className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                <span className="text-sm font-black">{providerLabels[provider]}</span>
                <span className="ml-2 text-[11px] font-semibold text-white/35">Leave blank to use master draft</span>
                <textarea value={platformCopy[provider]} onChange={(event) => setPlatformCopy((current) => ({ ...current, [provider]: event.target.value }))} maxLength={2200} rows={5} className="mt-3 w-full resize-y rounded-xl border border-white/10 bg-[#070708] p-3 text-sm font-semibold text-white outline-none" />
              </label>
            ))}
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ff6b86]">Media</p>
        <p className="mt-1 text-xs font-semibold text-white/40">Instagram requires media. TikTok and YouTube require a public HTTPS video URL.</p>
        {mediaOptions.length ? (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {mediaOptions.slice(0, 8).map((url) => (
              <button key={url} type="button" onClick={() => { setMediaUrl(url); setCustomMediaUrl(""); }} className={`overflow-hidden rounded-2xl border ${mediaUrl === url && !customMediaUrl ? "border-[#ff2142]" : "border-white/10"}`}>
                <img src={url} alt="Location media option" className="aspect-square w-full object-cover" />
              </button>
            ))}
          </div>
        ) : null}
        <input value={customMediaUrl} onChange={(event) => setCustomMediaUrl(event.target.value)} placeholder="https://… public image or video" className="mt-4 min-h-12 w-full rounded-xl border border-white/10 bg-[#070708] px-4 text-sm font-semibold text-white outline-none placeholder:text-white/25" />
      </div>

      {platforms.includes("tiktok") ? (
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ff6b86]">TikTok creator controls</p>
          <p className="mt-1 text-xs font-semibold text-white/40">TikTok requires the creator to choose privacy before direct posting. TheOutHaven preserves that choice with the post.</p>
          <select value={tiktokPrivacyLevel} onChange={(event) => setTiktokPrivacyLevel(event.target.value)} className="mt-4 min-h-12 w-full rounded-xl border border-white/10 bg-[#070708] px-4 text-sm font-bold text-white">
            <option value="">Choose privacy level</option>
            {tiktokPrivacyOptions.map((option) => <option key={option} value={option}>{option.replaceAll("_", " ")}</option>)}
          </select>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.025] p-3 text-xs font-bold text-white/65"><input type="checkbox" checked={tiktokDisableComment} onChange={(event) => setTiktokDisableComment(event.target.checked)} /> Disable comments</label>
            <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.025] p-3 text-xs font-bold text-white/65"><input type="checkbox" checked={tiktokDisableDuet} onChange={(event) => setTiktokDisableDuet(event.target.checked)} /> Disable duet</label>
            <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.025] p-3 text-xs font-bold text-white/65"><input type="checkbox" checked={tiktokDisableStitch} onChange={(event) => setTiktokDisableStitch(event.target.checked)} /> Disable stitch</label>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ff6b86]">When</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => setMode("now")} className={`min-h-11 rounded-xl px-4 text-sm font-black ${mode === "now" ? "bg-white text-black" : "border border-white/10 bg-white/[0.04]"}`}>Publish now</button>
          <button type="button" onClick={() => setMode("schedule")} className={`min-h-11 rounded-xl px-4 text-sm font-black ${mode === "schedule" ? "bg-white text-black" : "border border-white/10 bg-white/[0.04]"}`}>Schedule</button>
        </div>
        {mode === "schedule" ? <input type="datetime-local" value={publishAt} onChange={(event) => setPublishAt(event.target.value)} className="mt-4 min-h-12 rounded-xl border border-white/10 bg-[#070708] px-4 text-sm font-semibold text-white" /> : null}
      </div>

      {message ? <div role="status" className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-bold text-white/75">{message}</div> : null}

      <button type="button" onClick={publish} disabled={!platforms.length || Boolean(busy) || !caption.trim() || (platforms.includes("tiktok") && !tiktokPrivacyLevel)} className="min-h-14 w-full rounded-2xl bg-[#e1062a] px-5 text-base font-black text-white transition hover:bg-[#ff2142] disabled:cursor-not-allowed disabled:opacity-35">
        {busy === "publish" ? "Publishing…" : mode === "schedule" ? `Schedule on ${platforms.length || 0} channel${platforms.length === 1 ? "" : "s"}` : `Review & publish to ${platforms.length || 0} channel${platforms.length === 1 ? "" : "s"}`}
      </button>
    </div>
  );
}
