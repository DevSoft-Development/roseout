"use client";

import { useMemo, useState } from "react";

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
  published_version: number | null;
  last_publish_status: string;
  last_error: string | null;
  published_at: string | null;
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function previewHtml(title: string, sections: WebsiteSection[]) {
  const body = sections.filter((section) => section.enabled).map((section) => {
    const heading = escapeHtml(section.heading || section.type.replace(/_/g, " "));
    const content = escapeHtml(section.body || "Live business information will appear here when published.");
    if (section.type === "hero") return `<section class=\"hero\"><p class=\"eyebrow\">TheOutHaven</p><h1>${escapeHtml(title)}</h1><p>${content}</p></section>`;
    return `<section><h2>${heading}</h2><p>${content}</p></section>`;
  }).join("");
  return `<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><style>body{margin:0;background:#0d0d0f;color:#fff;font-family:Arial,sans-serif}main{max-width:920px;margin:auto;padding:42px 28px}section{padding:34px 0;border-bottom:1px solid #29292f}h1{font-size:54px;line-height:1;margin:10px 0 16px}h2{text-transform:capitalize}.eyebrow{color:#f5b700;text-transform:uppercase;font-weight:800;letter-spacing:.18em;font-size:11px}p{color:#c8c8ce;line-height:1.65}</style></head><body><main>${body}</main></body></html>`;
}

export function WebsiteBuilderWorkspace({ initialWebsite, locationName }: { initialWebsite: Website; locationName: string }) {
  const [website, setWebsite] = useState(initialWebsite);
  const [siteTitle, setSiteTitle] = useState(initialWebsite.site_title || locationName);
  const [sections, setSections] = useState<WebsiteSection[]>(initialWebsite.sections || []);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);

  const preview = useMemo(() => previewHtml(siteTitle, sections), [siteTitle, sections]);
  const liveUrl = website.domain ? `https://${website.domain}` : null;

  function updateSection(id: string, patch: Partial<WebsiteSection>) {
    setSections((current) => current.map((section) => section.id === id ? { ...section, ...patch } : section));
  }

  async function saveDraft(showMessage = true) {
    setSaving(true);
    if (showMessage) setMessage("");
    const response = await fetch("/api/business/website", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ location_id: website.location_id, site_title: siteTitle, sections }),
    });
    const data = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setMessage(data?.error || "Unable to save website changes.");
      return false;
    }
    setWebsite(data.website);
    if (showMessage) setMessage("Draft saved.");
    return true;
  }

  async function publish() {
    setMessage("");
    const saved = await saveDraft(false);
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
      setMessage(data?.error || "Unable to publish this website.");
      return;
    }
    const refreshed = await fetch(`/api/business/website?location_id=${encodeURIComponent(website.location_id)}`, { cache: "no-store" });
    const refreshedData = await refreshed.json().catch(() => ({}));
    if (refreshed.ok && refreshedData.website) setWebsite(refreshedData.website);
    setMessage(`Published successfully as version ${data.version}.`);
  }

  return <div className="space-y-5">
    <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-200">Website control center</p>
          <h2 className="mt-2 text-2xl font-black">Edit, preview, and publish</h2>
          <p className="mt-2 text-sm text-white/60">Changes remain drafts until you publish them to TheOutHaven&apos;s Lightsail hosting.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setPreviewOpen(true)} className="rounded-full border border-white/15 px-4 py-2 text-sm font-black">Preview</button>
          <button type="button" onClick={() => saveDraft()} disabled={saving || publishing} className="rounded-full border border-rose-300/30 bg-rose-500/10 px-4 py-2 text-sm font-black disabled:opacity-40">{saving ? "Saving..." : "Save draft"}</button>
          <button type="button" onClick={publish} disabled={saving || publishing} className="rounded-full bg-[#f5b700] px-5 py-2 text-sm font-black text-black disabled:opacity-40">{publishing ? "Publishing..." : website.published_version ? "Publish update" : "Publish website"}</button>
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs font-bold uppercase text-white/40">Editor</p><p className="mt-1 font-black capitalize">{website.editor_status}</p></div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs font-bold uppercase text-white/40">Publish</p><p className="mt-1 font-black capitalize">{publishing ? "publishing" : website.last_publish_status.replace(/_/g, " ")}</p></div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs font-bold uppercase text-white/40">Version</p><p className="mt-1 font-black">{website.published_version ?? "Not published"}</p></div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs font-bold uppercase text-white/40">Domain</p><p className="mt-1 truncate font-black">{website.domain || "Not connected"}</p></div>
      </div>
      {liveUrl ? <a href={liveUrl} target="_blank" rel="noreferrer" className="mt-4 inline-block text-sm font-black text-[#f5b700]">Open live website ↗</a> : null}
      {message ? <p className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-bold text-white/75">{message}</p> : null}
      {website.last_error ? <p className="mt-3 rounded-2xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">Last deployment error: {website.last_error}</p> : null}
    </section>

    <section className="rounded-3xl border border-white/10 bg-black/25 p-5">
      <label className="text-sm font-black">Website title</label>
      <input value={siteTitle} onChange={(event) => setSiteTitle(event.target.value)} maxLength={160} className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white" />
    </section>

    <section className="rounded-3xl border border-white/10 bg-black/25 p-5">
      <div className="flex items-center justify-between gap-4"><div><h3 className="text-xl font-black">Website sections</h3><p className="mt-1 text-sm text-white/55">Turn sections on or off and customize the copy. Live-bound business details stay synced from your location profile.</p></div><span className="rounded-full bg-white/5 px-3 py-1 text-xs font-black text-white/50">{sections.filter((section) => section.enabled).length} active</span></div>
      <div className="mt-5 space-y-3">
        {sections.map((section) => <article key={section.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-center justify-between gap-3"><div><p className="font-black capitalize">{section.type.replace(/_/g, " ")}</p>{section.liveBindings?.length ? <p className="mt-1 text-xs text-emerald-200/70">Live sync: {section.liveBindings.join(", ")}</p> : null}</div><button type="button" onClick={() => updateSection(section.id, { enabled: !section.enabled })} className={`rounded-full px-3 py-1 text-xs font-black ${section.enabled ? "bg-emerald-500/15 text-emerald-200" : "bg-white/5 text-white/45"}`}>{section.enabled ? "On" : "Off"}</button></div>
          {section.enabled ? <div className="mt-4 grid gap-3"><input value={section.heading || ""} onChange={(event) => updateSection(section.id, { heading: event.target.value })} placeholder="Section heading" className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white" /><textarea value={section.body || ""} onChange={(event) => updateSection(section.id, { body: event.target.value })} placeholder="Add custom copy. Leave blank to rely on live business information where supported." className="min-h-24 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white" /></div> : null}
        </article>)}
      </div>
    </section>

    {previewOpen ? <div className="fixed inset-0 z-50 bg-black/80 p-4 backdrop-blur-sm"><div className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#101014]"><div className="flex items-center justify-between border-b border-white/10 px-5 py-4"><div><p className="font-black">Website preview</p><p className="text-xs text-white/45">Draft preview — not public until published</p></div><button type="button" onClick={() => setPreviewOpen(false)} className="rounded-full border border-white/15 px-4 py-2 text-sm font-black">Close</button></div><iframe title="Website preview" srcDoc={preview} className="h-full w-full bg-white" sandbox="" /></div></div> : null}
  </div>;
}
