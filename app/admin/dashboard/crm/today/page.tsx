import Link from "next/link";
import CrmWorkspaceShell from "@/components/admin/crm/CrmWorkspaceShell";
import TodayUnreadMessages from "@/components/admin/crm/TodayUnreadMessages";
import { requireAdminRole } from "@/lib/admin-auth";
import { CRM_READ_ROLES } from "@/lib/crm/permissions";
import { queryWorkQueue } from "@/lib/crm/tasks/queries";

export const dynamic = "force-dynamic";

function TaskList({
  title,
  description,
  tasks,
  href,
}: {
  title: string;
  description: string;
  tasks: any[];
  href: string;
}) {
  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#0e0e11]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 p-5">
        <div>
          <h2 className="text-xl font-black text-white">{title}</h2>
          <p className="mt-1 text-sm text-zinc-500">{description}</p>
        </div>
        <Link href={href} className="rounded-xl border border-white/10 px-3 py-2 text-sm font-black text-white/80 hover:bg-white/[0.05]">
          View all
        </Link>
      </div>
      {tasks.length ? (
        <div className="divide-y divide-white/[0.07]">
          {tasks.slice(0, 6).map((task: any) => (
            <Link key={task.id} href={`/admin/dashboard/crm/work-queue/${task.id}`} className="grid gap-2 p-4 transition hover:bg-white/[0.04] sm:grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-white">{task.title}</p>
                <p className="mt-1 truncate text-xs text-zinc-500">{task.crm_accounts?.name || task.locations?.name || "CRM record"}</p>
              </div>
              <div className="text-left sm:text-right">
                <p className="text-xs font-bold capitalize text-zinc-400">{String(task.priority || "normal").replaceAll("_", " ")}</p>
                <p className="mt-1 text-xs text-zinc-600">{task.due_at ? new Date(task.due_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "No due time"}</p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p className="p-5 text-sm text-zinc-500">Nothing in this section right now.</p>
      )}
    </section>
  );
}

export default async function CrmTodayPage() {
  const actor = await requireAdminRole(CRM_READ_ROLES);
  const [dueToday, overdue, followUps, attention] = await Promise.all([
    queryWorkQueue(actor.user_id, "due-today", {}),
    queryWorkQueue(actor.user_id, "overdue", {}),
    queryWorkQueue(actor.user_id, "follow-ups", {}),
    queryWorkQueue(actor.user_id, "escalations", {}),
  ]);

  return (
    <CrmWorkspaceShell>
      <main className="space-y-5 text-white">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-300">TheOutHaven CRM</p>
            <h1 className="mt-1 text-3xl font-black">Today</h1>
            <p className="mt-1 text-white/55">Start here. Messages and work that need attention now, without the full CRM reporting dashboard.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/dashboard/crm/locations" className="rounded-xl border border-white/10 px-4 py-2 text-sm font-black text-white/80 hover:bg-white/[0.05]">Find a location</Link>
            <Link href="/admin/dashboard/crm/tasks?create=task" className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-black text-white hover:bg-rose-500">Create task</Link>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ["Due today", dueToday.count, "/admin/dashboard/crm/my-work?view=due-today"],
            ["Overdue", overdue.count, "/admin/dashboard/crm/my-work?view=overdue"],
            ["Follow-ups", followUps.count, "/admin/dashboard/crm/my-work?view=follow-ups"],
            ["Needs attention", attention.count, "/admin/dashboard/crm/my-work?view=escalations"],
          ].map(([label, value, href]) => (
            <Link key={String(label)} href={String(href)} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition hover:border-rose-300/30 hover:bg-white/[0.06]">
              <b className="text-2xl text-white">{value}</b>
              <small className="mt-1 block font-bold text-white/50">{label}</small>
            </Link>
          ))}
        </section>

        <TodayUnreadMessages />

        <div className="grid gap-5 xl:grid-cols-2">
          <TaskList title="Due today" description="Work scheduled for today." tasks={dueToday.tasks} href="/admin/dashboard/crm/my-work?view=due-today" />
          <TaskList title="Overdue" description="Past-due work that still needs action." tasks={overdue.tasks} href="/admin/dashboard/crm/my-work?view=overdue" />
          <TaskList title="Follow-ups" description="Customer and location follow-ups currently in your queue." tasks={followUps.tasks} href="/admin/dashboard/crm/my-work?view=follow-ups" />
          <TaskList title="Needs attention" description="Escalated or priority work that should be reviewed." tasks={attention.tasks} href="/admin/dashboard/crm/my-work?view=escalations" />
        </div>
      </main>
    </CrmWorkspaceShell>
  );
}
