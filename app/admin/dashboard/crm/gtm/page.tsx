import Link from 'next/link';
import CrmWorkspaceShell from '@/components/admin/crm/CrmWorkspaceShell';
import GtmPriorityPanel from '@/components/admin/crm/GtmPriorityPanel';
import { requireAdminRole } from '@/lib/admin-auth';
import { CRM_READ_ROLES } from '@/lib/crm/permissions';
import { getGtmCommandCenter, getGtmPriorityQueue } from '@/lib/gtm/queries';

export const dynamic='force-dynamic';

export default async function GtmPage(){
  await requireAdminRole(CRM_READ_ROLES);
  const [metrics,priority]=await Promise.all([getGtmCommandCenter(),getGtmPriorityQueue(50)]);
  const cards=[['Observed',metrics.observed],['Full CRM',metrics.full],['Hot',metrics.hot],['Warm',metrics.warm],['Engaged',metrics.engaged],['Customers',metrics.customers],['Avg opportunity',metrics.avgOpportunity],['Avg demand',metrics.avgDemand]];
  return <CrmWorkspaceShell><main className="space-y-5 text-white">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-rose-300">TheOutHaven GTM</p><h1 className="mt-1 text-3xl font-black">Revenue Intelligence</h1><p className="mt-1 max-w-3xl text-white/55">One operating view across searchable businesses, sales qualification, demand, contact discovery, claims, activation and revenue motion.</p></div><div className="flex gap-2"><Link href="/admin/dashboard/crm/today" className="rounded-xl border border-white/10 px-4 py-2 text-sm font-black">Today</Link><Link href="/admin/dashboard/crm/territories" className="rounded-xl border border-white/10 px-4 py-2 text-sm font-black">Territories</Link></div></header>
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">{cards.map(([label,value])=><div key={String(label)} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><b className="text-2xl">{value}</b><small className="mt-1 block font-bold text-white/50">{label}</small></div>)}</section>
    <GtmPriorityPanel rows={priority}/>
    <section className="grid gap-4 lg:grid-cols-3"><div className="rounded-3xl border border-white/10 bg-[#0e0e11] p-5"><h2 className="font-black">Scoring</h2><p className="mt-2 text-sm text-zinc-500">Opportunity = gaps 30 + quality 20 + demand 20 + engagement 15 + territory 10 + contactability 5. Demand, contactability and activation remain separate 0–100 scores.</p></div><div className="rounded-3xl border border-white/10 bg-[#0e0e11] p-5"><h2 className="font-black">Association</h2><p className="mt-2 text-sm text-zinc-500">Every searchable business gets a lightweight GTM identity. Full CRM activates at 60+, meaningful intent, discovered email, claim activity or customer status.</p></div><div className="rounded-3xl border border-white/10 bg-[#0e0e11] p-5"><h2 className="font-black">Next Best Action</h2><p className="mt-2 text-sm text-zinc-500">Suppression first, then customer activation/expansion, claim follow-up, engaged follow-up, email, call, postcard, research or monitor.</p></div></section>
  </main></CrmWorkspaceShell>;
}
