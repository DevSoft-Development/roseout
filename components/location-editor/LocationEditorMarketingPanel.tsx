"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { LocationEditorContext } from "./location-editor-context";
import { buildLocationEditorLinks, type LocationType } from "@/lib/location-editor-links";

const modules = [
  ["Promotions", "/business/dashboard/promotions"],
  ["Offers", "/business/dashboard/offers"],
  ["VIP List", "/business/dashboard/vip"],
  ["Leads", "/business/dashboard/leads"],
  ["Messaging", "/business/dashboard/messaging"],
  ["Analytics", "/business/dashboard/analytics"],
  ["QR Codes", "/business/dashboard/qr-codes"],
] as const;

const fieldClass = "rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm font-bold text-white outline-none placeholder:text-white/30 focus:border-[#ff2142]/60 focus:ring-4 focus:ring-[#ff2142]/10";

export default function LocationEditorMarketingPanel({ context, form }: { context: LocationEditorContext; form: Record<string, any> }) {
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [contentType, setContentType] = useState("Email");
  const [heroImageUrl, setHeroImageUrl] = useState(String(form.main_image || form.image_url || ""));
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const links = useMemo(() => buildLocationEditorLinks({ type: context.type as LocationType, locationId: context.locationId, canonicalId: context.canonicalId, sourceId: context.sourceId, effectiveId: context.effectiveLocationId, adminLocationId: context.adminLocationId, adminContext: context.isAdminContext, isDemoMode: context.isDemoMode, fromDemoCenter: context.fromDemoCenter }), [context]);
  const contextParams = new URLSearchParams();
  contextParams.set("locationId", context.effectiveLocationId);
  if (context.adminLocationId || context.isAdminContext) contextParams.set("adminLocationId", context.adminLocationId || context.effectiveLocationId);
  contextParams.set("type", context.type === "activities" ? "activity" : "restaurant");
  if (context.isDemoMode) { contextParams.set("demo", "1"); contextParams.set("fromDemoCenter", "1"); }
  else if (context.isAdminContext) contextParams.set("adminLocationMode", "1");

  useEffect(() => { setHeroImageUrl(String(form.main_image || form.image_url || "")); }, [form.main_image, form.image_url]);
  useEffect(() => { let cancelled=false; fetch(`/api/business/marketing/suggestions?${contextParams.toString()}`, { cache: "no-store" }).then(async r => ({r,json: await r.json().catch(()=>({}))})).then(({r,json}) => { if(!cancelled && r.ok) setSuggestions(json.suggestions || []); if(!cancelled && !r.ok) setMessage(json.message || "Marketing suggestions could not be loaded."); }).catch(()=>{}); return () => { cancelled=true; }; }, [context.effectiveLocationId, context.adminLocationId, context.isDemoMode]);

  async function generate() {
    setLoading(true); setMessage(""); setDraft("");
    try {
      const res = await fetch("/api/business/marketing/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locationId: context.effectiveLocationId, adminLocationId: context.adminLocationId || (context.isAdminContext ? context.effectiveLocationId : undefined), sourceId: context.sourceId, type: context.type, demo: context.isDemoMode, fromDemoCenter: context.fromDemoCenter, contentType, heroImageUrl, name: form.name, category: form.category || form.primary_category || form.cuisine || form.activity_type, neighborhood: form.neighborhood || form.city, description: form.description }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || json.error || "Marketing draft could not be generated.");
      const text = json.copy || json.draft || json.content || json.text || json.result || "";
      setDraft(typeof text === "string" ? text : "A marketing draft was generated. Open Marketing Studio to review it.");
    } catch (e:any) { setMessage(e.message || "Marketing draft could not be generated."); }
    finally { setLoading(false); }
  }

  const emailSubject = `${form.name || "This location"}: fresh plans for your next visit`;
  const emailBody = draft || `Join us at ${form.name || "this location"} for ${form.category || form.cuisine || form.activity_type || "a memorable experience"}. ${form.description || "Great food, great company, and unforgettable nights."}`;

  return <div className="grid gap-5 2xl:grid-cols-[minmax(0,.95fr)_minmax(0,1.05fr)]">
    <div className="space-y-5">
      <section className="rounded-3xl border border-white/10 bg-black/25 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div><h3 className="text-xl font-black">Marketing copy for this selected location</h3><p className="mt-2 text-sm text-white/55">Generate campaign copy, attach a menu item or promo image, and preview the full email before sending.</p></div>
          <button type="button" onClick={generate} disabled={loading} className="rounded-2xl bg-gradient-to-r from-[#e1062a] to-[#ff2142] px-5 py-3 text-sm font-black text-white disabled:opacity-60">{loading ? "Generating…" : "Generate draft"}</button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-2 text-xs font-black uppercase tracking-[0.18em] text-white/45">Content Type<select value={contentType} onChange={(e)=>setContentType(e.target.value)} className={fieldClass}><option>Email</option><option>Instagram caption</option><option>TikTok caption</option><option>SMS</option><option>Offer/promo</option></select></label>
          <label className="grid gap-2 text-xs font-black uppercase tracking-[0.18em] text-white/45">Campaign Image URL<input value={heroImageUrl} onChange={(e)=>setHeroImageUrl(e.target.value)} placeholder="Menu item, drink, room, or event image URL" className={fieldClass}/></label>
        </div>
        {heroImageUrl ? <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-white/[.04]"><Image src={heroImageUrl} alt="Campaign image preview" width={900} height={360} className="h-56 w-full object-cover" unoptimized /></div> : <div className="mt-4 rounded-2xl border border-dashed border-white/15 bg-white/[.03] p-6 text-sm font-bold text-white/40">Add a photo URL to include a menu item, drink, interior, offer, or event image in the email preview.</div>}
        {suggestions.length ? <div className="mt-4 grid gap-2 sm:grid-cols-2">{suggestions.map((s:any)=><div key={s.title} className="rounded-2xl border border-white/10 bg-white/[.04] p-3"><p className="font-black">{s.title}</p><p className="text-xs text-white/50">{s.channel} • {s.cta}</p></div>)}</div> : null}
        {message ? <p className="mt-3 text-sm font-bold text-amber-100">{message}</p> : null}
        {draft ? <div className="mt-4 rounded-2xl border border-white/10 bg-white/[.04] p-4"><p className="text-xs font-black uppercase tracking-[0.18em] text-white/35">Generated copy</p><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-white/75">{draft}</p><button type="button" onClick={() => navigator.clipboard?.writeText(draft)} className="mt-4 rounded-full border border-white/10 px-4 py-2 text-xs font-black">Copy draft</button></div> : null}
      </section>

      <div className="grid gap-3 sm:grid-cols-2"><Link href={links.marketing} className="rounded-3xl border border-white/10 bg-white/[.04] p-4 font-black hover:bg-white/[.08]">Open Growth Pro Marketing Studio</Link>{modules.map(([label, href]) => <Link key={href} href={`${href}?${contextParams.toString()}`} className="rounded-3xl border border-white/10 bg-white/[.04] p-4 font-black hover:bg-white/[.08]">{label}</Link>)}</div>
    </div>

    <section className="rounded-3xl border border-white/10 bg-[#10141b] p-5 shadow-xl shadow-black/20">
      <div className="flex items-start justify-between gap-3"><div><h3 className="text-xl font-black">Full Email Preview</h3><p className="mt-2 text-sm text-white/50">Shows the image, subject, body, and CTA together.</p></div><span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-xs font-black text-emerald-200">Preview</span></div>
      <div className="mt-5 overflow-hidden rounded-[28px] border border-white/10 bg-white text-black">
        <div className="bg-[#050607] px-6 py-4 text-center"><img src="/toh_logo.png" alt="TheOutHaven" className="mx-auto h-8 w-auto object-contain" /></div>
        {heroImageUrl ? <Image src={heroImageUrl} alt="Email hero" width={900} height={420} className="h-64 w-full object-cover" unoptimized /> : <div className="grid h-48 place-items-center bg-neutral-200 text-sm font-black text-neutral-500">Campaign image preview</div>}
        <div className="p-7">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#e1062a]">{emailSubject}</p>
          <h4 className="mt-3 text-3xl font-black leading-tight">Good food. Great company. Unforgettable nights.</h4>
          <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-neutral-700">{emailBody}</p>
          <button type="button" className="mt-6 rounded-2xl bg-[#ff2142] px-5 py-3 text-sm font-black text-white">Reserve Your Table</button>
        </div>
      </div>
    </section>
  </div>;
}
