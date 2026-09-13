"use client";

import { useEffect, useState } from "react";

type Props = { locationId: string; range: string };

export default function WebsiteTrackingPanel({ locationId, range }: Props) {
  const [setup, setSetup] = useState<any>(null);
  const [conversion, setConversion] = useState<any>(null);
  const [origin, setOrigin] = useState("");
  const [averageValue, setAverageValue] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!locationId) return;
    Promise.all([
      fetch(`/api/business/website-tracking?location_id=${encodeURIComponent(locationId)}`).then(async (r) => ({ ok: r.ok, body: await r.json() })),
      fetch(`/api/business/conversion-analytics?location_id=${encodeURIComponent(locationId)}&range=${encodeURIComponent(range)}`).then(async (r) => ({ ok: r.ok, body: await r.json() })),
    ]).then(([tracking, analytics]) => {
      setSetup(tracking.body);
      if (tracking.body?.config?.allowed_origins?.[0]) setOrigin(tracking.body.config.allowed_origins[0]);
      if (tracking.body?.config?.average_customer_value != null) setAverageValue(String(tracking.body.config.average_customer_value));
      setConversion(analytics.body);
    }).catch(() => undefined);
  }, [locationId, range]);

  async function save() {
    setMessage("Saving…");
    const response = await fetch("/api/business/website-tracking", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ location_id: locationId, allowed_origins: origin ? [origin] : [], average_customer_value: averageValue || null, enabled: true }),
    });
    const body = await response.json();
    setMessage(response.ok ? "Saved. Add the tracking code to your site, then visit the site to verify it." : body?.error || "Could not save settings.");
    if (response.ok) setSetup((current: any) => ({ ...current, config: body.config }));
  }

  if (!locationId) return null;
  if (setup?.error && setup?.error.includes("Essentials")) {
    return <section className="mt-6 toh-card rounded-3xl p-6"><p className="text-xs font-black uppercase tracking-[0.16em] text-[#ff6b86]">Essentials</p><h2 className="mt-2 text-2xl font-black">Unlock Conversion Tracking</h2><p className="toh-muted mt-2 text-sm">See what customers do after TheOutHaven sends them to your website, including reservation, menu, call, directions, order, and contact actions.</p><p className="mt-4 text-sm font-black">Included with the $99/month Essentials plan.</p></section>;
  }

  const f = conversion?.funnel || {};
  const v = conversion?.value || {};

  return (
    <section className="mt-6 space-y-6">
      <div className="toh-card rounded-3xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-xs font-black uppercase tracking-[0.16em] text-[#ff6b86]">Website Conversion Tracking</p><h2 className="mt-2 text-2xl font-black">See what happens after customers leave TheOutHaven</h2><p className="toh-muted mt-2 max-w-3xl text-sm">Connect your existing website once. TheOutHaven will measure privacy-safe conversion actions without collecting form contents, payment information, or passwords.</p></div>
          <span className={`rounded-full px-3 py-1 text-xs font-black ${conversion?.tracking?.connected ? "bg-emerald-500/15 text-emerald-300" : "bg-white/10 text-white/50"}`}>{conversion?.tracking?.connected ? "Connected" : "Not verified"}</span>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <label className="text-sm font-bold">Website origin<input value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="https://yourbusiness.com" className="toh-glass mt-2 w-full rounded-2xl px-4 py-3 text-sm" /></label>
          <label className="text-sm font-bold">Average customer value <span className="toh-muted font-normal">(optional)</span><input value={averageValue} onChange={(e) => setAverageValue(e.target.value)} inputMode="decimal" placeholder="75" className="toh-glass mt-2 w-full rounded-2xl px-4 py-3 text-sm" /></label>
        </div>
        <button onClick={save} className="mt-4 rounded-full bg-[#e1062a] px-5 py-3 text-sm font-black text-white">Save tracking settings</button>
        {message && <p className="toh-muted mt-3 text-sm">{message}</p>}
        {setup?.snippet && <div className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-4"><div className="flex items-center justify-between gap-3"><p className="text-sm font-black">Install once in your website header</p><button onClick={() => navigator.clipboard.writeText(setup.snippet)} className="rounded-full border border-white/15 px-3 py-1 text-xs font-black">Copy code</button></div><code className="mt-3 block overflow-x-auto whitespace-pre-wrap break-all text-xs text-white/60">{setup.snippet}</code><p className="toh-muted mt-3 text-xs">Works with WordPress, Wix, Squarespace, Toast sites, Shopify, and custom websites where custom scripts are allowed.</p></div>}
      </div>

      <div className="toh-card rounded-3xl p-6">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[#ff6b86]">Your TheOutHaven Impact</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[["Attributed website visits", f.attributed_outbound_visits || 0],["Website sessions", f.website_sessions || 0],["High-intent actions", f.high_intent_actions || 0],["Reservation actions", f.reservation_actions || 0]].map(([label,value]) => <div key={String(label)} className="toh-glass rounded-2xl p-4"><p className="toh-muted text-xs uppercase tracking-[0.12em]">{label}</p><p className="mt-2 text-3xl font-black">{Number(value).toLocaleString()}</p></div>)}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[["Menu views",f.menu_views],["Calls",f.calls],["Directions",f.directions],["Orders",f.orders],["Contact actions",f.contact_submits]].map(([label,value]) => <div key={String(label)} className="rounded-2xl border border-white/10 p-4"><p className="toh-muted text-xs">{label}</p><p className="mt-1 text-xl font-black">{Number(value || 0).toLocaleString()}</p></div>)}
        </div>
        {v.estimated_customer_value > 0 && <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5"><p className="toh-muted text-xs uppercase tracking-[0.12em]">Estimated customer value</p><p className="mt-1 text-3xl font-black">${Number(v.estimated_customer_value).toLocaleString()}</p><p className="toh-muted mt-1 text-xs">Based on your ${Number(v.average_customer_value || 0).toLocaleString()} average customer value and tracked reservation actions. This is an estimate, not confirmed revenue.</p>{v.estimated_plan_multiple && <p className="mt-3 text-sm font-black">Estimated value equals {v.estimated_plan_multiple}× the $99 monthly Essentials cost.</p>}</div>}
      </div>

      <div className="toh-card rounded-3xl p-6"><p className="text-xs font-black uppercase tracking-[0.16em] text-[#ff6b86]">Customer Demand</p><h2 className="mt-2 text-xl font-black">What customers were looking for</h2><div className="mt-4 space-y-2">{(conversion?.demand || []).map((item: any) => <div key={item.query} className="flex items-center justify-between gap-4 border-b border-white/10 py-2 text-sm"><span>{item.query}</span><span className="toh-muted font-black">{item.searches}</span></div>)}{!conversion?.demand?.length && <p className="toh-muted text-sm">Demand insights will appear as customers discover this location through TheOutHaven.</p>}</div></div>
    </section>
  );
}
