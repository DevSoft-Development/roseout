"use client";

import { useEffect, useMemo, useState } from "react";

type Opportunity = {
  id: string;
  name: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  google_maps_url: string | null;
  rating: number | string | null;
  review_count: number | string | null;
  primary_category: string | null;
  reservation_discovery_status: string | null;
  reservation_upgrade_reason: string | null;
  reservation_upgrade_detected_at: string | null;
  reservation_outreach_status: string | null;
  reservation_outreach_notes?: string | null;
  reservation_opportunity_score?: number | null;
  reservation_opportunity_tier?: string | null;
  reservation_opportunity_classification?: string | null;
  reservation_opportunity_evidence?: unknown;
  crm_account_id?: string | null;
  crm_opportunity_id?: string | null;
};

type OpportunitiesResponse = {
  success?: boolean;
  total?: number;
  summary?: Record<string, number>;
  opportunities?: Opportunity[];
  error?: string;
};

const statusOptions = ["not_contacted", "contacted", "interested", "not_interested", "claimed", "onboarded"];
const tierOptions = ["high", "medium", "low"];
const classificationOptions = ["no_online_reservations", "needs_verification", "walk_in_likely", "takes_reservations_offline"];

function pretty(value: string | null | undefined) {
  return (value || "unknown").replaceAll("_", " ");
}

function num(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function evidence(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

function tierClass(tier: string | null | undefined) {
  if (tier === "high") return "border-emerald-300/20 bg-emerald-500/10 text-emerald-100";
  if (tier === "medium") return "border-amber-300/20 bg-amber-500/10 text-amber-100";
  return "border-white/10 bg-white/5 text-white/60";
}

function canPromote(row: Opportunity) {
  return row.reservation_opportunity_tier === "high" && row.reservation_opportunity_classification === "no_online_reservations";
}

export default function ReservationOpportunitiesClient() {
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [tier, setTier] = useState("");
  const [classification, setClassification] = useState("");
  const [minScore, setMinScore] = useState("");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 20;
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [data, setData] = useState<OpportunitiesResponse | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const params = useMemo(() => {
    const p = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (city.trim()) p.set("city", city.trim());
    if (state.trim()) p.set("state", state.trim());
    if (category.trim()) p.set("category", category.trim());
    if (status) p.set("status", status);
    if (tier) p.set("tier", tier);
    if (classification) p.set("classification", classification);
    if (minScore.trim()) p.set("minScore", minScore.trim());
    if (q.trim()) p.set("q", q.trim());
    return p;
  }, [category, city, classification, minScore, offset, q, state, status, tier]);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/reservation-opportunities?${params.toString()}`, { cache: "no-store" });
      const json = (await response.json()) as OpportunitiesResponse;
      setData(json);
      const nextNotes: Record<string, string> = {};
      for (const row of json.opportunities || []) nextNotes[row.id] = row.reservation_outreach_notes || "";
      setNotes(nextNotes);
      if (!response.ok || json.success === false) alert(json.error || "Failed to load Reserve opportunities");
    } catch (error) {
      console.error("Failed to load Reserve opportunities", error);
      alert("Failed to load Reserve opportunities");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  async function save(row: Opportunity, nextStatus: string) {
    setSavingId(row.id);
    try {
      const response = await fetch(`/api/admin/reservation-opportunities/${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservation_outreach_status: nextStatus, reservation_outreach_notes: notes[row.id] || "" }),
      });
      const json = await response.json();
      if (!response.ok || json.success === false) alert(json.error || "Failed to update opportunity");
      else await load();
    } finally {
      setSavingId(null);
    }
  }

  async function promote(row: Opportunity) {
    setPromotingId(row.id);
    try {
      const response = await fetch(`/api/admin/reservation-opportunities/${encodeURIComponent(row.id)}/promote`, { method: "POST" });
      const json = await response.json();
      if (!response.ok || json.success === false) {
        alert(json.error || "Failed to add Reserve opportunity to CRM");
        return;
      }
      await load();
    } catch (error) {
      console.error("Failed to add Reserve opportunity to CRM", error);
      alert("Failed to add Reserve opportunity to CRM");
    } finally {
      setPromotingId(null);
    }
  }

  const rows = data?.opportunities || [];
  const total = num(data?.total);
  const summary = data?.summary || {};

  return (
    <main className="min-h-screen bg-[#090506] px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-6 sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-300">CRM · TheOutHaven Reserve</p>
          <h1 className="mt-3 text-3xl font-black sm:text-4xl">Reserve Opportunities</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">Prioritized restaurants where TheOutHaven Reserve can solve a verified booking gap. High-confidence rows can be promoted directly into the existing Reserve CRM pipeline; blocked or failed discovery stays in verification instead of outreach.</p>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="Total" value={total} />
          <SummaryCard label="High" value={num(summary.tier_high)} />
          <SummaryCard label="Medium" value={num(summary.tier_medium)} />
          <SummaryCard label="Interested" value={num(summary.interested)} />
        </section>

        <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Input label="Search" value={q} onChange={setQ} />
            <Input label="City" value={city} onChange={setCity} />
            <Input label="State" value={state} onChange={setState} />
            <Input label="Category" value={category} onChange={setCategory} />
            <Select label="Tier" value={tier} onChange={setTier} options={tierOptions} />
            <Select label="Classification" value={classification} onChange={setClassification} options={classificationOptions} />
            <Select label="Outreach" value={status} onChange={setStatus} options={statusOptions} />
            <Input label="Minimum score" value={minScore} onChange={setMinScore} type="number" />
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={() => { setOffset(0); void load(); }} className="rounded-full bg-white px-6 py-3 text-sm font-black text-black">Apply filters</button>
            <button type="button" onClick={() => { const csv = new URLSearchParams(params); csv.set("export", "csv"); csv.set("limit", "5000"); window.location.href = `/api/admin/reservation-opportunities?${csv.toString()}`; }} className="rounded-full border border-white/15 px-6 py-3 text-sm font-black">Export CSV</button>
          </div>
        </section>

        <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.035]">
          <div className="flex items-center justify-between border-b border-white/10 p-5">
            <div><h2 className="text-xl font-black">Prioritized opportunities</h2><p className="mt-1 text-sm text-zinc-500">Highest verified Reserve score first.</p></div>
            {loading ? <span className="text-sm font-bold text-rose-200">Loading…</span> : null}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1380px] w-full text-left text-sm">
              <thead className="bg-black/30 text-xs uppercase tracking-[0.14em] text-zinc-500"><tr>
                <th className="px-5 py-4">Location</th><th className="px-5 py-4">Reserve fit</th><th className="px-5 py-4">Evidence</th><th className="px-5 py-4">Discovery</th><th className="px-5 py-4">CRM</th><th className="px-5 py-4">Outreach</th><th className="px-5 py-4">Links</th>
              </tr></thead>
              <tbody className="divide-y divide-white/10">
                {rows.length === 0 ? <tr><td colSpan={7} className="px-5 py-10 text-center text-zinc-500">No Reserve opportunities match these filters.</td></tr> : rows.map((row) => (
                  <tr key={row.id} className="align-top text-zinc-200">
                    <td className="max-w-xs px-5 py-5"><p className="font-black text-white">{row.name || "Unnamed location"}</p><p className="mt-1 text-xs text-zinc-500">{[row.city,row.state].filter(Boolean).join(", ") || "—"}</p><p className="mt-2 text-xs text-zinc-500">{row.primary_category || "Restaurant"} · {row.rating || "—"}★ · {row.review_count || 0} reviews</p></td>
                    <td className="px-5 py-5"><span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black uppercase ${tierClass(row.reservation_opportunity_tier)}`}>{row.reservation_opportunity_tier || "low"} · {num(row.reservation_opportunity_score)}/100</span><p className="mt-3 text-xs font-bold capitalize text-white/70">{pretty(row.reservation_opportunity_classification)}</p></td>
                    <td className="max-w-sm px-5 py-5"><div className="space-y-2">{evidence(row.reservation_opportunity_evidence).slice(0,5).map((item) => <p key={item} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/65">{item}</p>)}</div></td>
                    <td className="px-5 py-5"><span className="capitalize">{pretty(row.reservation_discovery_status || "not_found")}</span><p className="mt-2 max-w-xs text-xs text-zinc-500">{row.reservation_upgrade_reason || "No online reservation path found"}</p></td>
                    <td className="min-w-48 px-5 py-5">
                      {row.crm_opportunity_id ? <div className="space-y-2"><span className="inline-flex rounded-full border border-emerald-300/20 bg-emerald-500/10 px-3 py-1 text-xs font-black text-emerald-100">In CRM</span><a href={`/admin/dashboard/crm/opportunities/${row.crm_opportunity_id}`} className="block font-bold text-rose-200">Open opportunity</a>{row.crm_account_id ? <a href={`/admin/dashboard/crm/accounts/${row.crm_account_id}`} className="block text-xs font-bold text-zinc-400">Open account</a> : null}</div> : canPromote(row) ? <button type="button" onClick={() => void promote(row)} disabled={promotingId === row.id} className="rounded-full bg-rose-200 px-4 py-2 text-xs font-black text-black disabled:opacity-50">{promotingId === row.id ? "Adding…" : "Add to CRM"}</button> : <span className="text-xs font-bold text-zinc-500">Verification required</span>}
                    </td>
                    <td className="min-w-72 px-5 py-5"><select value={row.reservation_outreach_status || "not_contacted"} onChange={(e) => void save(row, e.target.value)} disabled={savingId === row.id} className="w-full rounded-xl border border-white/10 bg-black px-3 py-2 font-bold text-white">{statusOptions.map((option) => <option key={option} value={option}>{pretty(option)}</option>)}</select><textarea value={notes[row.id] || ""} onChange={(e) => setNotes((prev) => ({ ...prev, [row.id]: e.target.value }))} placeholder="Outreach notes" className="mt-3 min-h-20 w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-white"/><button type="button" onClick={() => void save(row, row.reservation_outreach_status || "not_contacted")} disabled={savingId === row.id} className="mt-2 rounded-full border border-white/15 px-4 py-2 text-xs font-black">{savingId === row.id ? "Saving…" : "Save notes"}</button></td>
                    <td className="px-5 py-5"><div className="flex flex-col gap-2">{row.website ? <a href={row.website} target="_blank" rel="noreferrer" className="font-bold text-rose-200">Website</a> : null}{row.google_maps_url ? <a href={row.google_maps_url} target="_blank" rel="noreferrer" className="font-bold text-rose-200">Google Maps</a> : null}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-white/10 p-5"><p className="text-sm font-bold text-zinc-500">Showing {rows.length ? offset + 1 : 0}-{Math.min(offset + rows.length, total)} of {total}</p><div className="flex gap-3"><button type="button" onClick={() => setOffset(Math.max(0, offset - limit))} disabled={offset === 0} className="rounded-full border border-white/15 px-5 py-2 text-sm font-black disabled:opacity-40">Previous</button><button type="button" onClick={() => setOffset(offset + limit)} disabled={offset + rows.length >= total} className="rounded-full border border-white/15 px-5 py-2 text-sm font-black disabled:opacity-40">Next</button></div></div>
        </section>
      </div>
    </main>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) { return <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-5"><p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">{label}</p><p className="mt-3 text-3xl font-black">{value.toLocaleString()}</p></div>; }
function Input({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) { return <label><span className="mb-2 block text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500">{label}</span><input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-[#14090d] px-4 py-3 font-bold text-white"/></label>; }
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) { return <label><span className="mb-2 block text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500">{label}</span><select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-[#14090d] px-4 py-3 font-bold text-white"><option value="">All</option>{options.map((option) => <option key={option} value={option}>{pretty(option)}</option>)}</select></label>; }
