import Link from "next/link";
import CrmWorkspaceShell from "@/components/admin/crm/CrmWorkspaceShell";
import CrmViewCard from "@/components/admin/crm/CrmViewCard";
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
  return <CrmWorkspaceShell><CrmViewCard eyebrow="Work Queue" active={active} views={views} baseHref="/admin/dashboard/crm/work-queue"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Link href="/admin/dashboard/crm/accounts" className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm font-black text-white/75 transition hover:border-rose-300/35 hover:text-white">Open Accounts</Link><Link href="/admin/dashboard/team/assignments" className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm font-black text-white/75 transition hover:border-rose-300/35 hover:text-white">Team Assignments</Link><Link href="/admin/dashboard/crm/outreach" className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm font-black text-white/75 transition hover:border-rose-300/35 hover:text-white">Outreach</Link><Link href="/admin/dashboard/crm/operations" className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm font-black text-white/75 transition hover:border-rose-300/35 hover:text-white">Operations</Link></div></CrmViewCard></CrmWorkspaceShell>;
}
