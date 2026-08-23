"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type SourceResult = {
  type: string;
  id: string;
  location_id?: string | null;
  title: string;
  description?: string | null;
  subtitle?: string | null;
  image_url?: string | null;
  metadata?: Record<string, unknown>;
};

type ContentItem = {
  id?: string;
  title?: string | null;
  scope?: string | null;
  location_id?: string | null;
  source_type?: string | null;
  source_id?: string | null;
  content_type?: string | null;
  occasion?: string | null;
  market?: string | null;
  neighborhood?: string | null;
  budget_category?: string | null;
  priority?: string | null;
  publish_at?: string | null;
  selected_platforms?: string[] | null;
  media_urls?: string[] | null;
  caption?: string | null;
  platform_copy?: Record<string, unknown> | null;
  auto_publish?: boolean | null;
  hook?: string | null;
  script?: string | null;
  voiceover?: string | null;
  cta?: string | null;
  metadata?: Record<string, unknown> | null;
  approval_status?: string | null;
  status?: string | null;
  current_version?: number | null;
};

const platforms = [
  ["instagram", "Instagram"],
  ["facebook", "Facebook"],
  ["tiktok", "TikTok"],
  ["youtube", "YouTube"],
] as const;

function normalizePlatformCopy(value?: Record<string, unknown> | null) {
  if (!value) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
      .map(([key, copy]) => [key, copy]),
  );
}

function localDateTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

function isoOrNull(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export default function MarketingContentEditor({ item }: { item?: ContentItem | null }) {
  const router = useRouter();
  const [id, setId] = useState(item?.id || "");
  const [title, setTitle] = useState(item?.title || "");
  const [sourceType, setSourceType] = useState(item?.source_type || "location");
  const [sourceId, setSourceId] = useState(item?.source_id || "");
  const [locationId, setLocationId] = useState(item?.location_id || "");
  const [sourceMeta, setSourceMeta] = useState<Record<string, unknown>>(item?.metadata || {});
  const [sourceQuery, setSourceQuery] = useState("");
  const [sourceResults, setSourceResults] = useState<SourceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [occasion, setOccasion] = useState(item?.occasion || "");
  const [market, setMarket] = useState(item?.market || "");
  const [neighborhood, setNeighborhood] = useState(item?.neighborhood || "");
  const [budget, setBudget] = useState(item?.budget_category || "");
  const [priority, setPriority] = useState(item?.priority || "normal");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(item?.selected_platforms || ["instagram", "tiktok"]);
  const [mediaUrls, setMediaUrls] = useState((item?.media_urls || []).join("\n"));
  const [publishAt, setPublishAt] = useState(localDateTime(item?.publish_at));
  const [autoPublish, setAutoPublish] = useState(Boolean(item?.auto_publish));
  const [hook, setHook] = useState(item?.hook || "");
  const [script, setScript] = useState(item?.script || "");
  const [voiceover, setVoiceover] = useState(item?.voiceover || "");
  const [caption, setCaption] = useState(item?.caption || "");
  const [cta, setCta] = useState(item?.cta || "");
  const [platformCopy, setPlatformCopy] = useState<Record<string, string>>(normalizePlatformCopy(item?.platform_copy));
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const approvalBadge = useMemo(() => {
    if (!item?.approval_status) return null;
    return `${String(item.approval_status).replaceAll("_", " ")} · v${item.current_version || 1}`;
  }, [item?.approval_status, item?.current_version]);

  async function findSources() {
    setSearching(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/marketing/content/sources?type=${encodeURIComponent(sourceType)}&q=${encodeURIComponent(sourceQuery)}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not search sources.");
      setSourceResults(payload.items || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not search sources.");
    } finally {
      setSearching(false);
    }
  }

  function chooseSource(source: SourceResult) {
    setSourceId(source.id);
    setLocationId(source.location_id || (source.type === "location" ? source.id : ""));
    setSourceMeta({ source: source.metadata || {}, source_title: source.title, source_description: source.description || null, source_image_url: source.image_url || null });
    if (!title) setTitle(source.title);
    setSourceQuery(source.title);
    setSourceResults([]);
  }

  function payload() {
    return {
      title,
      scope: "platform",
      source_type: sourceId ? sourceType : null,
      source_id: sourceId || null,
      location_id: locationId || null,
      content_type: "social_post",
      occasion,
      market,
      neighborhood,
      budget_category: budget,
      priority,
      publish_at: isoOrNull(publishAt),
      selected_platforms: selectedPlatforms,
      media_urls: mediaUrls.split(/\r?\n/).map((value) => value.trim()).filter(Boolean),
      caption,
      platform_copy: platformCopy,
      auto_publish: autoPublish,
      hook,
      script,
      voiceover,
      cta,
      metadata: sourceMeta,
    };
  }

  async function save() {
    setBusy("save");
    setMessage("");
    try {
      const response = await fetch(id ? `/api/admin/marketing/content/${id}` : "/api/admin/marketing/content", {
        method: id ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not save content.");
      const savedId = body.item?.id || id;
      setId(savedId);
      setMessage(body.reapproval_required ? "Saved. Because approved/submitted content changed, reapproval is required." : "Draft saved.");
      if (!item?.id && savedId) router.replace(`/admin/dashboard/marketing/content/${savedId}`);
      router.refresh();
      return savedId as string;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save content.");
      return "";
    } finally {
      setBusy(null);
    }
  }

  async function generate() {
    let contentId = id;
    if (!contentId) contentId = await save();
    if (!contentId) return;
    setBusy("generate");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/marketing/content/${contentId}/generate`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "AI generation failed.");
      const generated = body.generated || {};
      setHook(generated.hook || "");
      setScript(generated.script || "");
      setVoiceover(generated.voiceover || "");
      setCaption(generated.caption || "");
      setCta(generated.cta || "");
      setPlatformCopy(normalizePlatformCopy(generated.platform_copy));
      setMessage("AI content package generated. Review and save before submitting.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AI generation failed.");
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    let contentId = id;
    if (!contentId) contentId = await save();
    if (!contentId) return;
    setBusy("submit");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/marketing/content/${contentId}/submit`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not submit for approval.");
      setMessage("Submitted for approval. The approver's CRM task and Microsoft To Do sync were triggered.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not submit for approval.");
    } finally {
      setBusy(null);
    }
  }

  function togglePlatform(platform: string) {
    setSelectedPlatforms((current) => current.includes(platform) ? current.filter((item) => item !== platform) : [...current, platform]);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Content brief</h2>
            <p className="text-sm text-neutral-500">Choose what TheOutHaven is featuring, then build one master package for all channels.</p>
          </div>
          {approvalBadge ? <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold capitalize">{approvalBadge}</span> : null}
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <label className="space-y-1 text-sm font-medium">Title<input className="min-h-12 w-full rounded-xl border px-3 text-base" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Queens date night under $150" /></label>
          <label className="space-y-1 text-sm font-medium">Source type<select className="min-h-12 w-full rounded-xl border px-3 text-base" value={sourceType} onChange={(event) => { setSourceType(event.target.value); setSourceId(""); setLocationId(""); setSourceResults([]); }}><option value="location">Location</option><option value="outing">Outing</option><option value="event">Event</option><option value="experience">Experience</option><option value="offer">Offer</option></select></label>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input className="min-h-12 flex-1 rounded-xl border px-3 text-base" value={sourceQuery} onChange={(event) => setSourceQuery(event.target.value)} placeholder={`Search ${sourceType}s`} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void findSources(); } }} />
          <button type="button" onClick={() => void findSources()} disabled={searching} className="min-h-12 rounded-xl bg-neutral-950 px-5 font-semibold text-white disabled:opacity-50">{searching ? "Searching…" : "Find"}</button>
        </div>

        {sourceResults.length ? <div className="mt-3 max-h-72 overflow-auto rounded-xl border divide-y">{sourceResults.map((source) => <button key={`${source.type}:${source.id}`} type="button" onClick={() => chooseSource(source)} className="block min-h-16 w-full p-3 text-left hover:bg-neutral-50"><div className="font-medium">{source.title}</div><div className="text-xs text-neutral-500">{source.subtitle || source.description || source.type}</div></button>)}</div> : null}

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 text-sm font-medium">Occasion<input className="min-h-12 w-full rounded-xl border px-3" value={occasion} onChange={(e) => setOccasion(e.target.value)} placeholder="Date Night" /></label>
          <label className="space-y-1 text-sm font-medium">Market<input className="min-h-12 w-full rounded-xl border px-3" value={market} onChange={(e) => setMarket(e.target.value)} placeholder="NYC" /></label>
          <label className="space-y-1 text-sm font-medium">Neighborhood<input className="min-h-12 w-full rounded-xl border px-3" value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} placeholder="Astoria" /></label>
          <label className="space-y-1 text-sm font-medium">Budget<input className="min-h-12 w-full rounded-xl border px-3" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="Under $150" /></label>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Platforms & publishing</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{platforms.map(([key, label]) => <label key={key} className="flex min-h-14 items-center gap-3 rounded-xl border px-4 text-sm font-semibold"><input type="checkbox" className="h-5 w-5" checked={selectedPlatforms.includes(key)} onChange={() => togglePlatform(key)} />{label}</label>)}</div>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <label className="space-y-1 text-sm font-medium">Publish date & time<input type="datetime-local" className="min-h-12 w-full rounded-xl border px-3" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} /></label>
          <label className="space-y-1 text-sm font-medium">Priority<select className="min-h-12 w-full rounded-xl border px-3" value={priority} onChange={(e) => setPriority(e.target.value)}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
          <label className="flex min-h-12 items-center gap-3 rounded-xl border px-4 text-sm font-semibold lg:mt-6"><input type="checkbox" className="h-5 w-5" checked={autoPublish} onChange={(e) => setAutoPublish(e.target.checked)} />Auto-publish after approval</label>
        </div>
        <label className="mt-4 block space-y-1 text-sm font-medium">Media URLs <span className="font-normal text-neutral-500">(one per line; upload library selection can also populate these)</span><textarea className="min-h-28 w-full rounded-xl border p-3 font-mono text-sm" value={mediaUrls} onChange={(e) => setMediaUrls(e.target.value)} placeholder="https://.../reel.mp4" /></label>
      </div>

      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Creative package</h2><p className="text-sm text-neutral-500">AI can create the first pass; the employee remains responsible for reviewing it.</p></div><button type="button" onClick={() => void generate()} disabled={Boolean(busy)} className="min-h-12 rounded-xl border border-neutral-950 px-5 font-semibold disabled:opacity-50">{busy === "generate" ? "Generating…" : "Generate with AI"}</button></div>
        <div className="mt-5 space-y-4">
          <label className="block space-y-1 text-sm font-medium">Hook<input className="min-h-12 w-full rounded-xl border px-3" value={hook} onChange={(e) => setHook(e.target.value)} /></label>
          <label className="block space-y-1 text-sm font-medium">Script<textarea className="min-h-36 w-full rounded-xl border p-3" value={script} onChange={(e) => setScript(e.target.value)} /></label>
          <label className="block space-y-1 text-sm font-medium">Voiceover<textarea className="min-h-24 w-full rounded-xl border p-3" value={voiceover} onChange={(e) => setVoiceover(e.target.value)} /></label>
          <label className="block space-y-1 text-sm font-medium">Master caption<textarea className="min-h-32 w-full rounded-xl border p-3" value={caption} onChange={(e) => setCaption(e.target.value)} /></label>
          <label className="block space-y-1 text-sm font-medium">CTA<input className="min-h-12 w-full rounded-xl border px-3" value={cta} onChange={(e) => setCta(e.target.value)} /></label>
          <div className="grid gap-4 lg:grid-cols-2">{platforms.filter(([key]) => selectedPlatforms.includes(key)).map(([key, label]) => <label key={key} className="block space-y-1 text-sm font-medium">{label} copy<textarea className="min-h-32 w-full rounded-xl border p-3" value={platformCopy[key] || ""} onChange={(e) => setPlatformCopy((current) => ({ ...current, [key]: e.target.value }))} /></label>)}</div>
        </div>
      </div>

      {message ? <div className="rounded-xl border bg-neutral-50 p-4 text-sm font-medium">{message}</div> : null}
      <div className="sticky bottom-3 z-10 flex flex-wrap justify-end gap-3 rounded-2xl border bg-white/95 p-3 shadow-lg backdrop-blur">
        <button type="button" onClick={() => void save()} disabled={Boolean(busy)} className="min-h-12 rounded-xl border px-5 font-semibold disabled:opacity-50">{busy === "save" ? "Saving…" : "Save Draft"}</button>
        <button type="button" onClick={() => void submit()} disabled={Boolean(busy) || !selectedPlatforms.length} className="min-h-12 rounded-xl bg-neutral-950 px-5 font-semibold text-white disabled:opacity-50">{busy === "submit" ? "Submitting…" : "Submit for Approval"}</button>
      </div>
    </div>
  );
}
