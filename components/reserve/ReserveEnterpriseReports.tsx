"use client";

import { useEffect, useState } from "react";
import { RefreshCw, TrendingDown, TrendingUp } from "lucide-react";

function Change({ value, inverse = false }: { value: number | null | undefined; inverse?: boolean }) {
  if (value == null) return <span className="text-[10px] font-bold text-white/35">New baseline</span>;
  const good = inverse ? value <= 0 : value >= 0;
  const Icon = value >= 0 ? TrendingUp : TrendingDown;
  return <span className={`inline-flex items-center gap-1 text-[10px] font-black ${good ? "text-emerald-300" : "text-[#ff8aa0]"}`}><Icon size={11} />{Math.abs(value)}% vs prior 28d</span>;
}

function Card({ label, value, change, inverse }: { label: string; value: string | number; change?: number | null; inverse?: boolean }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><p className="text-[10px] font-black uppercase tracking-[0.12em] text-white/40">{label}</p><p className="mt-2 text-3xl font-black">{value}</p>{change !== undefined ? <div className="mt-2"><Change value={change} inverse={inverse} /></div> : null}</div>;
}

export default function ReserveEnterpriseReports({ locationId }: { locationId: string }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/v1/reserve/reports/summary?locationId=${encodeURIComponent(locationId)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load reports.");
      setData(payload);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to load reports."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [locationId]);
  const current = data?.current || {};
  return <main className="min-h-screen bg-[#050607] p-4 text-white sm:p-6 lg:p-8"><div className="mx-auto max-w-7xl"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#ff6b86]">TheOutHaven Reserve</p><h1 className="mt-1 text-3xl font-black">Enterprise reports</h1><p className="mt-2 text-sm font-semibold text-white/45">Current 28-day operating performance compared with your own prior 28-day baseline.</p></div><button onClick={() => void load()} className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-white/60"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /></button></div>{error ? <p className="mt-4 rounded-xl border border-[#e1062a]/35 bg-[#e1062a]/10 p-3 text-sm font-bold text-[#ff9bad]">{error}</p> : null}<div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Card label="Reservations" value={current.reservations || 0} change={data?.change?.reservations} /><Card label="Covers" value={current.covers || 0} change={data?.change?.covers} /><Card label="Completed" value={current.completed || 0} change={data?.change?.completed} /><Card label="No-shows" value={current.noShows || 0} change={data?.change?.noShows} inverse /><Card label="Walk-ins" value={current.walkIns || 0} change={data?.change?.walkIns} /></div><div className="mt-3 grid gap-3 sm:grid-cols-3"><Card label="Avg party" value={current.averagePartySize || 0} /><Card label="Avg completed turn" value={current.averageTurnMinutes ? `${current.averageTurnMinutes}m` : "—"} /><Card label="Bar reservations" value={current.barReservations || 0} /></div><section className="mt-6 rounded-[1.5rem] border border-white/10 bg-[#0a0c10] p-5"><h2 className="text-lg font-black">Server & bartender workload</h2><p className="mt-1 text-xs font-semibold text-white/40">Operational workload only; this is not a sales leaderboard.</p><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="text-[10px] uppercase tracking-[0.1em] text-white/35"><tr><th className="pb-3">Staff</th><th className="pb-3">Role</th><th className="pb-3">Reservations</th><th className="pb-3">Covers</th><th className="pb-3">Completed</th></tr></thead><tbody>{(data?.serverPerformance || []).map((person: any) => <tr key={person.id} className="border-t border-white/8"><td className="py-3 font-black">{person.displayName}</td><td className="py-3 capitalize text-white/50">{String(person.role || "").replaceAll("_", " ")}</td><td className="py-3">{person.reservations}</td><td className="py-3">{person.covers}</td><td className="py-3">{person.completed}</td></tr>)}{!data?.serverPerformance?.length ? <tr><td colSpan={5} className="py-8 text-center text-white/35">No staff-assigned reservation history in this period.</td></tr> : null}</tbody></table></div></section></div></main>;
}