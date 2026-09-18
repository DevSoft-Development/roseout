"use client";

import { useEffect, useMemo, useState } from "react";

type Campaign = {
  id: string;
  location_name: string;
  location_city: string | null;
  location_state: string | null;
  name: string;
  placements: string[];
  status: string;
  total_budget_cents: number;
  spent_cents: number;
  starts_at: string | null;
  ends_at: string | null;
  metrics: { impressions: number; engagements: number; conversions: number; spend_cents: number; attributed_revenue_cents: number; funded_cents: number; refunded_cents: number };
};

type Totals = { campaigns: number; live: number; spend_cents: number; impressions: number; engagements: number; conversions: number; attributed_revenue_cents: number; refunded_cents: number };
const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format((cents || 0) / 100);

export default function PromotionsAdminClient() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [totals, setTotals] = useState<Totals>({ campaigns: 0, live: 0, spend_cents: 0, impressions: 0, engagements: 0, conversions: 0, attributed_revenue_cents: 0, refunded_cents: 0 });
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function load() {
    const res = await fetch("/api/admin/marketing/promotions", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) { setCampaigns(data.campaigns || []); setTotals(data.totals || {}); }
    else setMessage(data.error || "Could not load sponsored promotions.");
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  const visible = useMemo(() => campaigns.filter((campaign) => {
    if (filter !== "all" && campaign.status !== filter) return false;
    const haystack = `${campaign.location_name} ${campaign.name} ${campaign.location_city || ""} ${campaign.location_state || ""}`.toLowerCase();
    return !query.trim() || haystack.includes(query.trim().toLowerCase());
  }), [campaigns, filter, query]);

  async function action(id: string, actionName: "pause" | "resume") {
    const res = await fetch("/api/admin/marketing/promotions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action: actionName }) });
    const data = await res.json().catch(() => ({}));
    setMessage(res.ok ? `Campaign ${actionName === "pause" ? "paused" : "resumed"}.` : data.error || "Campaign update failed.");
    if (res.ok) await load();
  }

  return (
    <section className="mt-7 space-y-6">
      {message ? <div className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-bold text-white/75">{message}</div> : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
        <Metric label="Campaigns" value={String(totals.campaigns)} /><Metric label="Live / scheduled" value={String(totals.live)} /><Metric label="Ad spend" value={money(totals.spend_cents)} /><Metric label="Impressions" value={totals.impressions.toLocaleString()} /><Metric label="Engagements" value={totals.engagements.toLocaleString()} /><Metric label="Conversions" value={totals.conversions.toLocaleString()} /><Metric label="Attributed revenue" value={money(totals.attributed_revenue_cents)} /><Metric label="Refunded" value={money(totals.refunded_cents)} />
      </div>

      <div className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-white/[0.03] p-4 md:flex-row md:items-center md:justify-between">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search location or campaign" className="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm outline-none focus:border-[#e1062a]/60 md:max-w-md" />
        <div className="flex flex-wrap gap-2">{["all","active","scheduled","paused","pending_funding","completed","cancelled"].map((value) => <button key={value} onClick={() => setFilter(value)} className={`rounded-full px-3 py-2 text-[11px] font-black uppercase tracking-[0.1em] ${filter === value ? "bg-[#e1062a]" : "border border-white/10 bg-white/[0.04] text-white/50"}`}>{value.replaceAll("_", " ")}</button>)}</div>
      </div>

      {loading ? <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-white/40">Loading campaigns…</div> : visible.length === 0 ? <div className="rounded-3xl border border-dashed border-white/15 p-10 text-center text-white/45">No campaigns match this view.</div> : <div className="overflow-x-auto rounded-3xl border border-white/10 bg-white/[0.025]"><table className="min-w-[1100px] w-full text-left text-sm"><thead className="border-b border-white/10 bg-white/[0.03] text-[10px] font-black uppercase tracking-[0.14em] text-white/35"><tr><th className="p-4">Location / campaign</th><th className="p-4">Status</th><th className="p-4">Placement</th><th className="p-4">Budget</th><th className="p-4">Spend</th><th className="p-4">Reach</th><th className="p-4">Engagement</th><th className="p-4">Conversions</th><th className="p-4">Revenue</th><th className="p-4">Control</th></tr></thead><tbody>{visible.map((campaign) => <tr key={campaign.id} className="border-b border-white/[0.06] last:border-0"><td className="p-4"><p className="font-black">{campaign.location_name}</p><p className="mt-1 text-xs text-white/40">{campaign.name} · {[campaign.location_city,campaign.location_state].filter(Boolean).join(", ")}</p></td><td className="p-4"><span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[10px] font-black uppercase">{campaign.status.replaceAll("_", " ")}</span></td><td className="p-4 text-white/60">{campaign.placements.join(" + ")}</td><td className="p-4 font-bold">{money(campaign.total_budget_cents)}</td><td className="p-4 font-bold">{money(campaign.metrics?.spend_cents || campaign.spent_cents)}</td><td className="p-4">{Number(campaign.metrics?.impressions || 0).toLocaleString()}</td><td className="p-4">{Number(campaign.metrics?.engagements || 0).toLocaleString()}</td><td className="p-4">{Number(campaign.metrics?.conversions || 0).toLocaleString()}</td><td className="p-4 font-bold">{money(campaign.metrics?.attributed_revenue_cents || 0)}</td><td className="p-4">{campaign.status === "active" || campaign.status === "scheduled" ? <button onClick={() => action(campaign.id, "pause")} className="rounded-full border border-white/10 px-3 py-2 text-xs font-black">Pause</button> : campaign.status === "paused" ? <button onClick={() => action(campaign.id, "resume")} className="rounded-full border border-white/10 px-3 py-2 text-xs font-black">Resume</button> : <span className="text-xs text-white/25">—</span>}</td></tr>)}</tbody></table></div>}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><p className="text-[10px] font-black uppercase tracking-[0.15em] text-white/35">{label}</p><p className="mt-2 text-2xl font-black">{value}</p></div>; }
