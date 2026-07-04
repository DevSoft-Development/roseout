"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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

export default function LocationEditorMarketingPanel({ context, form }: { context: LocationEditorContext; form: Record<string, any> }) {
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const links = useMemo(() => buildLocationEditorLinks({ type: context.type as LocationType, locationId: context.locationId, canonicalId: context.canonicalId, sourceId: context.sourceId, effectiveId: context.effectiveLocationId, adminLocationId: context.adminLocationId, adminContext: context.isAdminContext, isDemoMode: context.isDemoMode, fromDemoCenter: context.fromDemoCenter }), [context]);
  const contextParams = new URLSearchParams();
  contextParams.set("locationId", context.effectiveLocationId);
  if (context.adminLocationId || context.isAdminContext) contextParams.set("adminLocationId", context.adminLocationId || context.effectiveLocationId);
  contextParams.set("type", context.type === "activities" ? "activity" : "restaurant");
  if (context.isDemoMode) { contextParams.set("demo", "1"); contextParams.set("fromDemoCenter", "1"); }
  else if (context.isAdminContext) contextParams.set("adminLocationMode", "1");
  async function generate() {
    setLoading(true); setMessage(""); setDraft("");
    try {
      const res = await fetch("/api/business/marketing/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locationId: context.effectiveLocationId, name: form.name, category: form.category || form.primary_category || form.cuisine || form.activity_type, neighborhood: form.neighborhood || form.city, description: form.description }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || json.error || "Marketing draft could not be generated.");
      const text = json.copy || json.draft || json.content || json.text || json.result || "";
      setDraft(typeof text === "string" ? text : "A marketing draft was generated. Open Marketing Studio to review it.");
    } catch (e:any) { setMessage(e.message || "Marketing draft could not be generated."); }
    finally { setLoading(false); }
  }
  return <div className="grid gap-4"><div className="rounded-3xl border border-white/10 bg-black/25 p-5"><h3 className="text-xl font-black">Marketing copy for this selected location</h3><p className="mt-2 text-sm text-white/55">Generate draft copy using the current location profile, then refine it in Marketing Studio.</p><button type="button" onClick={generate} disabled={loading} className="mt-4 rounded-full bg-rose-600 px-5 py-3 text-sm font-black disabled:opacity-60">{loading ? "Generating…" : "Generate marketing draft"}</button>{message ? <p className="mt-3 text-sm font-bold text-amber-100">{message}</p> : null}{draft ? <div className="mt-4 rounded-2xl border border-white/10 bg-white/[.04] p-4"><p className="whitespace-pre-wrap text-sm leading-6 text-white/75">{draft}</p><button type="button" onClick={() => navigator.clipboard?.writeText(draft)} className="mt-4 rounded-full border border-white/10 px-4 py-2 text-xs font-black">Copy draft</button></div> : null}</div><div className="grid gap-3 sm:grid-cols-2"><Link href={links.marketing} className="rounded-3xl border border-white/10 bg-white/[.04] p-4 font-black hover:bg-white/[.08]">Open Growth Pro Marketing Studio</Link>{modules.map(([label, href]) => <Link key={href} href={`${href}?${contextParams.toString()}`} className="rounded-3xl border border-white/10 bg-white/[.04] p-4 font-black hover:bg-white/[.08]">{label}</Link>)}</div></div>;
}
