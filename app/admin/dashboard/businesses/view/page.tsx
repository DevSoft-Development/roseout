import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { getUpgradeFlags, listBusinessCRM } from "@/lib/admin-crm";
import BusinessCommunicationSection from "@/components/admin/business/BusinessCommunicationSection";

export const dynamic = "force-dynamic";

export default async function BusinessViewPage({ searchParams }: { searchParams: Promise<{ q?: string; locationId?: string }> }) {
  await requireAdminRole(["superadmin", "admin", "editor", "viewer"]);
  const params = await searchParams;
  const q = (params.q || "").trim().toLowerCase();
  const allBusinesses = await listBusinessCRM(500);
  const filtered = q ? allBusinesses.filter((b) => `${b.name} ${b.city || ""} ${b.state || ""}`.toLowerCase().includes(q)) : allBusinesses;
  const selected = filtered.find((b) => b.id === params.locationId) || filtered[0] || null;

  return (
    <main className="min-h-screen bg-[#090706] px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1450px] space-y-6">
        <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
          <p className="text-xs uppercase tracking-[0.25em] text-rose-200">Businesses · CRM Command Center</p>
          <h1 className="mt-2 text-3xl font-black">Business View</h1>
          <form className="mt-4"><input name="q" defaultValue={q} placeholder="Search business, city, state" className="w-full rounded-2xl border border-white/15 bg-black/20 px-4 py-3" /></form>
        </section>
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[['Total businesses', allBusinesses.length],['Claimed', allBusinesses.filter((b)=>b.is_claimed).length],['Upgrade opportunities', allBusinesses.filter((b)=>b.opportunity_score>=70).length],['Missing reservation links', allBusinesses.filter((b)=>!b.reservation_url).length]].map(([label,val])=>(<article key={String(label)} className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs uppercase tracking-[0.2em] text-white/60">{label}</p><p className="mt-2 text-2xl font-black">{val}</p></article>))}
        </section>
        <section className="grid gap-6 xl:grid-cols-[1.1fr,1.4fr]">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
            <h2 className="text-lg font-black">Locations ({filtered.length})</h2>
            <div className="mt-3 space-y-2 max-h-[70vh] overflow-y-auto pr-1">
              {filtered.slice(0, 120).map((business) => (
                <Link key={business.id} href={`/admin/dashboard/businesses/view?locationId=${business.id}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={`block rounded-xl border px-3 py-2 ${selected?.id===business.id?"border-rose-300/60 bg-rose-500/10":"border-white/10 hover:bg-white/5"}`}>
                  <p className="font-semibold">{business.name}</p>
                  <p className="text-xs text-white/60">{business.crm_status} · Opp {Math.round(business.opportunity_score)} · Churn {Math.round(business.churn_risk_score)}</p>
                </Link>
              ))}
            </div>
          </div>
          {selected ? <div className="space-y-4"><section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><h2 className="text-xl font-black">{selected.name}</h2><p className="mt-1 text-sm text-white/65">{[selected.city,selected.state].filter(Boolean).join(', ') || 'Unknown city/state'}</p><div className="mt-3 flex flex-wrap gap-2">{getUpgradeFlags(selected).map((f)=><span key={f} className="rounded-full border border-rose-300/40 bg-rose-500/10 px-2 py-1 text-xs">{f}</span>)}</div></section><BusinessCommunicationSection business={selected} /><section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><h3 className="font-black">CRM Tabs</h3><p className="mt-2 text-sm text-white/70">Overview · Analytics · Sales / Plan · Upgrade Opportunity · Reservation Links · Claim Codes · Outreach · Follow Ups · Communication · Notes / History · Promotions · Churn Risk</p></section></div> : <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">No businesses found.</div>}
        </section>
      </div>
    </main>
  );
}
