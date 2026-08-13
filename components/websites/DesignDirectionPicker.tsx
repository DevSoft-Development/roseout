"use client";

import { useState } from "react";
import { WEBSITE_DESIGN_DIRECTIONS } from "@/lib/websites/design-directions";

type GeneratedSite = {
  hero: { heading: string; subheading: string; ctaLabel: string };
  about: { heading: string; body: string };
  seo: { title: string; description: string };
  sectionOrder: string[];
};

export function DesignDirectionPicker({ locationId }: { locationId: string }) {
  const [vision, setVision] = useState("");
  const [matches, setMatches] = useState<Array<{ id: string; confidence: string; reason?: string }>>([]);
  const [selected, setSelected] = useState("");
  const [directionSaved, setDirectionSaved] = useState(false);
  const [generated, setGenerated] = useState<GeneratedSite | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function match() {
    setBusy(true);
    setMessage("");
    setDirectionSaved(false);
    setGenerated(null);
    const response = await fetch("/api/business/website/design-direction", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ location_id: locationId, vision }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setMessage(data?.error || "Unable to match your vision.");
    setMatches(data.matches || []);
    setSelected(data.matches?.[0]?.id || "");
  }

  async function confirm() {
    const direction = WEBSITE_DESIGN_DIRECTIONS.find((item) => item.id === selected);
    if (!direction) return;
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/business/website", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        location_id: locationId,
        theme: { design_direction_id: direction.id, ...direction.theme },
        custom_content: { design_vision: vision },
      }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setMessage(data?.error || "Unable to save your design direction.");
    setDirectionSaved(true);
    setMessage("Design direction saved. Review it, then generate your included initial website build.");
  }

  async function generateInitialWebsite() {
    if (!directionSaved) return;
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/business/website/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        location_id: locationId,
        generation_type: "initial_build",
        request_key: crypto.randomUUID(),
      }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setMessage(data?.error || "Unable to generate your website.");
    setGenerated(data.generated || null);
    setVersion(typeof data.version === "number" ? data.version : null);
    setMessage("Your initial website build is ready. Live business details remain synced from your location dashboard.");
  }

  return <section className="rounded-3xl border border-white/10 bg-black/25 p-5">
    <h3 className="text-xl font-black">Describe your website</h3>
    <p className="mt-2 text-sm leading-6 text-white/60">Tell us how you want it to feel. We will match your vision to an approved design direction. No AI images are generated.</p>
    <p className="mt-2 text-xs font-bold text-white/45">Partner Pro includes the initial AI build plus up to 2 complete redesigns per month. Normal section edits and design-direction changes do not automatically use a redesign.</p>
    <textarea value={vision} onChange={(event) => setVision(event.target.value)} maxLength={1200} placeholder="Upscale, dark, romantic, with large food photography and a luxury feel." className="mt-4 min-h-28 w-full rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white" />
    <button type="button" onClick={match} disabled={busy || vision.trim().length < 10} className="mt-3 rounded-full bg-rose-600 px-5 py-3 text-sm font-black disabled:opacity-40">{busy ? "Working..." : "Match my vision"}</button>

    {matches.length ? <div className="mt-5 space-y-3">{matches.map((match, index) => {
      const direction = WEBSITE_DESIGN_DIRECTIONS.find((item) => item.id === match.id);
      if (!direction) return null;
      return <label key={match.id} className="block rounded-2xl border border-white/10 bg-white/[0.04] p-4"><div className="flex gap-3"><input type="radio" name="design-direction" checked={selected === match.id} onChange={() => { setSelected(match.id); setDirectionSaved(false); setGenerated(null); }} /><div><p className="font-black">{index === 0 ? "Best match — " : "Alternative — "}{direction.name}</p><p className="mt-1 text-sm text-white/60">{direction.summary}</p></div></div></label>;
    })}
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={confirm} disabled={busy || !selected} className="rounded-full bg-[#f5b700] px-5 py-3 text-sm font-black text-black disabled:opacity-40">Use this direction</button>
        {directionSaved ? <button type="button" onClick={generateInitialWebsite} disabled={busy} className="rounded-full bg-rose-600 px-5 py-3 text-sm font-black disabled:opacity-40">{busy ? "Generating..." : "Generate my website"}</button> : null}
      </div>
    </div> : null}

    {generated ? <div className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
      <div className="border-b border-white/10 px-5 py-4"><p className="text-xs font-black uppercase tracking-[0.18em] text-rose-200">Generated preview{version ? ` · Version ${version}` : ""}</p></div>
      <div className="space-y-6 p-5">
        <div><p className="text-xs font-black uppercase tracking-[0.18em] text-white/40">Hero</p><h4 className="mt-2 text-3xl font-black">{generated.hero.heading}</h4><p className="mt-2 max-w-2xl text-sm leading-6 text-white/65">{generated.hero.subheading}</p><span className="mt-3 inline-flex rounded-full bg-white px-4 py-2 text-xs font-black text-black">{generated.hero.ctaLabel}</span></div>
        <div><p className="text-xs font-black uppercase tracking-[0.18em] text-white/40">About</p><h4 className="mt-2 text-xl font-black">{generated.about.heading}</h4><p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">{generated.about.body}</p></div>
        <div className="grid gap-3 md:grid-cols-2"><div className="rounded-2xl border border-white/10 p-4"><p className="text-xs font-black uppercase tracking-[0.18em] text-white/40">SEO title</p><p className="mt-2 text-sm font-bold">{generated.seo.title}</p></div><div className="rounded-2xl border border-white/10 p-4"><p className="text-xs font-black uppercase tracking-[0.18em] text-white/40">SEO description</p><p className="mt-2 text-sm text-white/65">{generated.seo.description}</p></div></div>
      </div>
    </div> : null}

    {message ? <p className="mt-4 text-sm font-bold text-white/70">{message}</p> : null}
  </section>;
}
