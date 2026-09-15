"use client";

import { useEffect, useMemo, useState } from "react";

type Campaign = {
  id: string;
  name: string;
  promotion_type: string;
  placements: string[];
  status: string;
  total_budget_cents: number;
  spent_cents: number;
  starts_at: string | null;
  ends_at: string | null;
  metrics?: Record<string, number>;
};

type Draft = {
  promotion_type: "location" | "outing" | "event" | "experience";
  placements: string[];
  audience_mode: "auto" | "manual";
  audience: string;
  total_budget_cents: number;
  daily_budget_cents: number | null;
  starts_at: string;
  ends_at: string;
  headline: string;
  description: string;
};

const STEPS = ["Promote", "Placement", "Audience", "Budget", "Preview & launch"];
const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format((cents || 0) / 100);

export default function PromotionCenterClient({ locationId, funded, campaignId }: { locationId: string; funded: boolean; campaignId: string }) {
  const [step, setStep] = useState(1);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [locationName, setLocationName] = useState("Your location");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState<Draft>({
    promotion_type: "location",
    placements: ["discover", "search"],
    audience_mode: "auto",
    audience: "",
    total_budget_cents: 25000,
    daily_budget_cents: null,
    starts_at: "",
    ends_at: "",
    headline: "",
    description: "",
  });

  async function load() {
    if (!locationId) { setLoading(false); return; }
    const res = await fetch(`/api/business/promotions?locationId=${encodeURIComponent(locationId)}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) { setCampaigns(data.campaigns || []); setLocationName(data.location?.name || "Your location"); }
    else setMessage(data.error || "Could not load promotions.");
    setLoading(false);
  }

  useEffect(() => { void load(); }, [locationId]);
  useEffect(() => {
    if (!funded || !campaignId || !locationId) return;
    fetch("/api/business/promotions/fund/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campaign_id: campaignId, location_id: locationId }) })
      .then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }))
      .then(({ ok, data }) => { setMessage(ok ? "Your promotion is ready to run." : data.error || "We could not confirm campaign funding."); void load(); });
  }, [funded, campaignId, locationId]);

  const totals = useMemo(() => campaigns.reduce((acc, campaign) => {
    acc.spend += Number(campaign.spent_cents || 0);
    acc.impressions += Number(campaign.metrics?.impressions || 0);
    acc.engagements += Number(campaign.metrics?.clicks || 0) + Number(campaign.metrics?.outing_opens || 0) + Number(campaign.metrics?.profile_views || 0);
    acc.actions += Number(campaign.metrics?.reservation_clicks || 0) + Number(campaign.metrics?.calls || 0) + Number(campaign.metrics?.bookings || 0);
    acc.revenue += Number(campaign.metrics?.attributed_revenue_cents || 0);
    return acc;
  }, { spend: 0, impressions: 0, engagements: 0, actions: 0, revenue: 0 }), [campaigns]);

  function togglePlacement(value: string) {
    setDraft((current) => ({ ...current, placements: current.placements.includes(value) ? current.placements.filter((v) => v !== value) : [...current.placements, value] }));
  }

  async function launch() {
    if (!locationId) return;
    setSaving(true); setMessage("");
    const res = await fetch("/api/business/promotions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      location_id: locationId,
      name: `${locationName} promotion`,
      promotion_type: draft.promotion_type,
      placements: draft.placements,
      audience_mode: draft.audience_mode,
      targeting: draft.audience_mode === "manual" ? { audience_text: draft.audience } : { optimized_by_theouthaven: true },
      total_budget_cents: draft.total_budget_cents,
      daily_budget_cents: draft.daily_budget_cents,
      starts_at: draft.starts_at || null,
      ends_at: draft.ends_at || null,
      creative: { headline: draft.headline || locationName, description: draft.description || null },
    }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setMessage(data.error || "Could not create promotion."); setSaving(false); return; }
    const fund = await fetch("/api/business/promotions/fund", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campaign_id: data.campaign.id, location_id: locationId }) });
    const funding = await fund.json().catch(() => ({}));
    if (!fund.ok || !funding.url) { setMessage(funding.error || "Promotion created, but funding could not start."); setSaving(false); await load(); return; }
    window.location.href = funding.url;
  }

  async function action(campaign: Campaign, actionName: "pause" | "resume" | "cancel") {
    const confirmCancel = actionName !== "cancel" || window.confirm("End this promotion? Any unused funded budget will be returned to the original payment method.");
    if (!confirmCancel) return;
    const res = await fetch("/api/business/promotions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: campaign.id, location_id: locationId, action: actionName }) });
    const data = await res.json().catch(() => ({}));
    setMessage(res.ok ? (actionName === "cancel" ? `Promotion ended. ${money(data.refunded_cents || 0)} unused budget returned.` : `Promotion ${actionName === "pause" ? "paused" : "resumed"}.`) : data.error || "Could not update promotion.");
    await load();
  }

  if (!locationId) return <main className="min-h-screen bg-[#050607] p-6 text-white"><div className="mx-auto max-w-5xl rounded-3xl border border-white/10 bg-white/[0.04] p-7"><h1 className="text-3xl font-black">Promotion Center</h1><p className="mt-3 text-white/55">Open Promotions from a location workspace so TheOutHaven knows which business you want to promote.</p></div></main>;

  return (
    <main className="min-h-screen bg-[#050607] px-4 py-8 text-white sm:px-6">
      <div className="mx-auto max-w-6xl space-y-8">
        <header><p className="text-xs font-black uppercase tracking-[0.25em] text-[#ff7188]">Marketing & growth</p><h1 className="mt-2 text-4xl font-black tracking-tight">Promotion Center</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-white/50">Create sponsored placements without learning an ad platform. Tell us what you want to promote, where you want to appear, and your budget. TheOutHaven handles eligibility and delivery.</p></header>
        {message ? <div className="rounded-2xl border border-[#e1062a]/30 bg-[#e1062a]/10 px-4 py-3 text-sm font-bold">{message}</div> : null}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Metric label="Spend" value={money(totals.spend)} /><Metric label="People reached" value={totals.impressions.toLocaleString()} /><Metric label="Outing / profile views" value={totals.engagements.toLocaleString()} /><Metric label="Reservation actions" value={totals.actions.toLocaleString()} /><Metric label="Attributed revenue" value={money(totals.revenue)} />
        </section>

        <section className="rounded-[2rem] border border-white/10 bg-[#0b0d10] p-5 sm:p-7">
          <div className="flex gap-2 overflow-x-auto pb-2">{STEPS.map((label, index) => <button key={label} onClick={() => index + 1 < step && setStep(index + 1)} className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-black ${step === index + 1 ? "bg-[#e1062a] text-white" : index + 1 < step ? "bg-white/10 text-white/75" : "bg-white/[0.04] text-white/30"}`}>{index + 1}. {label}</button>)}</div>
          <div className="mt-7 min-h-[330px]">
            {step === 1 ? <StepPromote draft={draft} setDraft={setDraft} /> : null}
            {step === 2 ? <StepPlacement draft={draft} togglePlacement={togglePlacement} /> : null}
            {step === 3 ? <StepAudience draft={draft} setDraft={setDraft} /> : null}
            {step === 4 ? <StepBudget draft={draft} setDraft={setDraft} /> : null}
            {step === 5 ? <StepPreview draft={draft} setDraft={setDraft} locationName={locationName} /> : null}
          </div>
          <div className="mt-6 flex items-center justify-between gap-3 border-t border-white/10 pt-5"><button disabled={step === 1} onClick={() => setStep((s) => Math.max(1, s - 1))} className="rounded-full border border-white/10 px-5 py-3 text-sm font-black disabled:opacity-25">Back</button>{step < 5 ? <button disabled={step === 2 && draft.placements.length === 0} onClick={() => setStep((s) => Math.min(5, s + 1))} className="rounded-full bg-white px-6 py-3 text-sm font-black text-black disabled:opacity-30">Continue</button> : <button disabled={saving || draft.placements.length === 0} onClick={launch} className="rounded-full bg-[#e1062a] px-6 py-3 text-sm font-black disabled:opacity-40">{saving ? "Starting…" : `Fund & launch · ${money(draft.total_budget_cents)}`}</button>}</div>
        </section>

        <section><div className="mb-4"><h2 className="text-2xl font-black">Your promotions</h2><p className="mt-1 text-sm text-white/45">Active, scheduled, and completed campaigns stay here with their results.</p></div>{loading ? <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 text-white/40">Loading promotions…</div> : campaigns.length === 0 ? <div className="rounded-3xl border border-dashed border-white/15 p-8 text-center text-white/45">No promotions yet. Your first campaign will appear here after launch.</div> : <div className="space-y-3">{campaigns.map((campaign) => <CampaignCard key={campaign.id} campaign={campaign} onAction={action} />)}</div>}</section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">{label}</p><p className="mt-2 text-2xl font-black">{value}</p></div>; }
function Choice({ active, title, description, onClick }: { active: boolean; title: string; description: string; onClick: () => void }) { return <button type="button" onClick={onClick} className={`rounded-2xl border p-5 text-left transition ${active ? "border-[#e1062a]/70 bg-[#e1062a]/10" : "border-white/10 bg-white/[0.025] hover:bg-white/[0.05]"}`}><p className="text-lg font-black">{title}</p><p className="mt-2 text-sm leading-6 text-white/48">{description}</p></button>; }
function StepPromote({ draft, setDraft }: any) { return <div><h2 className="text-3xl font-black">What do you want to promote?</h2><p className="mt-2 text-white/45">We’ll build the sponsored creative from your existing location information.</p><div className="mt-6 grid gap-4 md:grid-cols-2">{[["location","My location","Promote the business itself."],["outing","A complete OUTing","Put your location inside a useful two-stop outing."],["event","An event","Promote a scheduled event."],["experience","An experience","Promote a bookable experience."]].map(([value,title,description]) => <Choice key={value} active={draft.promotion_type === value} title={title} description={description} onClick={() => setDraft((d: Draft) => ({ ...d, promotion_type: value }))} />)}</div></div>; }
function StepPlacement({ draft, togglePlacement }: any) { return <div><h2 className="text-3xl font-black">Where should it appear?</h2><p className="mt-2 text-white/45">Choose one or both. Search only promotes you when you already qualify for that person’s request.</p><div className="mt-6 grid gap-4 md:grid-cols-2"><Choice active={draft.placements.includes("discover")} title="Discover" description="Reach people browsing for ideas. Billed by qualified impressions." onClick={() => togglePlacement("discover")} /><Choice active={draft.placements.includes("search")} title="Search results" description="Reach people actively searching for something your business fits. Billed when they engage." onClick={() => togglePlacement("search")} /></div></div>; }
function StepAudience({ draft, setDraft }: any) { return <div><h2 className="text-3xl font-black">Who should see it?</h2><p className="mt-2 text-white/45">The easiest option is to let TheOutHaven use your profile, area, occasion, cuisine/activity and demand signals automatically.</p><div className="mt-6 grid gap-4 md:grid-cols-2"><Choice active={draft.audience_mode === "auto"} title="Let TheOutHaven choose" description="Recommended. We automatically find qualified audiences and search intent." onClick={() => setDraft((d: Draft) => ({ ...d, audience_mode: "auto" }))} /><Choice active={draft.audience_mode === "manual"} title="I want to guide it" description="Add simple audience guidance while TheOutHaven still enforces relevance." onClick={() => setDraft((d: Draft) => ({ ...d, audience_mode: "manual" }))} /></div>{draft.audience_mode === "manual" ? <textarea value={draft.audience} onChange={(e) => setDraft((d: Draft) => ({ ...d, audience: e.target.value }))} placeholder="Example: Date nights, rooftop dinner, Astoria evenings" className="mt-5 min-h-28 w-full rounded-2xl border border-white/10 bg-black/30 p-4 text-sm outline-none focus:border-[#e1062a]/60" /> : null}</div>; }
function StepBudget({ draft, setDraft }: any) { const options = [10000,25000,50000]; return <div><h2 className="text-3xl font-black">Set your budget</h2><p className="mt-2 text-white/45">Your total spend never exceeds this amount. Unused funded budget is refundable.</p><div className="mt-6 grid gap-3 sm:grid-cols-3">{options.map((amount) => <Choice key={amount} active={draft.total_budget_cents === amount} title={money(amount)} description={amount === 25000 ? "Recommended starting budget" : "Total campaign budget"} onClick={() => setDraft((d: Draft) => ({ ...d, total_budget_cents: amount }))} />)}</div><div className="mt-5 grid gap-4 md:grid-cols-3"><label className="text-sm font-bold">Custom budget<input type="number" min="25" value={draft.total_budget_cents / 100} onChange={(e) => setDraft((d: Draft) => ({ ...d, total_budget_cents: Math.max(2500, Number(e.target.value || 0) * 100) }))} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 p-3" /></label><label className="text-sm font-bold">Start date<input type="datetime-local" value={draft.starts_at} onChange={(e) => setDraft((d: Draft) => ({ ...d, starts_at: e.target.value }))} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 p-3" /></label><label className="text-sm font-bold">End date<input type="datetime-local" value={draft.ends_at} onChange={(e) => setDraft((d: Draft) => ({ ...d, ends_at: e.target.value }))} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 p-3" /></label></div></div>; }
function StepPreview({ draft, setDraft, locationName }: any) { return <div><h2 className="text-3xl font-black">Preview your promotion</h2><p className="mt-2 text-white/45">Sponsored placement is always labeled. Organic ranking remains separate.</p><div className="mt-6 grid gap-5 lg:grid-cols-2"><div className="rounded-3xl border border-white/10 bg-gradient-to-br from-rose-950/60 to-black p-6"><span className="rounded-full border border-white/15 bg-black/30 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em]">Sponsored</span><h3 className="mt-10 text-3xl font-black">{draft.headline || locationName}</h3><p className="mt-2 text-sm text-white/55">{draft.description || "Your location details and best available imagery will be used automatically."}</p></div><div className="space-y-4"><label className="block text-sm font-bold">Headline<input value={draft.headline} onChange={(e) => setDraft((d: Draft) => ({ ...d, headline: e.target.value }))} placeholder={locationName} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 p-3" /></label><label className="block text-sm font-bold">Short description<textarea value={draft.description} onChange={(e) => setDraft((d: Draft) => ({ ...d, description: e.target.value }))} placeholder="Optional — we can use your profile automatically." className="mt-2 min-h-24 w-full rounded-xl border border-white/10 bg-black/30 p-3" /></label><div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-white/55"><strong className="text-white">Billing:</strong> Discover uses CPM delivery. Search uses CPC engagement. Conversions are tracked for ROI but are not separate billing events.</div></div></div></div>; }
function CampaignCard({ campaign, onAction }: { campaign: Campaign; onAction: (campaign: Campaign, action: "pause" | "resume" | "cancel") => void }) { const m = campaign.metrics || {}; const remaining = Math.max(0, campaign.total_budget_cents - campaign.spent_cents); return <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex flex-wrap gap-2"><span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.15em]">{campaign.status.replaceAll("_", " ")}</span>{campaign.placements.map((p) => <span key={p} className="rounded-full border border-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.15em] text-white/50">{p}</span>)}</div><h3 className="mt-3 text-xl font-black">{campaign.name}</h3><p className="mt-1 text-sm text-white/45">{money(campaign.spent_cents)} spent of {money(campaign.total_budget_cents)} · {money(remaining)} remaining</p></div><div className="flex gap-2">{campaign.status === "active" ? <button onClick={() => onAction(campaign, "pause")} className="rounded-full border border-white/10 px-4 py-2 text-xs font-black">Pause</button> : campaign.status === "paused" ? <button onClick={() => onAction(campaign, "resume")} className="rounded-full border border-white/10 px-4 py-2 text-xs font-black">Resume</button> : null}{!["completed","cancelled"].includes(campaign.status) ? <button onClick={() => onAction(campaign, "cancel")} className="rounded-full border border-red-400/20 px-4 py-2 text-xs font-black text-red-200">End</button> : null}</div></div><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"><Small label="Impressions" value={Number(m.impressions || 0).toLocaleString()} /><Small label="Engagements" value={(Number(m.clicks || 0)+Number(m.outing_opens || 0)+Number(m.profile_views || 0)).toLocaleString()} /><Small label="Reservation actions" value={(Number(m.reservation_clicks || 0)+Number(m.calls || 0)+Number(m.bookings || 0)).toLocaleString()} /><Small label="Attributed revenue" value={money(Number(m.attributed_revenue_cents || 0))} /></div></article>; }
function Small({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl bg-black/25 p-3"><p className="text-[10px] font-black uppercase tracking-[0.12em] text-white/30">{label}</p><p className="mt-1 text-lg font-black">{value}</p></div>; }
