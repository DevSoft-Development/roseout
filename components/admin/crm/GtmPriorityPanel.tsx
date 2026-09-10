import Link from 'next/link';

export default function GtmPriorityPanel({rows}:{rows:any[]}){
  return <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#0e0e11]">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 p-5">
      <div><p className="text-xs font-black uppercase tracking-[0.18em] text-rose-300">Sales intelligence</p><h2 className="mt-1 text-xl font-black text-white">Priority businesses</h2><p className="mt-1 text-sm text-zinc-500">Hot and warm businesses ranked by Opportunity Score and current intent.</p></div>
      <Link href="/admin/dashboard/crm/gtm" className="rounded-xl border border-white/10 px-3 py-2 text-sm font-black text-white/80 hover:bg-white/[0.05]">Open GTM</Link>
    </div>
    {rows.length?<div className="divide-y divide-white/[0.07]">{rows.slice(0,8).map((row:any)=>{const l=Array.isArray(row.locations)?row.locations[0]:row.locations; const reasons=row.score_explanation?.reasons||[]; return <Link key={row.location_id} href={`/admin/dashboard/crm/${row.location_id}`} className="grid gap-3 p-4 transition hover:bg-white/[0.04] lg:grid-cols-[minmax(0,1fr)_110px_150px] lg:items-center">
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-black text-white">{l?.name||l?.business_name||l?.restaurant_name||l?.activity_name||'Business'}</p><span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${row.opportunity_tier==='hot'?'bg-rose-500/15 text-rose-200':'bg-amber-400/15 text-amber-200'}`}>{row.opportunity_tier}</span></div><p className="mt-1 truncate text-xs text-zinc-500">{reasons.slice(0,3).join(' • ')||row.next_best_action}</p></div>
      <div><b className="text-lg text-white">{row.opportunity_score}</b><small className="block text-[10px] font-bold uppercase tracking-wide text-zinc-500">Opportunity</small></div>
      <div className="text-xs"><b className="text-rose-200">{row.next_best_action||'Review'}</b><small className="mt-1 block text-zinc-600">Demand {row.demand_score} · Contact {row.contactability_score}</small></div>
    </Link>})}</div>:<p className="p-5 text-sm text-zinc-500">No Hot or Warm GTM opportunities yet. Run GTM reconciliation after the migration is deployed.</p>}
  </section>;
}
