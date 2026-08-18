import Link from "next/link";
import CrmWorkspaceShell from "@/components/admin/crm/CrmWorkspaceShell";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { getSupportCase } from "@/lib/crm/core-modules";
import { SUPPORT_PRIORITIES, SUPPORT_STATUSES } from "@/lib/support/canonical";
import { getSupportOperationsSettings } from "@/lib/support/operations";
import { supportCaseAction } from "./actions";

export const dynamic = "force-dynamic";

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAdminRole(ADMIN_PAGE_ACCESS.crm);
  const { id } = await params;
  const [d, s] = await Promise.all([getSupportCase(id), getSupportOperationsSettings()]);
  const t: any = d.ticket;
  const breached = Boolean(t.metadata?.sla_breached);
  const assigned = Boolean(t.assigned_to || t.assigned_admin_email);
  const assignedToMe = Boolean(
    (t.assigned_to && t.assigned_to === actor.user_id) ||
    (t.assigned_admin_email && actor.email && String(t.assigned_admin_email).toLowerCase() === String(actor.email).toLowerCase()),
  );
  const terminal = t.status === "resolved" || t.status === "closed";

  return (
    <CrmWorkspaceShell>
      <main className="space-y-5 text-white">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/admin/dashboard/crm/support" className="rounded-xl bg-white/10 px-3 py-2 text-sm font-bold hover:bg-white/15">
            ← Back to Support
          </Link>
          <p className="text-sm text-white/55">Assigned to: {t.assigned_admin_name || t.assigned_admin_email || "Unassigned"}</p>
        </div>

        <header className="rounded-3xl border border-white/10 bg-white/[.04] p-5">
          <p className="text-xs font-black uppercase tracking-[.25em] text-rose-300">Support case</p>
          <h1 className="text-3xl font-black">{t.subject}</h1>
          <p className="text-white/60">{t.ticket_number || t.id} · {label(t.status || "open")} · {label(t.priority || "normal")} · {t.assigned_group || "unassigned group"}</p>
          {breached ? <p className="mt-2 font-black text-amber-300">SLA BREACHED</p> : null}

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <form action={supportCaseAction} className="flex gap-2">
              <input type="hidden" name="ticket_id" value={t.id} />
              {!assignedToMe ? (
                <button name="operation" value="assign_self" className="rounded-xl bg-white/10 px-3 py-2 text-sm font-bold hover:bg-white/15">
                  {assigned ? "Assign to me" : "Assign to me"}
                </button>
              ) : null}
              {assigned ? (
                <button name="operation" value="unassign" className="rounded-xl bg-white/5 px-3 py-2 text-sm font-bold hover:bg-white/10">
                  Unassign
                </button>
              ) : null}
              {!assigned ? <span className="self-center text-sm text-white/45">Currently unassigned</span> : null}
            </form>

            <form action={supportCaseAction} className="flex gap-2">
              <input type="hidden" name="ticket_id" value={t.id} />
              <input type="hidden" name="operation" value="group" />
              <select name="group" defaultValue={t.assigned_group || ""} className="min-w-0 flex-1 rounded-xl bg-black/40 px-3 py-2">
                <option value="">Unassigned group</option>
                {s.groups.filter((g: any) => g.active).map((g: any) => <option key={g.key} value={g.key}>{g.name}</option>)}
              </select>
              <button className="rounded-xl bg-white/10 px-3 py-2 font-bold hover:bg-white/15">Set</button>
            </form>

            <form action={supportCaseAction} className="flex gap-2">
              <input type="hidden" name="ticket_id" value={t.id} />
              <input type="hidden" name="operation" value="status" />
              <select name="status" defaultValue={t.status || "open"} className="min-w-0 flex-1 rounded-xl bg-black/40 px-3 py-2">
                {SUPPORT_STATUSES.map((x) => <option key={x} value={x}>{label(x)}</option>)}
              </select>
              <button className="rounded-xl bg-white/10 px-3 py-2 font-bold hover:bg-white/15">Update</button>
            </form>

            <form action={supportCaseAction} className="flex gap-2">
              <input type="hidden" name="ticket_id" value={t.id} />
              <input type="hidden" name="operation" value="priority" />
              <select name="priority" defaultValue={t.priority || "normal"} className="min-w-0 flex-1 rounded-xl bg-black/40 px-3 py-2">
                {SUPPORT_PRIORITIES.map((x) => <option key={x} value={x}>{label(x)}</option>)}
              </select>
              <button className="rounded-xl bg-white/10 px-3 py-2 font-bold hover:bg-white/15">Update</button>
            </form>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-3">
          <Card title="Customer conversation">
            <div className="mb-4 max-h-[420px] space-y-3 overflow-y-auto">
              {d.messages.filter((m: any) => !m.internal_note).map((m: any) => (
                <div key={m.id} className="rounded-xl bg-black/30 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-black text-white/70">{m.author_name || m.sender_role || m.actor_type || "Support"}</p>
                    <p className="text-xs text-white/40">{m.channel ? label(m.channel) : ""}{m.delivery_status ? ` · ${label(m.delivery_status)}` : ""}</p>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap">{m.body || m.message}</p>
                </div>
              ))}
            </div>
            <form action={supportCaseAction} className="space-y-2">
              <input type="hidden" name="ticket_id" value={t.id} />
              <input type="hidden" name="operation" value="reply" />
              <textarea name="body" required rows={4} placeholder="Reply to customer..." className="w-full rounded-xl border border-white/10 bg-black/30 p-3 text-sm" />
              <button className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-black hover:bg-rose-500">Send reply</button>
            </form>
          </Card>

          <Card title="Agent tools">
            <form action={supportCaseAction} className="space-y-2">
              <input type="hidden" name="ticket_id" value={t.id} />
              <input type="hidden" name="operation" value="macro" />
              <select name="macro_key" required defaultValue="" className="w-full rounded-xl bg-black/40 p-3">
                <option value="" disabled>Choose macro</option>
                {s.macros.filter((m: any) => m.active).map((m: any) => <option key={m.key} value={m.key}>{m.name}</option>)}
              </select>
              <button className="w-full rounded-xl bg-rose-600 px-4 py-2 font-black hover:bg-rose-500">Apply macro</button>
            </form>

            <form action={supportCaseAction} className="mt-4 space-y-2">
              <input type="hidden" name="ticket_id" value={t.id} />
              <input type="hidden" name="operation" value="tags" />
              <input name="tags" defaultValue={(t.tags || []).join(", ")} placeholder="billing, vip, website" className="w-full rounded-xl bg-black/40 p-3" />
              <button className="rounded-xl bg-white/10 px-4 py-2 font-bold hover:bg-white/15">Save tags</button>
            </form>

            <form action={supportCaseAction} className="mt-4 space-y-2">
              <input type="hidden" name="ticket_id" value={t.id} />
              <input type="hidden" name="operation" value="internal_note" />
              <textarea name="body" required rows={4} placeholder="Internal note..." className="w-full rounded-xl bg-black/40 p-3" />
              <button className="rounded-xl bg-white/10 px-4 py-2 font-bold hover:bg-white/15">Add note</button>
            </form>

            <div className="mt-4 flex flex-wrap gap-2">
              {!terminal && t.status !== "escalated" ? <ActionButton ticketId={t.id} operation="escalate" label="Escalate" className="bg-amber-500/20" /> : null}
              {!terminal ? <ActionButton ticketId={t.id} operation="resolve" label="Resolve" className="bg-emerald-500/20" /> : null}
              {t.status !== "closed" ? <ActionButton ticketId={t.id} operation="close" label="Close" className="bg-white/10" /> : null}
              {terminal ? <ActionButton ticketId={t.id} operation="reopen" label="Reopen" className="bg-sky-500/20" /> : null}
            </div>
          </Card>

          <Card title="SLA and follow-up">
            <p>First response: {t.first_response_at ? new Date(t.first_response_at).toLocaleString() : "pending"}</p>
            <p>First response due: {t.sla_first_response_due_at ? new Date(t.sla_first_response_due_at).toLocaleString() : "not configured"}</p>
            <p>Resolution due: {t.sla_resolution_due_at ? new Date(t.sla_resolution_due_at).toLocaleString() : "not configured"}</p>
            <p>Resolution: {t.resolved_at || t.closed_at ? new Date(t.resolved_at || t.closed_at).toLocaleString() : "pending"}</p>
            <form action={supportCaseAction} className="mt-5 space-y-2 border-t border-white/10 pt-4">
              <input type="hidden" name="ticket_id" value={t.id} />
              <input type="hidden" name="location_id" value={t.location_id || ""} />
              <input type="hidden" name="operation" value="create_task" />
              <input name="title" required defaultValue={`Follow up on ${t.ticket_number || t.id}`} className="w-full rounded-xl bg-black/30 p-3" />
              <textarea name="description" rows={3} defaultValue={`Support follow-up for: ${t.subject}`} className="w-full rounded-xl bg-black/30 p-3" />
              <button className="rounded-xl bg-white/10 px-4 py-2 font-black hover:bg-white/15">Create CRM task</button>
            </form>
          </Card>
        </section>
      </main>
    </CrmWorkspaceShell>
  );
}

function ActionButton({ ticketId, operation, label: text, className }: { ticketId: string; operation: string; label: string; className: string }) {
  return (
    <form action={supportCaseAction}>
      <input type="hidden" name="ticket_id" value={ticketId} />
      <button name="operation" value={operation} className={`rounded-xl px-3 py-2 font-bold hover:brightness-125 ${className}`}>{text}</button>
    </form>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <article className="rounded-2xl border border-white/10 bg-white/[.04] p-4"><h2 className="mb-3 text-xl font-black">{title}</h2>{children}</article>;
}
