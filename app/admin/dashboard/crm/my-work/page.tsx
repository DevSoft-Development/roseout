import Link from "next/link";
import CrmWorkspaceShell from "@/components/admin/crm/CrmWorkspaceShell";
import { requireAdminRole } from "@/lib/admin-auth";
import { CRM_READ_ROLES } from "@/lib/crm/permissions";
import { queryWorkQueue, SYSTEM_VIEWS } from "@/lib/crm/tasks/queries";
import type { QueueFilters } from "@/lib/crm/tasks/types";

export const dynamic = "force-dynamic";

const labels: Record<string, string> = {
  "my-queue": "My Work",
  "due-today": "Due Today",
  overdue: "Overdue",
  "follow-ups": "Follow-Ups",
  unassigned: "Unassigned",
  blocked: "Blocked",
  escalations: "Needs Attention",
  completed: "Completed",
  "all-tasks": "All Tasks",
  "team-queue": "Team Work",
  "unowned-work": "Unassigned",
  "sla-risk": "Due Soon",
  "recently-reopened": "Reopened",
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await requireAdminRole(CRM_READ_ROLES);
  const p = await searchParams;
  const view = SYSTEM_VIEWS.includes(p.view as any) ? p.view! : "my-queue";
  const result = await queryWorkQueue(actor.user_id, view, p as QueueFilters);
  const manager = ["superadmin", "admin", "manager"].includes(actor.role);
  const counts = {
    overdue: result.tasks.filter((t: any) => t.due_at && new Date(t.due_at) < new Date() && !["completed", "cancelled"].includes(t.status)).length,
    today: result.tasks.filter((t: any) => t.due_at && new Date(t.due_at).toDateString() === new Date().toDateString()).length,
    attention: result.tasks.filter((t: any) => t.escalation_level !== "none").length,
    unassigned: result.tasks.filter((t: any) => !t.assigned_to_user_id).length,
  };

  return (
    <CrmWorkspaceShell>
      <main className="space-y-5 text-white">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-rose-300">CRM</p>
            <h1 className="text-3xl font-black">My Work</h1>
            <p className="mt-1 text-white/60">{labels[view]} · {result.count} items</p>
          </div>
          <Link href="/admin/dashboard/crm/work-queue/new" className="rounded-xl bg-rose-600 px-4 py-2 font-black text-white">Create Task</Link>
        </header>

        <section className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {[["Due today", counts.today], ["Overdue", counts.overdue], ["Needs attention", counts.attention], ["Unassigned", counts.unassigned]].map(([label, value]) => (
            <div key={String(label)} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <b className="text-2xl">{value}</b>
              <small className="mt-1 block text-white/50">{label}</small>
            </div>
          ))}
        </section>

        <nav className="flex gap-2 overflow-x-auto pb-1">
          {SYSTEM_VIEWS.filter((v) => manager || !["team-queue", "unowned-work", "sla-risk", "recently-reopened"].includes(v)).map((v) => (
            <Link key={v} href={`?view=${v}`} className={`shrink-0 rounded-full px-3 py-2 text-sm font-bold ${v === view ? "bg-white text-black" : "border border-white/15 text-white/70"}`}>{labels[v]}</Link>
          ))}
        </nav>

        <form className="grid gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:grid-cols-4">
          <input type="hidden" name="view" value={view} />
          <input name="search" defaultValue={p.search} placeholder="Search work" className="rounded-xl bg-black/30 p-3" />
          <select name="priority" defaultValue={p.priority || ""} className="rounded-xl bg-black/30 p-3"><option value="">All priorities</option>{["urgent", "high", "normal", "low"].map((x) => <option key={x}>{x}</option>)}</select>
          <select name="status" defaultValue={p.status || ""} className="rounded-xl bg-black/30 p-3"><option value="">All statuses</option>{["open", "in_progress", "blocked", "completed", "cancelled"].map((x) => <option key={x} value={x}>{x.replaceAll("_", " ")}</option>)}</select>
          <button className="rounded-xl border border-white/15 font-bold">Apply filters</button>
        </form>

        <section className="overflow-hidden rounded-2xl border border-white/10">
          <div className="hidden grid-cols-[2fr_1fr_1fr_1fr] gap-3 bg-white/5 p-3 text-xs uppercase text-white/50 md:grid"><span>Task</span><span>Owner</span><span>Due</span><span>Status</span></div>
          {result.tasks.length ? result.tasks.map((t: any) => (
            <Link href={`/admin/dashboard/crm/work-queue/${t.id}`} key={t.id} className="grid gap-3 border-t border-white/10 p-4 hover:bg-white/5 md:grid-cols-[2fr_1fr_1fr_1fr]">
              <div><b>{t.title}</b><small className="block text-white/50">{t.crm_accounts?.name || t.locations?.name || "CRM record"}</small></div>
              <span>{t.assigned_to_user_id ? "Assigned" : "Unassigned"}</span>
              <span>{t.due_at ? new Date(t.due_at).toLocaleDateString() : "No due date"}</span>
              <span className="capitalize">{String(t.status || "open").replaceAll("_", " ")}</span>
            </Link>
          )) : <p className="p-12 text-center text-white/60">Nothing needs your attention in this view.</p>}
        </section>
      </main>
    </CrmWorkspaceShell>
  );
}
