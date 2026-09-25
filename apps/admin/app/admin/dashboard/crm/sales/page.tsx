import Link from "next/link";

import CrmWorkspaceShell from "@/components/admin/crm/CrmWorkspaceShell";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { CRM_READ_ROLES } from "@/lib/crm/permissions";
import { listUnifiedSalesLocations, SALES_PLAYBOOKS } from "@/lib/crm/unified-sales";
import { qualifyProductOpportunityAction } from "./actions";

export const dynamic="force-dynamic";

const JOURNEY=["Unclaimed","Contacted","Interested","Claim in progress","Claimed","Paid customer","Active customer","Renewal","Needs attention","Canceled","Win back"];

function money(value:unknown){
  return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(Number(value||0));
}
function tone(status:string){
  if(status==="sell_now")return"border-rose-400/35 bg-rose-500/10 text-rose-100";
  if(status==="review")return"border-amber-300/25 bg-amber-400/10 text-amber-100";
  if(status==="covered")return"border-emerald-300/25 bg-emerald-400/10 text-emerald-100";
  return"border-white/10 bg-white/[.03] text-white/45";
}
function Journey({stage}:{stage:string}){
  const active=Math.max(0,JOURNEY.indexOf(stage));
  return <div className="overflow-x-auto pb-2"><div className="flex min-w-[1150px] items-center gap-1">
    {JOURNEY.map((label,index)=><div key={label} className="flex min-w-0 flex-1 items-center">
      <div className={`w-full rounded-xl border px-3 py-2 text-center text-[11px] font-black ${index===active?"border-rose-400 bg-rose-500/15 text-rose-100":index<active?"border-emerald-300/20 bg-emerald-400/[.08] text-emerald-100":"border-white/10 bg-white/[.025] text-white/35"}`}>
        {index<active?"✓ ":""}{label}
      </div>
      {index<JOURNEY.length-1?<span className="mx-1 text-white/15">→</span>:null}
    </div>)}
  </div></div>;
}

export default async function SalesWorkspacePage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
  const actor=await requireAdminRole(CRM_READ_ROLES);
  const p=await searchParams;
  const page=Math.max(1,Number(p.page||1));
  const pageSize=[25,50,100].includes(Number(p.pageSize))?Number(p.pageSize):25;
  const result=await listUnifiedSalesLocations({
    userId:actor.user_id,
    role:actor.role,
    q:String(p.q||"").trim(),
    owner:p.owner,
    page,
    pageSize,
    locationId:p.location_id,
  });
  const leadership=["superadmin","admin","manager"].includes(String(actor.role));
  const sellNow=result.rows.reduce((sum,row)=>sum+row.recommendations.filter((r)=>r.status==="sell_now").length,0);
  const openOpps=result.rows.reduce((sum,row)=>sum+row.openOpportunities.length,0);
  const due=result.rows.reduce((sum,row)=>sum+row.openTasks.filter((t:any)=>t.due_at&&new Date(t.due_at)<new Date()).length,0);
  const base=new URLSearchParams();
  if(p.q)base.set("q",p.q);
  if(p.location_id)base.set("location_id",p.location_id);
  base.set("pageSize",String(pageSize));
  const pageHref=(next:number)=>{const q=new URLSearchParams(base);q.set("page",String(next));return`/admin/dashboard/crm/sales?${q.toString()}`;};

  return <CrmWorkspaceShell><main className="space-y-5 text-[var(--admin-shell-text)]">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs font-black uppercase tracking-[.2em] text-rose-300">TheOutHaven Sales</p>
        <h1 className="mt-1 text-3xl font-black">Sales Workspace</h1>
        <p className="mt-1 max-w-4xl text-[var(--admin-shell-muted)]">One page for every assigned location: customer journey, product gaps, what to sell, why to sell it, how to sell it, contacts, opportunities, follow-ups and the next best action.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {leadership?<Link href="/admin/dashboard/crm/sales/leadership" className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-black text-white">Leadership view</Link>:null}
        <Link href="/admin/dashboard/crm/locations" className="rounded-xl border border-[var(--admin-shell-border)] px-4 py-2 text-sm font-black">Find location</Link>
      </div>
    </header>

    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[
        ["Locations",result.count,"In your CRM scope"],
        ["Sell now",sellNow,"Detected product gaps on this page"],
        ["Open opportunities",openOpps,"Qualified sales motions"],
        ["Overdue follow-ups",due,"Needs ambassador attention"],
      ].map(([label,value,helper])=><article key={String(label)} className="rounded-2xl border border-[var(--admin-shell-border)] bg-[var(--admin-shell-card)] p-4">
        <b className="text-2xl">{value}</b><small className="mt-1 block font-black">{label}</small><p className="mt-1 text-xs text-[var(--admin-shell-muted)]">{helper}</p>
      </article>)}
    </section>

    <form className="flex flex-col gap-2 rounded-2xl border border-[var(--admin-shell-border)] bg-[var(--admin-shell-card)] p-3 sm:flex-row">
      <input name="q" defaultValue={p.q||""} placeholder="Search location, city or business" className="min-h-11 flex-1 rounded-xl border border-[var(--admin-shell-border)] bg-black/20 px-4 text-sm"/>
      <select name="pageSize" defaultValue={String(pageSize)} className="min-h-11 rounded-xl border border-[var(--admin-shell-border)] bg-black/30 px-3 text-sm"><option value="25">25 per page</option><option value="50">50 per page</option><option value="100">100 per page</option></select>
      <button className="min-h-11 rounded-xl bg-white px-5 text-sm font-black text-black">Search</button>
      {(p.q||p.location_id)?<Link href="/admin/dashboard/crm/sales" className="min-h-11 rounded-xl border border-[var(--admin-shell-border)] px-4 py-3 text-center text-sm font-black">Clear</Link>:null}
    </form>

    <section className="space-y-3">
      {result.rows.map((row)=>{
        const top=row.recommendations.find((r)=>r.status==="sell_now")||row.recommendations.find((r)=>r.status==="review")||row.recommendations[0];
        return <details key={row.id} id={`location-${row.id}`} open={p.location_id===row.id} className="group overflow-hidden rounded-3xl border border-[var(--admin-shell-border)] bg-[var(--admin-shell-card)]">
          <summary className="cursor-pointer list-none p-5 transition hover:bg-[var(--admin-shell-soft)]">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_160px_210px_minmax(220px,.8fr)] xl:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-lg font-black">{row.name}</h2><span className="rounded-full border border-white/10 px-2 py-1 text-[10px] font-black uppercase">{row.lifecycleStage}</span></div>
                <p className="mt-1 text-xs text-[var(--admin-shell-muted)]">{[row.category,row.city,row.state].filter(Boolean).join(" · ")||"Location"}</p>
                <p className="mt-2 text-xs text-[var(--admin-shell-muted)]">{row.assignedName?<>Assigned to <b className="text-[var(--admin-shell-text)]">{row.assignedName}</b>{row.territoryName?` · ${row.territoryName}`:""}</>:<span className="text-amber-200">No ambassador assignment detected</span>}</p>
              </div>
              <div><b className="text-2xl">{row.opportunityScore}</b><small className="block text-[10px] font-black uppercase tracking-wide text-[var(--admin-shell-muted)]">Opportunity</small><p className="mt-1 text-[11px] text-[var(--admin-shell-muted)]">Demand {row.demandScore} · Contact {row.contactabilityScore}</p></div>
              <div><small className="font-black uppercase tracking-wide text-rose-300">What to sell</small><p className="mt-1 font-black">{top?.label||"Review account"}</p><p className="mt-1 line-clamp-2 text-xs text-[var(--admin-shell-muted)]">{top?.reason}</p></div>
              <div><small className="font-black uppercase tracking-wide text-rose-300">Do next</small><p className="mt-1 text-sm font-black">{row.nextBestAction}</p><p className="mt-1 text-xs text-[var(--admin-shell-muted)]">{row.openOpportunities.length} open opportunities · {row.openTasks.length} follow-ups</p></div>
            </div>
          </summary>

          <div className="space-y-5 border-t border-[var(--admin-shell-border)] p-5">
            <section>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-black uppercase tracking-[.18em] text-rose-300">Customer journey</p><h3 className="mt-1 text-xl font-black">Where this location is in the relationship</h3></div><Link href={`/admin/dashboard/crm/${row.id}`} className="rounded-xl border border-[var(--admin-shell-border)] px-3 py-2 text-xs font-black">Full location record</Link></div>
              <Journey stage={row.lifecycleStage}/>
            </section>

            <section>
              <div className="mb-3"><p className="text-xs font-black uppercase tracking-[.18em] text-rose-300">Opportunity coverage</p><h3 className="mt-1 text-xl font-black">What to sell and why</h3><p className="mt-1 text-sm text-[var(--admin-shell-muted)]">Detected gaps stay recommendations until an ambassador qualifies them. Existing opportunities remain canonical CRM opportunities.</p></div>
              <div className="grid gap-3 xl:grid-cols-2">
                {row.recommendations.map((rec)=>{
                  const play=SALES_PLAYBOOKS[rec.key];
                  return <article key={rec.key} className={`rounded-2xl border p-4 ${tone(rec.status)}`}>
                    <div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h4 className="font-black">{rec.label}</h4><span className="rounded-full border border-current/20 px-2 py-0.5 text-[10px] font-black uppercase">{rec.status.replace("_"," ")}</span><span className="text-[10px] font-black uppercase opacity-60">{rec.confidence} confidence</span></div><p className="mt-2 text-sm opacity-80">{rec.reason}</p></div><b className="text-xl">{rec.priority}</b></div>
                    <div className="mt-3 flex flex-wrap gap-1">{rec.evidence.map((e)=><span key={e} className="rounded-full border border-current/15 px-2 py-1 text-[10px] font-bold opacity-70">{e}</span>)}</div>
                    <details className="mt-4 rounded-xl border border-current/15 bg-black/10 p-3"><summary className="cursor-pointer text-xs font-black">How to sell this</summary><div className="mt-3 space-y-3 text-xs opacity-85"><p><b>Opening:</b> {play.opener}</p><div><b>Discovery:</b><ul className="mt-1 list-disc space-y-1 pl-5">{play.discovery.map((q)=><li key={q}>{q}</li>)}</ul></div><p><b>Value:</b> {play.value}</p><p><b>Common objection:</b> {play.objection}</p><p><b>Response:</b> {play.response}</p></div></details>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {rec.activeOpportunityId?<Link href={`/admin/dashboard/crm/opportunities/${rec.activeOpportunityId}`} className="rounded-xl bg-white px-3 py-2 text-xs font-black text-black">Open opportunity · {rec.stage||"active"}</Link>:rec.status!=="blocked"&&rec.status!=="covered"?<form action={qualifyProductOpportunityAction}><input type="hidden" name="location_id" value={row.id}/><input type="hidden" name="product" value={rec.key}/><button className="rounded-xl bg-white px-3 py-2 text-xs font-black text-black">Qualify opportunity</button></form>:null}
                    </div>
                  </article>;
                })}
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-3">
              <article className="rounded-2xl border border-[var(--admin-shell-border)] bg-[var(--admin-shell-soft)] p-4"><h3 className="font-black">Who to contact</h3>{row.contacts.length?<div className="mt-3 space-y-2">{row.contacts.map((c)=><div key={c.value} className="rounded-xl border border-white/10 p-3"><b className="break-all text-sm">{c.value}</b><p className="mt-1 text-xs text-[var(--admin-shell-muted)]">{c.role||"Business contact"} · {c.verification||"discovered"} · confidence {c.confidence??"—"}</p></div>)}</div>:<p className="mt-3 text-sm text-[var(--admin-shell-muted)]">No verified/discovered business contact yet. Next action should be contact research.</p>}</article>
              <article className="rounded-2xl border border-[var(--admin-shell-border)] bg-[var(--admin-shell-soft)] p-4"><h3 className="font-black">Qualified opportunities</h3>{row.openOpportunities.length?<div className="mt-3 space-y-2">{row.openOpportunities.map((o:any)=><Link key={o.id} href={`/admin/dashboard/crm/opportunities/${o.id}`} className="block rounded-xl border border-white/10 p-3 hover:border-rose-300/30"><b className="text-sm">{o.name}</b><p className="mt-1 text-xs text-[var(--admin-shell-muted)]">{String(o.pipeline_key||"sales").replaceAll("_"," ")} · {String(o.stage||"identified").replaceAll("_"," ")} · {o.amount?money(o.amount):"Value not set"}</p><p className="mt-1 text-xs">Next: {o.next_step||"Set next step"}</p></Link>)}</div>:<p className="mt-3 text-sm text-[var(--admin-shell-muted)]">No qualified opportunity yet. Use the product cards above to qualify a detected gap.</p>}</article>
              <article className="rounded-2xl border border-[var(--admin-shell-border)] bg-[var(--admin-shell-soft)] p-4"><h3 className="font-black">Follow-ups</h3>{row.openTasks.length?<div className="mt-3 space-y-2">{row.openTasks.map((t:any)=><Link key={t.id} href={`/admin/dashboard/crm/work-queue/${t.id}`} className="block rounded-xl border border-white/10 p-3"><b className="text-sm">{t.title}</b><p className="mt-1 text-xs text-[var(--admin-shell-muted)]">{t.due_at?`Due ${new Date(t.due_at).toLocaleString()}`:"No due date"} · {String(t.status).replaceAll("_"," ")}</p></Link>)}</div>:<p className="mt-3 text-sm text-[var(--admin-shell-muted)]">No open follow-ups.</p>}</article>
            </section>
          </div>
        </details>;
      })}
      {!result.rows.length?<div className="rounded-3xl border border-dashed border-[var(--admin-shell-border)] p-10 text-center text-sm text-[var(--admin-shell-muted)]">No locations match your current CRM scope and search.</div>:null}
    </section>

    <footer className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--admin-shell-border)] bg-[var(--admin-shell-card)] p-4 text-sm">
      <span className="text-[var(--admin-shell-muted)]">Page {result.page} of {result.totalPages} · {result.count} locations</span>
      <div className="flex gap-2"><Link aria-disabled={result.page<=1} href={result.page<=1?"#":pageHref(result.page-1)} className={`rounded-xl border border-[var(--admin-shell-border)] px-4 py-2 font-black ${result.page<=1?"pointer-events-none opacity-30":""}`}>Previous</Link><Link aria-disabled={result.page>=result.totalPages} href={result.page>=result.totalPages?"#":pageHref(result.page+1)} className={`rounded-xl border border-[var(--admin-shell-border)] px-4 py-2 font-black ${result.page>=result.totalPages?"pointer-events-none opacity-30":""}`}>Next</Link></div>
    </footer>
  </main></CrmWorkspaceShell>;
}
