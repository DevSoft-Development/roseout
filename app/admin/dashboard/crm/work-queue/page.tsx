import Link from "next/link";
import CrmWorkspaceShell from "@/components/admin/crm/CrmWorkspaceShell";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";

export const dynamic = "force-dynamic";

const views = [
  ["my-queue", "My Queue", "Assigned CRM work and personal priority queue."],
  ["tasks", "Tasks", "Assigned CRM, support, outreach, site visit, and follow-up tasks."],
  ["follow-ups", "Follow-Ups", "Due, overdue, owner, outreach, and ticket follow-ups."],
  ["notifications", "Notifications", "CRM task, ticket, claim-code, and correction notifications."],
  ["escalations", "Escalations", "High-priority owner, claim, reservation, billing, privacy, and do-not-contact escalations."],
] as const;

export default async function WorkQueuePage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  await requireAdminRole(ADMIN_PAGE_ACCESS.crm);
  const { view = "my-queue" } = await searchParams;
  const active = views.find(([key]) => key === view) || views[0];
  return <CrmWorkspaceShell><section className="rounded-3xl border border-white/10 bg-[#111] p-6"><p className="text-xs font-black uppercase tracking-[0.28em] text-rose-300">Work Queue</p><h2 className="mt-2 text-3xl font-black text-white">{active[1]}</h2><p className="mt-3 max-w-3xl text-sm font-bold leading-6 text-white/60">{active[2]}</p><div className="mt-6 flex flex-wrap gap-2">{views.map(([key,label]) => <Link key={key} href={`/admin/dashboard/crm/work-queue?view=${key}`} className={`rounded-full border px-4 py-2 text-xs font-black ${active[0] === key ? "border-rose-300/40 bg-[#ec0b5b] text-white" : "border-white/10 bg-white/[0.04] text-white/65 hover:text-white"}`}>{label}</Link>)}</div><div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Link href="/admin/dashboard/crm/accounts" className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm font-black text-white/75">Open Accounts</Link><Link href="/admin/dashboard/team/assignments" className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm font-black text-white/75">Team Assignments</Link><Link href="/admin/dashboard/crm/outreach" className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm font-black text-white/75">Outreach</Link><Link href="/admin/dashboard/crm/operations" className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm font-black text-white/75">Operations</Link></div></section></CrmWorkspaceShell>;
}
