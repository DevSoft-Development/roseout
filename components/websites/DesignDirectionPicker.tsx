"use client";

import { useState } from "react";
import { WEBSITE_DESIGN_DIRECTIONS } from "@/lib/websites/design-directions";

export function DesignDirectionPicker({ locationId }: { locationId: string }) {
  const [vision, setVision] = useState("");
  const [matches, setMatches] = useState<Array<{ id: string; confidence: string; reason?: string }>>([]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function match() {
    setBusy(true); setMessage("");
    const response = await fetch("/api/business/website/design-direction", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ location_id: locationId, vision }) });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setMessage(data?.error || "Unable to match your vision.");
    setMatches(data.matches || []); setSelected(data.matches?.[0]?.id || "");
  }

  async function confirm() {
    const direction = WEBSITE_DESIGN_DIRECTIONS.find((item) => item.id === selected);
    if (!direction) return;
    setBusy(true); setMessage("");
    const response = await fetch("/api/business/website", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ location_id: locationId, theme: { design_direction_id: direction.id, ...direction.theme }, custom_content: { design_vision: vision } }) });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setMessage(data?.error || "Unable to save your design direction.");
    setMessage("Design direction saved. AI copy personalization is the next step.");
  }

  return <section className="rounded-3xl border border-white/10 bg-black/25 p-5">
    <h3 className="text-xl font-black">Describe your website</h3>
    <p className="mt-2 text-sm leading-6 text-white/60">Tell us how you want it to feel. We will match your vision to an approved design direction. No AI images are generated.</p>
    <textarea value={vision} onChange={(event) => setVision(event.target.value)} maxLength={1200} placeholder="Upscale, dark, romantic, with large food photography and a luxury feel." className="mt-4 min-h-28 w-full rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white" />
    <button type="button" onClick={match} disabled={busy || vision.trim().length < 10} className="mt-3 rounded-full bg-rose-600 px-5 py-3 text-sm font-black disabled:opacity-40">{busy ? "Working..." : "Match my vision"}</button>
    {matches.length ? <div className="mt-5 space-y-3">{matches.map((match, index) => { const direction = WEBSITE_DESIGN_DIRECTIONS.find((item) => item.id === match.id); if (!direction) return null; return <label key={match.id} className="block rounded-2xl border border-white/10 bg-white/[0.04] p-4"><div className="flex gap-3"><input type="radio" name="design-direction" checked={selected === match.id} onChange={() => setSelected(match.id)} /><div><p className="font-black">{index === 0 ? "Best match — " : "Alternative — "}{direction.name}</p><p className="mt-1 text-sm text-white/60">{direction.summary}</p></div></div></label>; })}<button type="button" onClick={confirm} disabled={busy || !selected} className="rounded-full bg-[#f5b700] px-5 py-3 text-sm font-black text-black disabled:opacity-40">Use this direction</button></div> : null}
    {message ? <p className="mt-4 text-sm font-bold text-white/70">{message}</p> : null}
  </section>;
}
