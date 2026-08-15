"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { WEBSITE_DESIGN_DIRECTIONS } from "@/lib/websites/design-directions";

type WebsiteSection = {
  id: string;
  type: string;
  enabled: boolean;
  heading?: string;
  body?: string;
  liveBindings?: string[];
};

type Website = {
  id: string;
  location_id: string;
  editor_status: string;
  site_title: string | null;
  sections: WebsiteSection[];
  theme: Record<string, unknown>;
  custom_content: Record<string, unknown>;
  domain: string | null;
  platform_domain?: string | null;
  live_url?: string | null;
  published_version: number | null;
  last_publish_status: string;
  last_error: string | null;
  published_at: string | null;
};

type Step = "style" | "content" | "preview" | "publish";

const STEP_ORDER: Step[] = ["style", "content", "preview", "publish"];
const STEP_LABELS: Record<Step, string> = { style: "AI Design", content: "Content", preview: "Preview", publish: "Publish" };

function sectionLabel(type: string) {
  return type.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function blueprintValue(customContent: Record<string, unknown>) {
  const value = customContent.blueprint;
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function WebsiteBuilderWorkspace({ initialWebsite, locationName }: { initialWebsite: Website; locationName: string }) {
  const initialDirection = typeof initialWebsite.theme?.design_direction_id === "string" ? String(initialWebsite.theme.design_direction_id) : "";
  const initialVision = typeof initialWebsite.custom_content?.design_vision === "string" ? String(initialWebsite.custom_content.design_vision) : "";
  const [website, setWebsite] = useState(initialWebsite);
  const [step, setStep] = useState<Step>(initialDirection ? "content" : "style");
  const [vision, setVision] = useState(initialVision);
  const [selectedDirection, setSelectedDirection] = useState(initialDirection);
  const [siteTitle, setSiteTitle] = useState(initialWebsite.site_title || locationName);
  const [sections, setSections] = useState<WebsiteSection[]>(initialWebsite.sections || []);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const hydrated = useRef(false);

  const liveUrl = website.live_url || (website.domain ? `https://${website.domain}` : null);
  const displayedDomain = website.domain || website.platform_domain || `${locationName.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 28) || "yourbusiness"}.theouthaven.com`;
  const enabledCount = useMemo(() => sections.filter((section) => section.enabled).length, [sections]);
  const blueprint = blueprintValue(website.custom_content || {});
  const direction = WEBSITE_DESIGN_DIRECTIONS.find((item) => item.id === selectedDirection);
  const isRedesign = Boolean(blueprint || website.published_version);

  async function persistDraft(next?: { theme?: Record<string, unknown>; custom_content?: Record<string, unknown> }, silent = true) {
    setSaving(true);
    setSaveState("saving");
    const response = await fetch("/api/business/website", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        location_id: website.location_id,
        site_title: siteTitle,
        sections,
        ...(next?.theme ? { theme: next.theme } : {}),
        ...(next?.custom_content ? { custom_content: next.custom_content } : {}),
      }),
    });
    const data = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setSaveState("error");
      if (!silent) setMessage(data?.error || "We could not save your changes.");
      return false;
    }
    setWebsite(data.website);
    setSaveState("saved");
    if (!silent) setMessage("Changes saved.");
    return true;
  }

  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    const timer = window.setTimeout(() => void persistDraft(undefined, true), 900);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteTitle, sections]);

  function updateSection(id: string, patch: Partial<WebsiteSection>) {
    setSections((current) => current.map((section) => section.id === id ? { ...section, ...patch } : section));
  }

  function moveSection(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= sections.length) return;
    setSections((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function generateWebsite() {
    setGenerating(true);
    setMessage("");
    const response = await fetch("/api/business/website/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        location_id: website.location_id,
        vision,
        mode: isRedesign ? "redesign" : "auto",
      }),
    });
    const data = await response.json().catch(() => ({}));
    setGenerating(false);
    if (!response.ok || !data.website) {
      setMessage(data?.error || "We could not generate your website right now.");
      return;
    }
    const nextWebsite = data.website as Website;
    setWebsite(nextWebsite);
    setSections(Array.isArray(nextWebsite.sections) ? nextWebsite.sections : []);
    setSiteTitle(nextWebsite.site_title || locationName);
    const nextDirection = typeof nextWebsite.theme?.design_direction_id === "string" ? String(nextWebsite.theme.design_direction_id) : "";
    setSelectedDirection(nextDirection);
    setSaveState("saved");
    setMessage(data.source === "ai" ? "Your AI website blueprint is ready. Review and edit anything you want." : "Your website blueprint is ready using the safe fallback generator.");
    setStep("content");
  }

  async function loadPreview() {
    setPreviewLoading(true);
    setMessage("");
    const saved = await persistDraft(undefined, true);
    if (!saved) {
      setPreviewLoading(false);
      return false;
    }
    const response = await fetch("/api/business/website/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        location_id: website.location_id,
        site_title: siteTitle,
        sections,
        theme: website.theme,
        custom_content: website.custom_content,
      }),
    });
    const data = await response.json().catch(() => ({}));
    setPreviewLoading(false);
    if (!response.ok || !data.html) {
      setMessage(data?.error || "We could not build the preview.");
      return false;
    }
    setPreviewHtml(data.html);
    return true;
  }

  async function goToStep(next: Step) {
    if (next === "preview") {
      setStep("preview");
      await loadPreview();
      return;
    }
    setStep(next);
  }

  async function publish() {
    setMessage("");
    const saved = await persistDraft(undefined, true);
    if (!saved) return;
    setPublishing(true);
    const response = await fetch("/api/business/website/publish", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ location_id: website.location_id }),
    });
    const data = await response.json().catch(() => ({}));
    setPublishing(false);
    if (!response.ok) {
      setWebsite((current) => ({ ...current, last_publish_status: "failed" }));
      setMessage(data?.error || "We could not publish your website.");
      return;
    }
    const refreshed = await fetch(`/api/business/website?location_id=${encodeURIComponent(website.location_id)}`, { cache: "no-store" });
    const refreshedData = await refreshed.json().catch(() => ({}));
    if (refreshed.ok && refreshedData.website) setWebsite(refreshedData.website);
    setMessage("Your website is live.");
  }

  const stepIndex = STEP_ORDER.indexOf(step);

  return <div className="space-y-5">
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
      <div className="border-b border-white/10 px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-200">AI Website Generation V3</p>
            <h2 className="mt-2 text-2xl font-black">{website.published_version ? "Manage your generated website" : "Generate, review, and publish"}</h2>
            <p className="mt-2 max-w-2xl text-sm text-white/55">AI creates the blueprint, business-specific copy, conversion strategy, section composition, and visual hierarchy. TheOutHaven&apos;s renderer controls the production HTML and uses only your real business imagery.</p>
          </div>
          <div className="flex items-center gap-2 text-xs font-bold text-white/50">
            <span className={`h-2 w-2 rounded-full ${saveState === "error" ? "bg-red-400" : saveState === "saving" ? "bg-amber-300" : "bg-emerald-400"}`} />
            {saveState === "error" ? "Save failed" : saveState === "saving" || saving ? "Saving…" : "Saved"}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-4 border-b border-white/10">
        {STEP_ORDER.map((item, index) => {
          const active = item === step;
          const complete = index < stepIndex || (item === "style" && Boolean(blueprint));
          return <button key={item} type="button" onClick={() => void goToStep(item)} className={`px-2 py-4 text-center text-xs font-black sm:text-sm ${active ? "bg-white/[0.08] text-white" : "text-white/45 hover:bg-white/[0.03]"}`}>
            <span className={`mx-auto mb-1 flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${active ? "bg-[#f5b700] text-black" : complete ? "bg-emerald-500/20 text-emerald-200" : "bg-white/5"}`}>{complete ? "✓" : index + 1}</span>
            {STEP_LABELS[item]}
          </button>;
        })}
      </div>
    </section>

    {step === "style" ? <section className="rounded-3xl border border-white/10 bg-black/25 p-5 sm:p-6">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#f5b700]">Step 1 of 4</p>
      <h3 className="mt-2 text-2xl font-black">Describe the website you want</h3>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">Tell us the mood, audience, priorities, and anything you want emphasized. V3 combines that direction with your real location data to produce a complete website blueprint. It will not invent reviews, amenities, menu items, awards, or fake photography.</p>
      <textarea value={vision} onChange={(event) => setVision(event.target.value)} maxLength={1200} placeholder="Example: Upscale, dark and romantic. Make reservations the primary action, emphasize the lounge atmosphere, keep the copy polished and concise, and use our photos prominently without making the page feel crowded." className="mt-5 min-h-36 w-full rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white outline-none focus:border-rose-300/40" />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={generateWebsite} disabled={generating || vision.trim().length < 10} className="rounded-full bg-rose-600 px-6 py-3 text-sm font-black disabled:opacity-40">{generating ? "Building your V3 blueprint…" : isRedesign ? "Generate a new design" : "Generate my website"}</button>
        <span className="text-xs text-white/45">No AI-generated images · deterministic production renderer</span>
      </div>
      {direction ? <div className="mt-6 rounded-2xl border border-[#f5b700]/25 bg-[#f5b700]/8 p-5"><p className="text-xs font-black uppercase tracking-[0.14em] text-[#f5b700]">Current AI direction</p><p className="mt-2 text-xl font-black">{direction.name}</p><p className="mt-2 text-sm text-white/60">{direction.summary}</p></div> : null}
    </section> : null}

    {step === "content" ? <section className="rounded-3xl border border-white/10 bg-black/25 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-black uppercase tracking-[0.18em] text-[#f5b700]">Step 2 of 4</p><h3 className="mt-2 text-2xl font-black">Review the generated blueprint</h3><p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">V3 generated the starting composition and copy. You remain in control: reorder, hide, or rewrite sections before publishing. Address, phone, hours, real photos, and booking information remain live-bound to your business profile.</p></div>
        <span className="rounded-full bg-emerald-500/10 px-3 py-2 text-xs font-black text-emerald-200">{enabledCount} sections showing</span>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-xs font-black uppercase text-white/40">Design direction</p><p className="mt-2 font-black">{direction?.name || "Custom blueprint"}</p></div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-xs font-black uppercase text-white/40">Blueprint</p><p className="mt-2 font-black">{blueprint ? "V3 generated" : "Manual draft"}</p></div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <label className="text-sm font-black">Website name</label>
        <input value={siteTitle} onChange={(event) => setSiteTitle(event.target.value)} maxLength={160} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-rose-300/40" />
      </div>

      <div className="mt-4 space-y-3">{sections.map((section, index) => <article key={section.id} className={`rounded-2xl border p-4 ${section.enabled ? "border-white/10 bg-white/[0.03]" : "border-white/5 bg-black/20 opacity-65"}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="font-black">{sectionLabel(section.type)}</p>{section.liveBindings?.length ? <p className="mt-1 text-xs text-emerald-200/70">Live business data stays synced</p> : null}</div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => moveSection(index, -1)} disabled={index === 0} aria-label={`Move ${section.type} up`} className="rounded-full border border-white/10 px-3 py-1 text-xs font-black disabled:opacity-25">↑</button>
            <button type="button" onClick={() => moveSection(index, 1)} disabled={index === sections.length - 1} aria-label={`Move ${section.type} down`} className="rounded-full border border-white/10 px-3 py-1 text-xs font-black disabled:opacity-25">↓</button>
            <button type="button" onClick={() => updateSection(section.id, { enabled: !section.enabled })} className="rounded-full border border-white/10 px-3 py-1 text-xs font-black">{section.enabled ? "Hide" : "Show"}</button>
          </div>
        </div>
        {section.enabled ? <div className="mt-4 grid gap-3"><input value={section.heading || ""} onChange={(event) => updateSection(section.id, { heading: event.target.value })} placeholder={`${sectionLabel(section.type)} heading`} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white" /><textarea value={section.body || ""} onChange={(event) => updateSection(section.id, { body: event.target.value })} placeholder="Optional custom wording" className="min-h-20 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white" /></div> : null}
      </article>)}</div>

      <div className="mt-6 flex flex-wrap justify-between gap-3"><button type="button" onClick={() => void goToStep("style")} className="rounded-full border border-white/15 px-5 py-3 text-sm font-black">← Regenerate</button><button type="button" onClick={() => void goToStep("preview")} className="rounded-full bg-[#f5b700] px-6 py-3 text-sm font-black text-black">Preview my website →</button></div>
    </section> : null}

    {step === "preview" ? <section className="rounded-3xl border border-white/10 bg-black/25 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-[#f5b700]">Step 3 of 4</p><h3 className="mt-2 text-2xl font-black">Review before you publish</h3><p className="mt-2 text-sm text-white/60">This preview uses the same deterministic renderer as the live website.</p></div><div className="flex rounded-full border border-white/10 bg-white/[0.03] p-1"><button type="button" onClick={() => setDevice("desktop")} className={`rounded-full px-4 py-2 text-xs font-black ${device === "desktop" ? "bg-white/10" : "text-white/45"}`}>Desktop</button><button type="button" onClick={() => setDevice("mobile")} className={`rounded-full px-4 py-2 text-xs font-black ${device === "mobile" ? "bg-white/10" : "text-white/45"}`}>Mobile</button></div></div>
      <div className="mt-5 overflow-auto rounded-2xl border border-white/10 bg-[#0b0b0d] p-3"><div className={`mx-auto overflow-hidden rounded-xl bg-white transition-all ${device === "mobile" ? "max-w-[390px]" : "w-full"}`} style={{ height: 720 }}>{previewLoading ? <div className="flex h-full items-center justify-center text-sm font-black text-black/50">Building your preview…</div> : previewHtml ? <iframe title="Website preview" srcDoc={previewHtml} className="h-full w-full border-0" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" /> : <div className="flex h-full items-center justify-center text-sm font-black text-black/50">Preview unavailable.</div>}</div></div>
      <div className="mt-6 flex flex-wrap justify-between gap-3"><button type="button" onClick={() => void goToStep("content")} className="rounded-full border border-white/15 px-5 py-3 text-sm font-black">← Edit content</button><div className="flex gap-2"><button type="button" onClick={loadPreview} disabled={previewLoading} className="rounded-full border border-white/15 px-5 py-3 text-sm font-black disabled:opacity-40">Refresh preview</button><button type="button" onClick={() => void goToStep("publish")} className="rounded-full bg-[#f5b700] px-6 py-3 text-sm font-black text-black">Looks good →</button></div></div>
    </section> : null}

    {step === "publish" ? <section className="rounded-3xl border border-white/10 bg-black/25 p-5 sm:p-6">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#f5b700]">Step 4 of 4</p>
      <h3 className="mt-2 text-2xl font-black">Ready to go live?</h3>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">We&apos;ll publish the exact version you reviewed. The AI blueprint remains data; the production renderer controls the final HTML/CSS and your synced business information can stay current.</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-xs font-bold uppercase text-white/40">Website address</p><p className="mt-2 truncate font-black">{displayedDomain}</p></div><div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-xs font-bold uppercase text-white/40">Sections</p><p className="mt-2 font-black">{enabledCount} visible</p></div><div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-xs font-bold uppercase text-white/40">Current version</p><p className="mt-2 font-black">{website.published_version ? `Version ${website.published_version}` : "First publish"}</p></div></div>
      <div className="mt-6 flex flex-wrap justify-between gap-3"><button type="button" onClick={() => void goToStep("preview")} className="rounded-full border border-white/15 px-5 py-3 text-sm font-black">← Back to preview</button><button type="button" onClick={publish} disabled={publishing || saving} className="rounded-full bg-[#f5b700] px-7 py-3 text-sm font-black text-black disabled:opacity-40">{publishing ? "Publishing…" : website.published_version ? "Publish changes" : "Publish website"}</button></div>

      {website.published_version && liveUrl ? <div className="mt-6 rounded-2xl border border-emerald-300/20 bg-emerald-500/10 p-5"><p className="text-sm font-black text-emerald-100">Your website is live</p><a href={liveUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-lg font-black text-[#f5b700]">{liveUrl} ↗</a><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => void goToStep("content")} className="rounded-full border border-white/15 px-4 py-2 text-xs font-black">Edit website</button><button type="button" onClick={() => void goToStep("style")} className="rounded-full border border-white/15 px-4 py-2 text-xs font-black">AI redesign</button></div></div> : null}
    </section> : null}

    {message ? <p className={`rounded-2xl border px-4 py-3 text-sm font-bold ${message === "Your website is live." ? "border-emerald-300/20 bg-emerald-500/10 text-emerald-100" : "border-white/10 bg-white/[0.04] text-white/75"}`}>{message}</p> : null}
    {website.last_error ? <p className="rounded-2xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">Last publish issue: {website.last_error}</p> : null}
  </div>;
}