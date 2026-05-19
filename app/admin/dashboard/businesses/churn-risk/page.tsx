import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { listBusinessCRM } from "@/lib/admin-crm";

export default async function Page() {
  await requireAdminRole(["superuser", "admin", "editor", "viewer"]);
  const businesses = await listBusinessCRM(60);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 text-white">
      <div className="rounded-3xl border border-white/10 bg-[#120d0b] p-8 shadow-2xl">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-200/70">Admin CRM</p>
        <h1 className="mt-2 text-3xl font-black">Business Work Queue</h1>
        <p className="mt-3 text-white/70">Click any business to open the full CRM detail page.</p>
        <div className="mt-6 space-y-2">
          {businesses.map((business) => (
            <Link key={business.id} href={`/admin/dashboard/businesses/${business.id}`} className="block rounded-xl border border-white/10 px-4 py-3 hover:bg-white/5">
              <p className="font-semibold">{business.name}</p>
              <p className="text-xs text-white/55">{business.crm_status} · Opp {Math.round(business.opportunity_score)} · Churn {Math.round(business.churn_risk_score)}</p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
