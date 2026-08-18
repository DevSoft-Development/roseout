import CrmWorkspaceShell from "@/components/admin/crm/CrmWorkspaceShell";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { getSupportCase } from "@/lib/crm/core-modules";
import { SUPPORT_PRIORITIES, SUPPORT_STATUSES } from "@/lib/support/canonical";
import { supportCaseAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminRole(ADMIN_PAGE_ACCESS.crm);
  const d = await getSupportCase((await params).id);
  const t: any = d.ticket;

  return (
    <CrmWorkspaceShell>
      <main className="space-y-5 text-white">
        <header className="rounded-3xl border border-white/10 bg-white/[.04] p-5">
          <p className="text-xs font-black uppercase tracking-[.25em] text-rose-300">Support case</p>
          <h1 className="text-3xl font-black">{t.subject}</h1>
          <p className="text-white/60">{t.ticket_number || t.id} · {t.status} · {t.priority}</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <form action={supportCaseAction} className="flex gap-2">
              <input type="hidden" name="ticket_id" value={t.id} />
              <button name="operation" value="assign_self" className="rounded-xl bg-white/10 px-3 py-2 text-sm font-bold">Assign to me</button>
              {t.assigned_to || t.assigned_admin_email ? <button name="operation" value="unassign" className="rounded-xl bg-white/5 px-3 py-2 text-sm font-bold">Unassign</button> : null}
            </form>

            <form action={supportCaseAction} className="flex gap-2">
              <input type="hidden" name="ticket_id" value={t.id} />
              <input type="hidden" name="operation" value="status" />
              <select name="status" defaultValue={t.status || "open"} className="min-w-0 flex-1 rounded-xl bg-black/40 px-3 py-2 text-sm font-bold">
                {SUPPORT_STATUSES.map((status) => <option value={status} key={status}>{status.replaceAll("_", " ")}</option>)}
              </select>
              <button className="rounded-xl bg-white/10 px-3 py-2 text-sm font-bold">Set status</button>
            </form>

            <form action={supportCaseAction} className="flex gap-2">
              <input type="hidden" name="ticket_id" value={t.id} />
              <input type="hidden" name="operation" value="priority" />
              <select name="priority" defaultValue={t.priority || "normal"} className="min-w-0 flex-1 rounded-xl bg-black/40 px-3 py-2 text-sm font-bold">
                {SUPPORT_PRIORITIES.map((priority) => <option value={priority} key={priority}>{priority}</option>)}
              </select>
              <button className="rounded-xl bg-white/10 px-3 py-2 text-sm font-bold">Set priority</button>
            </form>

            <form action={supportCaseAction} className="flex flex-wrap gap-2">
              <input type="hidden" name="ticket_id" value={t.id} />
              <button name="operation" value="escalate" className="rounded-xl bg-amber-500/20 px-3 py-2 text-sm font-bold text-amber-100">Escalate</button>
              <button name="operation" value="resolve" className="rounded-xl bg-emerald-500/20 px-3 py-2 text-sm font-bold text-emerald-100">Resolve</button>
              <button name="operation" value="reopen" className="rounded-xl bg-sky-500/20 px-3 py-2 text-sm font-bold text-sky-100">Reopen</button>
            </form>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-3">
          <Card title="Customer conversation">
            <div className="mb-4 max-h-[420px] space-y-3 overflow-y-auto">
              {d.messages.filter((m: any) => !m.internal_note).map((m: any) => (
                <div key={m.id} className="rounded-xl bg-black/30 p-3 text-sm">
                  <p className="font-black text-white/70">{m.author_name || m.sender_role || m.actor_type || "Support"}</p>
                  <p className="mt-1 whitespace-pre-wrap">{m.body || m.message}</p>
                </div>
              ))}
            </div>
            <form action={supportCaseAction} className="space-y-2">
              <input type="hidden" name="ticket_id" value={t.id} />
              <input type="hidden" name="operation" value="reply" />
              <textarea name="body" required rows={4} placeholder="Reply to customer..." className="w-full rounded-xl border border-white/10 bg-black/30 p-3 text-sm" />
              <button className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-black">Send reply</button>
            </form>
          </Card>

          <Card title="Internal notes">
            <div className="mb-4 max-h-[420px] space-y-3 overflow-y-auto">
              {d.messages.filter((m: any) => m.internal_note).map((m: any) => (
                <div key={m.id} className="rounded-xl bg-black/30 p-3 text-sm">
                  <p className="whitespace-pre-wrap">{m.body || m.message}</p>
                </div>
              ))}
            </div>
            <form action={supportCaseAction} className="space-y-2">
              <input type="hidden" name="ticket_id" value={t.id} />
              <input type="hidden" name="operation" value="internal_note" />
              <textarea name="body" required rows={4} placeholder="Add an internal note..." className="w-full rounded-xl border border-white/10 bg-black/30 p-3 text-sm" />
              <button className="rounded-xl bg-white/10 px-4 py-2 text-sm font-black">Add note</button>
            </form>
          </Card>

          <Card title="SLA and timeline">
            <p>First response: {t.first_response_at || "pending"}</p>
            <p>First response due: {t.sla_first_response_due_at || "not configured"}</p>
            <p>Resolution due: {t.sla_resolution_due_at || "not configured"}</p>
            <p>Resolution: {t.resolved_at || t.closed_at || "pending"}</p>
            <div className="mt-4 space-y-2">
              {d.activities.map((a: any) => <p key={a.id} className="text-sm text-white/65">{a.summary || a.activity_type}</p>)}
            </div>
            <form action={supportCaseAction} className="mt-5 space-y-2 border-t border-white/10 pt-4">
              <input type="hidden" name="ticket_id" value={t.id} />
              <input type="hidden" name="location_id" value={t.location_id || ""} />
              <input type="hidden" name="operation" value="create_task" />
              <input name="title" defaultValue={`Follow up on ${t.ticket_number || t.id}`} className="w-full rounded-xl border border-white/10 bg-black/30 p-3 text-sm" />
              <textarea name="description" rows={3} defaultValue={`Support follow-up for: ${t.subject}`} className="w-full rounded-xl border border-white/10 bg-black/30 p-3 text-sm" />
              <button className="rounded-xl bg-white/10 px-4 py-2 text-sm font-black">Create CRM task</button>
            </form>
          </Card>
        </section>
      </main>
    </CrmWorkspaceShell>
  );
}

function Card(props: { title: string; children: React.ReactNode }) {
  return <article className="rounded-2xl border border-white/10 bg-white/[.04] p-4"><h2 className="mb-3 text-xl font-black">{props.title}</h2>{props.children}</article>;
}
