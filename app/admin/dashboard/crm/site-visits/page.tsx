import Link from "next/link";
import CrmWorkspaceShell from "@/components/admin/crm/CrmWorkspaceShell";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.crm);
  const links = [["Open CRM list", "/admin/dashboard/crm"], ["Team assignments", "/admin/dashboard/team/assignments"], ["Team payroll", "/admin/dashboard/team/payroll"], ["Location Tools", "/admin/dashboard/settings/location-tools"]];
  return <CrmWorkspaceShell><section className="rounded-3xl border border-white/10 bg-[#111] p-6"><p className="text-xs font-black uppercase tracking-[0.28em] text-rose-300">CRM Workspace</p><h2 className="mt-2 text-3xl font-black text-white">Site Visits</h2><p className="mt-3 max-w-3xl text-sm font-bold leading-6 text-white/60">Plan and record site visit CRM work.</p><div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{links.map(([label, href]) => <Link key={href} href={href} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm font-black text-white/75 hover:bg-white/[0.08] hover:text-white">{label}</Link>)}</div></section></CrmWorkspaceShell>;
}
