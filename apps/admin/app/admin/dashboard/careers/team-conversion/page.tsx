import Link from "next/link";

import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { formatCareerDate, getCareerStageTone } from "@/lib/careers/format";

import MicrosoftReadinessCheck from "./MicrosoftReadinessCheck";

export const dynamic = "force-dynamic";
export const metadata = { title: "Employees – Careers CRM" };

function toneClass(tone: ReturnType<typeof getCareerStageTone>) {
  if (tone === "green") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-100";
  if (tone === "amber") return "border-amber-400/25 bg-amber-400/10 text-amber-100";
  if (tone === "red") return "border-red-400/25 bg-red-400/10 text-red-100";
  if (tone === "blue") return "border-sky-400/25 bg-sky-400/10 text-sky-100";
  if (tone === "rose") return "border-rose-400/25 bg-rose-400/10 text-rose-100";
  return "border-white/10 bg-white/[.04] text-white/60";
}

export default async function CareersTeamConversionPage() {
  await requireAdminRole(["superadmin", "admin"]);

  const result = await getAdminDatabaseClient()
    .from("career_team_conversions")
    .select("id,team_role,department,start_date,converted_at,application_id")
    .limit(50);
  const rows = result.data || [];

  return (
    <main className="min-h-screen bg-[#090706] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1400px] space-y-6">
        <header className="rounded-3xl border border-white/10 bg-[#120d0b] p-6">
          <p className="text-xs font-black uppercase tracking-[.26em] text-rose-300">Careers CRM</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black">Employees</h1>
              <p className="mt-2 max-w-3xl text-sm text-white/55">
                Provision hired candidates, verify Microsoft 365 readiness, and manage employee lifecycle access.
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
          <MicrosoftReadinessCheck />
        </section>

        <section className="rounded-3xl border border-white/10 bg-[#120d0b] p-5">
          <h2 className="text-xl font-black">Operational workflow</h2>
          <p className="mt-2 text-sm leading-6 text-white/60">
            Hired candidates can be provisioned into TheOutHaven employee records with role-based CRM access,
            Microsoft 365 identity provisioning, lifecycle auditing, and secured offboarding.
          </p>
        </section>

        {result.error ? (
          <section className="rounded-2xl border border-rose-300/25 bg-rose-500/10 p-4 text-sm font-bold text-rose-100">
            Unable to load employee conversion records: {result.error.message}
          </section>
        ) : null}

        <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#120d0b]">
          {rows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-white/[.03] text-left text-[10px] uppercase tracking-[.16em] text-white/40">
                  <tr>
                    <th className="p-3">Record</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Department</th>
                    <th className="p-3">Converted</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row: any) => {
                    const tone = getCareerStageTone("hired");
                    return (
                      <tr key={row.id} className="border-t border-white/10">
                        <td className="p-3 font-black text-white">{row.team_role || row.id}</td>
                        <td className="p-3">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${toneClass(tone)}`}>
                            Active
                          </span>
                        </td>
                        <td className="p-3 capitalize text-white/65">{String(row.department || "—").replaceAll("_", " ")}</td>
                        <td className="p-3 text-white/55">{formatCareerDate(row.converted_at || row.start_date)}</td>
                        <td className="p-3">
                          {row.application_id ? (
                            <Link className="font-black text-rose-200" href={`/admin/dashboard/careers/applications/${row.application_id}`}>
                              Open applicant
                            </Link>
                          ) : (
                            <Link className="font-black text-rose-200" href="/admin/dashboard/careers">
                              Careers
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="p-6 text-sm text-white/50">No employee conversion records found.</p>
          )}
        </section>
      </div>
    </main>
  );
}
