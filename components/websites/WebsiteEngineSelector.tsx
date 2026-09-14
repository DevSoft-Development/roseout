"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  WEBSITE_V3_CONCEPTS,
  type WebsiteRendererVersion,
  type WebsiteV3ConceptId,
} from "@/lib/websites/v3/catalog";

export function WebsiteEngineSelector({
  locationId,
  initialRenderer,
  initialConcept,
}: {
  locationId: string;
  initialRenderer: WebsiteRendererVersion;
  initialConcept: WebsiteV3ConceptId;
}) {
  const router = useRouter();
  const [renderer, setRenderer] = useState<WebsiteRendererVersion>(initialRenderer);
  const [concept, setConcept] = useState<WebsiteV3ConceptId>(initialConcept);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function save(nextRenderer: WebsiteRendererVersion, nextConcept = concept) {
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/business/website", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        location_id: locationId,
        theme: {
          renderer_version: nextRenderer,
          v3_concept: nextConcept,
        },
      }),
    });
    const data = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setMessage(data?.error || "We could not save the website engine choice.");
      return;
    }
    setRenderer(nextRenderer);
    setConcept(nextConcept);
    setMessage(nextRenderer === "v3" ? "V3 Premium selected for this location." : "Legacy website engine selected.");
    router.refresh();
  }

  return (
    <section className="mb-5 rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ff2142]">Website engine</p>
          <h2 className="mt-2 text-xl font-black">Choose which website system this location uses</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">V3 is the new from-scratch premium engine. Your current website remains intact, and you can switch back to Legacy at any time.</p>
        </div>
        <span className={`rounded-full border px-3 py-2 text-xs font-black ${renderer === "v3" ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100" : "border-white/10 bg-black/30 text-white/60"}`}>{renderer === "v3" ? "V3 Premium selected" : "Legacy selected"}</span>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <button type="button" disabled={saving} onClick={() => void save("v3", concept)} className={`rounded-2xl border p-5 text-left transition ${renderer === "v3" ? "border-[#ff2142]/50 bg-[#ff2142]/10" : "border-white/10 bg-black/20 hover:bg-white/[0.05]"}`}>
          <div className="flex items-center justify-between gap-3"><span className="text-lg font-black">V3 — Premium</span><span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-200">New</span></div>
          <p className="mt-2 text-sm leading-6 text-white/55">Clean-room premium renderer with independent concepts and no dependency on the old template foundation.</p>
        </button>
        <button type="button" disabled={saving} onClick={() => void save("legacy", concept)} className={`rounded-2xl border p-5 text-left transition ${renderer === "legacy" ? "border-white/30 bg-white/[0.08]" : "border-white/10 bg-black/20 hover:bg-white/[0.05]"}`}>
          <div className="text-lg font-black">Current — Legacy</div>
          <p className="mt-2 text-sm leading-6 text-white/55">Keeps the existing website builder, templates, preview, and publish flow unchanged.</p>
        </button>
      </div>

      {renderer === "v3" ? <div className="mt-6">
        <div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-sm font-black">Choose your V3 concept</p><p className="mt-1 text-xs text-white/45">All five flagship concepts now have live previews built from this location&apos;s business data.</p></div><span className="text-[11px] font-black uppercase tracking-[0.12em] text-amber-200">Preview-only rollout</span></div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {WEBSITE_V3_CONCEPTS.map((item) => {
            const active = concept === item.id;
            const ready = item.status === "preview_ready";
            return <button key={item.id} type="button" disabled={saving} onClick={() => void save("v3", item.id)} className={`rounded-2xl border p-4 text-left transition ${active ? "border-[#ff2142]/50 bg-[#ff2142]/10" : "border-white/10 bg-black/20 hover:bg-white/[0.05]"}`}>
              <div className="flex items-center justify-between gap-2"><span className="font-black">{item.name}</span><span className={`text-[9px] font-black uppercase tracking-[0.1em] ${ready ? "text-emerald-200" : "text-white/35"}`}>{ready ? "Preview ready" : "In development"}</span></div>
              <p className="mt-2 text-xs leading-5 text-white/50">{item.description}</p>
              <p className="mt-3 text-[10px] leading-4 text-white/35">Best for: {item.bestFor}</p>
            </button>;
          })}
        </div>
      </div> : null}

      <div className="mt-4 min-h-5 text-xs font-bold text-white/50">{saving ? "Saving website engine…" : message}</div>
    </section>
  );
}
