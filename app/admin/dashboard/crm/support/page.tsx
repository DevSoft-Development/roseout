import Link from "next/link";
import CrmWorkspaceShell from "@/components/admin/crm/CrmWorkspaceShell";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { listSupport } from "@/lib/crm/core-modules";
import { SUPPORT_QUEUE_KEYS } from "@/lib/support/operations";

export const dynamic = "force-dynamic";
const labels: Record<string,string> = { new:"New", mine:"My Tickets", unassigned:"Unassigned", waiting_on_customer:"Waiting Customer", waiting_on_internal:"Waiting Internal", escalated:"Escalated", sla_breached:"SLA Breached", urgent:"Urgent", billing:"Billing", reservations:"Reservations", location_support:"Location Support", reopened:"Reopened" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requireAdminRole(ADMIN_PAGE_ACCESS.crm);
  const p = await searchParams;
  const r = await listSupport({ ...p, assigned_to: p.queue === "mine" ? actor.user_id : undefined });
  return <CrmWorkspaceShell><main className="space-y-5 text-white">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.25em] text-rose-300">CRM</p><h1 className="text-3xl font-black">Support</h1><p className="mt-1 text-white/60">Operational queues for customer and location support.</p></div><Link href="/admin/dashboard/crm/support/settings" className="rounded-xl bg-white/10 px-4 py-2 font-bold">Support Settings</Link></header>
    <nav className="flex gap-2 overflow-x-auto pb-1"><Link href="/admin/dashboard/crm/support" className={`whitespace-nowrap rounded-full px-3 py-2 text-sm font-bold ${!p.queue ? "bg-rose-600":"bg-white/10 text-white/70"}`}>All</Link>{SUPPORT_QUEUE_KEYS.map((q)=><Link key={q} href={`?queue=${q}`} className={`whitespace-nowrap rounded-full px-3 py-2 text-sm font-bold ${p.queue===q?"bg-rose-600":"bg-white/10 text-white/70"}`}>{labels[q]}</Link>)}</nav>
    <form className="grid gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:grid-cols-5"><input type="hidden" name="queue" value={p.queue||""}/><input name="q" defaultValue={p.q} placeholder="Search subject or customer" className="rounded-xl bg-black/30 p-3"/><select name="priority" defaultValue={p.priority||""} className="rounded-xl bg-black/30 p-3"><option value="">All priorities</option>{["low","normal","high","urgent"].map(x=><option key={x}>{x}</option>)}</select><input name="category" defaultValue={p.category} placeholder="Category" className="rounded-xl bg-black/30 p-3"/><input name="tag" defaultValue={p.tag} placeholder="Tag" className="rounded-xl bg-black/30 p-3"/><button className="rounded-xl bg-white font-black text-black">Apply filters</button></form>
    <section className="overflow-x-auto rounded-2xl border border-white/10"><table className="w-full min-w-[950px] text-left text-sm"><thead className="bg-white/[0.05] text-xs uppercase text-white/45"><tr>{["Case","Subject","Customer","Priority","Status","Group","Owner","SLA","Updated"].map(h=><th className="p-3" key={h}>{h}</th>)}</tr></thead><tbody>{r.rows.map((t:any)=>{const breached=Boolean(t.metadata?.sla_breached);return <tr key={t.id} className="border-t border-white/10"><td className="p-3"><Link className="font-bold text-rose-200" href={`/admin/dashboard/crm/support/${t.id}`}>{t.ticket_number||t.id.slice(0,8)}</Link></td><td>{t.subject}</td><td>{t.email||t.requester_email||"—"}</td><td className="capitalize">{t.priority}</td><td className="capitalize">{String(t.status||"open").replaceAll("_"," ")}</td><td>{t.assigned_group||"—"}</td><td>{t.assigned_admin_name||t.assigned_admin_email||"Unassigned"}</td><td className={breached?"font-black text-amber-300":"text-white/60"}>{breached?"BREACHED":t.sla_resolution_due_at?new Date(t.sla_resolution_due_at).toLocaleString():"—"}</td><td>{new Date(t.updated_at||t.created_at).toLocaleDateString()}</td></tr>})}</tbody></table>{!r.rows.length?<p className="p-8 text-center text-white/60">No support cases match this queue.</p>:null}</section>
  </main></CrmWorkspaceShell>;
}
