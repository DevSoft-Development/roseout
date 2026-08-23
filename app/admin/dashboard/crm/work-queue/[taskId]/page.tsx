import Link from "next/link";
import { notFound } from "next/navigation";

import CrmWorkspaceShell from "@/components/admin/crm/CrmWorkspaceShell";
import { requireAdminRole } from "@/lib/admin-auth";
import { listAdminOrganizationPeople } from "@/lib/admin-organization-people";
import { CRM_READ_ROLES } from "@/lib/crm/permissions";
import { getTaskDetail } from "@/lib/crm/tasks/queries";
import { calculateSlaStatus } from "@/lib/crm/tasks/sla";
import { canMutateTask } from "@/lib/crm/tasks/validation";
import { addCommentAction, taskMutationAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ taskId: string }> }) {
  const actor = await requireAdminRole(CRM_READ_ROLES);
  const { taskId } = await params;

  let detail;
  try {
    detail = await getTaskDetail(taskId);
  } catch {
    notFound();
  }

  const organizationPeople = await listAdminOrganizationPeople();
  const t: any = detail.task;
  const editable = canMutateTask(actor.role);
  const assignee = organizationPeople.find((person) => person.userId === t.assigned_to_user_id) || null;

  return (
    <CrmWorkspaceShell>
      <main className="space-y-5 text-white">
        <Link href="/admin/dashboard/crm/work-queue" className="text-rose-300">← Work Queue</Link>

        <header className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="flex flex-wrap justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-widest text-rose-300">{t.queue_key} · {t.task_type}</p>
              <h1 className="text-3xl font-black">{t.title}</h1>
              <p className="mt-2 max-w-3xl whitespace-pre-wrap text-white/65">{t.description || "No description."}</p>
            </div>
            <div className="text-right">
              <b>{t.status}</b>
              <small className="block text-white/50">Version {t.version} · {t.priority} · {t.escalation_level}</small>
            </div>
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-3">
          <section className="space-y-3 rounded-2xl border border-white/10 p-5 lg:col-span-2">
            <h2 className="text-xl font-black">Operational context</h2>
            <dl className="grid gap-3 sm:grid-cols-2">
              {[
                ["Account", t.crm_accounts?.name],
                ["Location", t.locations?.name],
                ["Contact", t.crm_contacts?.full_name],
                ["Opportunity", t.crm_opportunities?.name],
                ["Team", t.assigned_team],
                ["Assignee", assignee ? `${assignee.name} · ${assignee.email}` : t.assigned_to_user_id ? "Assigned user unavailable" : "Unassigned"],
                ["Due", t.due_at ? new Date(t.due_at).toLocaleString() : null],
                ["SLA", calculateSlaStatus(t.service_level_due_at)],
                ["Workflow", t.workflow_stage],
                ["Follow-up", t.next_follow_up_at ? new Date(t.next_follow_up_at).toLocaleString() : null],
                ["Blocked reason", t.blocked_reason],
                ["Escalation reason", t.escalation_reason],
                ["Resolution", t.resolution_summary],
                ["Source", [t.source, t.source_record_id].filter(Boolean).join(" · ")],
              ].map(([key, value]) => (
                <div key={key}>
                  <dt className="text-xs uppercase text-white/40">{key}</dt>
                  <dd>{value || "—"}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="space-y-3 rounded-2xl border border-white/10 p-5">
            <h2 className="text-xl font-black">Actions</h2>

            {editable ? (
              <>
                <form action={taskMutationAction} className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="version" value={t.version} />
                  <input type="hidden" name="operation" value="assign" />
                  <label className="block text-xs font-black uppercase tracking-wider text-white/50">Assign to organization member</label>
                  <select name="assigned_to_user_id" defaultValue={t.assigned_to_user_id || ""} className="w-full rounded-xl bg-black/30 p-2.5 text-sm">
                    <option value="">Unassigned</option>
                    {organizationPeople.map((person) => (
                      <option key={person.userId} value={person.userId}>{person.name} — {person.email}</option>
                    ))}
                  </select>
                  <button className="w-full rounded-xl bg-rose-300 p-2 text-sm font-black text-black">Save assignee</button>
                  <p className="text-[11px] text-white/40">Assigned tasks sync to that person’s Microsoft To Do when their Microsoft 365 task sync is enabled.</p>
                </form>

                <div className="grid grid-cols-2 gap-2">
                  {[
                    ["claim", "Claim"],
                    ["start", "Start"],
                    [t.status === "blocked" ? "unblock" : "block", t.status === "blocked" ? "Unblock" : "Block"],
                    [t.escalation_level === "none" ? "escalate" : "deescalate", t.escalation_level === "none" ? "Escalate" : "Deescalate"],
                    ["reopen", "Reopen"],
                    ["cancel", "Cancel"],
                  ].map(([operation, label]) => (
                    <form action={taskMutationAction} key={operation}>
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="version" value={t.version} />
                      <input type="hidden" name="operation" value={operation} />
                      <button className="w-full rounded-xl border border-white/15 p-2 text-sm font-bold">{label}</button>
                    </form>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-white/60">Read-only access. Reviewers and viewers cannot mutate tasks.</p>
            )}

            {editable && t.status !== "completed" ? (
              <form action={taskMutationAction} className="space-y-2 border-t border-white/10 pt-3">
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="version" value={t.version} />
                <input type="hidden" name="operation" value="complete" />
                <textarea name="resolution_summary" placeholder="Resolution summary (required for operational task types)" className="w-full rounded-xl bg-black/30 p-3" />
                <button className="w-full rounded-xl bg-rose-300 p-2 font-bold text-black">Complete</button>
              </form>
            ) : null}
          </section>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-2xl border border-white/10 p-5">
            <h2 className="mb-4 text-xl font-black">History</h2>
            {detail.history.map((history: any) => (
              <article key={history.id} className="border-t border-white/10 py-3">
                <b>{history.event_type.replaceAll("_", " ")}</b>
                <small className="block text-white/50">{new Date(history.created_at).toLocaleString()} · {history.reason || `Version ${history.metadata?.version || "—"}`}</small>
              </article>
            ))}
          </section>

          <section className="rounded-2xl border border-white/10 p-5">
            <h2 className="mb-4 text-xl font-black">Internal comments</h2>
            {editable ? (
              <form action={addCommentAction} className="mb-4 flex gap-2">
                <input type="hidden" name="id" value={t.id} />
                <textarea name="body" required maxLength={10000} placeholder="Add internal context…" className="min-h-20 flex-1 rounded-xl bg-black/30 p-3" />
                <button className="rounded-xl bg-white px-4 font-bold text-black">Add</button>
              </form>
            ) : null}
            {detail.comments.map((comment: any) => (
              <article key={comment.id} className="border-t border-white/10 py-3">
                <p className="whitespace-pre-wrap">{comment.body}</p>
                <small className="text-white/50">{new Date(comment.created_at).toLocaleString()}</small>
              </article>
            ))}
            <h3 className="mt-5 font-bold">Dependencies</h3>
            {detail.dependencies.length ? detail.dependencies.map((dependency: any) => (
              <p key={dependency.id} className="mt-2 text-sm">Blocked by: {dependency.depends_on?.title} ({dependency.depends_on?.status})</p>
            )) : <p className="text-sm text-white/50">No blocking dependencies.</p>}
          </section>
        </div>
      </main>
    </CrmWorkspaceShell>
  );
}
