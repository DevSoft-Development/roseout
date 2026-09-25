import Link from "next/link";

import CrmWorkspaceShell from "@/components/admin/crm/CrmWorkspaceShell";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getSalesLeadershipSummary } from "@/lib/crm/unified-sales";

export const dynamic="force-dynamic";

function money(value:unknown){
  return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(Number(value||0));
}
function pct(wins:number,losses:number){
  const total=wins+losses;
  return total?Math.round((wins/total)*100):null;
}

export default async function SalesLeadershipPage(){
  await requireAdminRole(["superadmin","admin","manager"] as const);
  const summary=await getSalesLeadershipSummary();
  const totals=summary.totals||{};
  return <CrmWorkspaceShell><main className="space-y-5 text-[var(--admin-shell-text)]">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs font-black uppercase tracking-[.2em] text-[var(--admin-shell-accent)]">TheOutHaven Sales Leadership</p>
        <h1 className="mt-1 text-3xl font-black">Opportunity & Ambassador Command Center</h1>
        <p className="mt-1 max-w-4xl text-[var(--admin-shell-muted)]">One high-level view for sales coverage, ambassador assignments, locations touched, locations contacted, open opportunities, wins and losses. Activity metrics use the last 30 days; assignments reflect current territory ownership.</p>
      </div>
      <Link href="/admin/dashboard/crm/sales" className="rounded-xl bg-[var(--admin-shell-accent)] px-4 py-2 text-sm font-black text-white shadow-sm hover:bg-[var(--admin-shell-accent-hover)]">Open sales workspace</Link>
    </header>

    <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {[
        ["Observed locations",totals.observed_locations||0,"GTM location universe"],
        ["Active sales locations",totals.active_sales_locations||0,"Full CRM association"],
        ["Open opportunities",totals.open_opportunities||0,"All active product motions"],
        ["Won · 30d",totals.wins||0,"Closed won"],
        ["Lost · 30d",totals.losses||0,"Closed lost"],
      ].map(([label,value,helper])=><article key={String(label)} className="rounded-2xl border border-[var(--admin-shell-border)] bg-[var(--admin-shell-card)] p-4">
        <b className="text-2xl">{value}</b><small className="mt-1 block font-black">{label}</small><p className="mt-1 text-xs text-[var(--admin-shell-muted)]">{helper}</p>
      </article>)}
    </section>

    <section className="overflow-hidden rounded-3xl border border-[var(--admin-shell-border)] bg-[var(--admin-shell-card)]">
      <div className="border-b border-[var(--admin-shell-border)] p-5">
        <p className="text-xs font-black uppercase tracking-[.18em] text-[var(--admin-shell-accent)]">Team coverage</p>
        <h2 className="mt-1 text-xl font-black">Ambassador performance</h2>
        <p className="mt-1 text-sm text-[var(--admin-shell-muted)]">Assigned locations are current. Touched/contacted/won/lost are grounded in CRM activity and opportunity ownership.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1050px] text-left text-sm">
          <thead className="bg-[var(--admin-shell-card-strong)] text-xs uppercase tracking-wide text-[var(--admin-shell-muted)]"><tr>
            {["Ambassador / owner","Assigned locations","Touched · 30d","Contacted · 30d","Open opportunities","Won · 30d","Lost · 30d","Win rate","Won value","Last touch"].map((h)=><th key={h} className="px-4 py-3">{h}</th>)}
          </tr></thead>
          <tbody>{summary.reps.map((rep:any)=>{
            const rate=pct(Number(rep.wins||0),Number(rep.losses||0));
            return <tr key={rep.userId} className="border-t border-[var(--admin-shell-border)] hover:bg-[var(--admin-shell-soft)]">
              <td className="px-4 py-4"><b>{rep.name}</b><p className="mt-1 text-xs text-[var(--admin-shell-muted)]">{rep.userId}</p></td>
              <td className="px-4 py-4 font-black">{rep.assignedLocations||0}</td>
              <td className="px-4 py-4">{rep.touchedLocations||0}</td>
              <td className="px-4 py-4">{rep.contactedLocations||0}</td>
              <td className="px-4 py-4">{rep.openOpportunities||0}</td>
              <td className="px-4 py-4 font-black text-emerald-500">{rep.wins||0}</td>
              <td className="px-4 py-4 font-black text-[var(--admin-shell-accent)]">{rep.losses||0}</td>
              <td className="px-4 py-4">{rate===null?"—":rate+"%"}</td>
              <td className="px-4 py-4">{money(rep.wonValue||0)}</td>
              <td className="px-4 py-4 text-xs text-[var(--admin-shell-muted)]">{rep.lastTouchAt?new Date(rep.lastTouchAt).toLocaleString():"—"}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      {!summary.reps.length?<p className="p-5 text-sm text-[var(--admin-shell-muted)]">No ambassador ownership or CRM sales activity has been recorded yet.</p>:null}
    </section>

    <section className="grid gap-5 xl:grid-cols-2">
      <article className="rounded-3xl border border-[var(--admin-shell-border)] bg-[var(--admin-shell-card)] p-5">
        <p className="text-xs font-black uppercase tracking-[.18em] text-[var(--admin-shell-accent)]">Opportunity mix</p>
        <h2 className="mt-1 text-xl font-black">Pipeline coverage</h2>
        <div className="mt-4 space-y-2">{summary.pipelineCounts.map((row:any)=><div key={row.pipeline} className="grid grid-cols-[minmax(0,1fr)_70px_70px_70px] items-center gap-3 rounded-xl border border-[var(--admin-shell-border)] p-3 text-sm">
          <b className="capitalize">{String(row.pipeline).replaceAll("_"," ")}</b><span><b>{row.open}</b><small className="block text-[10px] text-[var(--admin-shell-muted)]">Open</small></span><span><b>{row.won}</b><small className="block text-[10px] text-[var(--admin-shell-muted)]">Won</small></span><span><b>{row.lost}</b><small className="block text-[10px] text-[var(--admin-shell-muted)]">Lost</small></span>
        </div>)}</div>
      </article>

      <article className="rounded-3xl border border-[var(--admin-shell-border)] bg-[var(--admin-shell-card)] p-5">
        <p className="text-xs font-black uppercase tracking-[.18em] text-[var(--admin-shell-accent)]">Assignment coverage</p>
        <h2 className="mt-1 text-xl font-black">Territories</h2>
        <div className="mt-4 space-y-2">{summary.territories.map((territory:any)=><div key={territory.id} className="rounded-xl border border-[var(--admin-shell-border)] p-3">
          <div className="flex items-center justify-between gap-3"><b>{territory.name}</b><span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase ${territory.owner_user_id?"border-emerald-500/20 bg-emerald-500/[.07] text-emerald-500":"border-[var(--admin-shell-border)] bg-[var(--admin-shell-card-strong)] text-[var(--admin-shell-muted)]"}`}>{territory.owner_user_id?"Assigned":"Unassigned"}</span></div>
          <p className="mt-1 text-xs text-[var(--admin-shell-muted)]">{territory.borough||"Market"}{territory.owner_user_id?` · Owner ${territory.owner_user_id}`:" · Needs ambassador assignment"}</p>
        </div>)}</div>
      </article>
    </section>

    <section className="rounded-3xl border border-[var(--admin-shell-accent-border)] bg-[var(--admin-shell-accent-soft)] p-5">
      <h2 className="text-xl font-black">Operating model</h2>
      <p className="mt-2 max-w-4xl text-sm text-[var(--admin-shell-muted)]">Ambassadors work from Sales Workspace. Leadership works from this page. GTM scoring, lifecycle, contacts, tasks, opportunities, territories and attribution remain the underlying systems, but they are now supporting layers instead of separate places staff must visit to understand a location.</p>
    </section>
  </main></CrmWorkspaceShell>;
}
