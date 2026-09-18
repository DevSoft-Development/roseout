import Link from "next/link";

import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { CAREERS_VIEW_ROLES } from "@/lib/careers/access";
import { formatCareerDate, getCareerStageTone } from "@/lib/careers/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Careers Settings – Careers CRM" };

function toneClass(tone: ReturnType<typeof getCareerStageTone>) {
  if (tone === "green") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-100";
  if (tone === "amber") return "border-amber-400/25 bg-amber-400/10 text-amber-100";
  if (tone === "red") return "border-red-400/25 bg-red-400/10 text-red-100";
  if (tone === "blue") return "border-sky-400/25 bg-sky-400/10 text-sky-100";
  if (tone === "rose") return "border-rose-400/25 bg-rose-400/10 text-rose-100";
  return "border-white/10 bg-white/[.04] text-white/60";
}

export default async function CareersSettingsPage() {
  await requireAdminRole([...CAREERS_VIEW_ROLES]);

  const result = await getAdminDatabaseClient()
    .from("career_email_events")
    .select("id,template_key,recipient_email,status,created_at")
    .limit(50);
  const rows = result.data || [];

  return (
    <main className="min-h-screen bg-[#090706] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1400px] space-y-6">
        <header className="rounded-3xl border border-white/10 bg-[#120d0b] p-6">
          <p className="text-xs font-black uppercase tracking-[.26em] text-rose-300">Careers CRM</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black">Careers Settings</h1>
              <p className="mt-2 max-w-3xl text-sm text-white/55">
                Email templates, pipeline defaults, permissions, and production-safe hiring fallbacks.
              </p>
            </div>
            <div className="flex gap-2">
              <Link href="/admin/dashboard/careers" className="rounded-xl border border-white/15 px-4 py-2 text-sm font-black">
                Overview
              </Link>
              <Link href="/admin/dashboard/careers/jobs/new" className="rounded-xl bg-white px-4 py-2 text-sm font-black text-black">
                Create Job
              </Link>
            </div>
          </div>
        </header>

        <section className="rounded-3xl border border-white/10 bg-[#120d0b] p-5">
          <h2 className="text-xl font-black">Operational workflow</h2>
          <p className="mt-2 text-sm leading-6 text-white/60">
            This view reads live Careers CRM email-event records. Template mutations, permission changes, and pipeline defaults remain separate secured slices.
          </p>
        </section>

        {result.error ? (
          <section className="rounded-2xl border border-rose-300/25 bg-rose-500/10 p-4 text-sm font-bold text-rose-100">
            Unable to load Careers settings activity: {result.error.message}
          </section>
        ) : null}

        <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#120d0b]">
          {rows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-white/[.03] text-left text-[10px] uppercase tracking-[.16em] text-white/40">
                  <tr>
                    <th className="p-3">Template</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Recipient</th>
                    <th className="p-3">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row: any) => {
                    const tone = getCareerStageTone(row.status);
                    return (
                      <tr key={row.id} className="border-t border-white/10">
                        <td className="p-3 font-black text-white">{row.template_key || row.id}</td>
                        <td className="p-3">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${toneClass(tone)}`}>
                            {row.status || "Active"}
                          </span>
                        </td>
                        <td className="p-3 text-white/65">{row.recipient_email || "—"}</td>
                        <td className="p-3 text-white/55">{formatCareerDate(row.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="p-6 text-sm text-white/50">No Careers email activity found.</p>
          )}
        </section>
      </div>
    </main>
  );
}
