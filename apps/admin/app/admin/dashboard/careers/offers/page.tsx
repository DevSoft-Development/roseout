import Link from "next/link";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { CAREERS_VIEW_ROLES } from "@/lib/careers/access";
import { formatCareerDate, getCareerStageTone } from "@/lib/careers/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Offer Tracking – Careers CRM" };

function toneClass(tone: ReturnType<typeof getCareerStageTone>) {
  if (tone === "green") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-100";
  if (tone === "amber") return "border-amber-400/25 bg-amber-400/10 text-amber-100";
  if (tone === "red") return "border-red-400/25 bg-red-400/10 text-red-100";
  if (tone === "blue") return "border-sky-400/25 bg-sky-400/10 text-sky-100";
  if (tone === "rose") return "border-rose-400/25 bg-rose-400/10 text-rose-100";
  return "border-white/10 bg-white/[.04] text-white/60";
}

export default async function CareersOffersPage() {
  await requireAdminRole([...CAREERS_VIEW_ROLES]);
  const result = await getAdminDatabaseClient()
    .from("career_offers")
    .select("id,status,pay_type,compensation_text,start_date,expires_at,application_id")
    .order("start_date", { ascending: false })
    .limit(50);
  const rows = result.data || [];

  return (
    <main className="min-h-screen bg-[#090706] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1400px] space-y-6">
        <header className="rounded-3xl border border-white/10 bg-[#120d0b] p-6">
          <p className="text-xs font-black uppercase tracking-[.26em] text-rose-300">Careers CRM</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div><h1 className="text-3xl font-black">Offer Tracking</h1><p className="mt-2 text-sm text-white/55">Review pending, sent, accepted, declined, expired, and withdrawn offers.</p></div>
            <div className="flex gap-2"><Link href="/admin/dashboard/careers" className="rounded-xl border border-white/15 px-4 py-2 text-sm font-black">Overview</Link><Link href="/admin/dashboard/careers/jobs/new" className="rounded-xl bg-white px-4 py-2 text-sm font-black text-black">Create Job</Link></div>
          </div>
        </header>

        <section className="rounded-2xl border border-white/10 bg-white/[.04] p-4 text-sm text-white/60">
          Live offer records are shown here. Create/send/accept/decline/withdraw mutations remain separate secured route slices.
        </section>

        {result.error ? <section className="rounded-2xl border border-rose-300/25 bg-rose-500/10 p-4 text-sm font-bold text-rose-100">Unable to load offers: {result.error.message}</section> : null}

        <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#120d0b]">
          {rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-sm">
            <thead className="bg-white/[.03] text-left text-[10px] uppercase tracking-[.16em] text-white/40"><tr><th className="p-3">Offer</th><th className="p-3">Status</th><th className="p-3">Compensation</th><th className="p-3">Pay Type</th><th className="p-3">Start</th><th className="p-3">Expires</th><th className="p-3">Applicant</th></tr></thead>
            <tbody>{rows.map((row:any) => {
              const tone = getCareerStageTone(row.status);
              return <tr key={row.id} className="border-t border-white/10">
                <td className="p-3 font-black text-white">{row.id}</td>
                <td className="p-3"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${toneClass(tone)}`}>{row.status || "Active"}</span></td>
                <td className="p-3 text-white/65">{row.compensation_text || "—"}</td>
                <td className="p-3 capitalize text-white/65">{String(row.pay_type || "not set").replaceAll("_"," ")}</td>
                <td className="p-3 text-white/65">{formatCareerDate(row.start_date)}</td>
                <td className="p-3 text-white/65">{formatCareerDate(row.expires_at)}</td>
                <td className="p-3">{row.application_id ? <Link className="font-black text-rose-200" href={`/admin/dashboard/careers/applications/${row.application_id}`}>Open applicant</Link> : <span className="text-white/40">—</span>}</td>
              </tr>;
            })}</tbody>
          </table></div> : <p className="p-6 text-sm text-white/50">No offers found.</p>}
        </section>
      </div>
    </main>
  );
}
