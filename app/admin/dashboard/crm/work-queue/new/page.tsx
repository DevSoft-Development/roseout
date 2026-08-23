import Link from "next/link";

import CrmWorkspaceShell from "@/components/admin/crm/CrmWorkspaceShell";
import { requireAdminRole } from "@/lib/admin-auth";
import { listAdminOrganizationPeople } from "@/lib/admin-organization-people";
import { CRM_WRITE_ROLES } from "@/lib/crm/permissions";
import { createTaskAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await requireAdminRole(CRM_WRITE_ROLES);
  const [p, organizationPeople] = await Promise.all([
    searchParams,
    listAdminOrganizationPeople(),
  ]);

  return (
    <CrmWorkspaceShell>
      <main className="mx-auto max-w-3xl space-y-5 text-white">
        <Link href="/admin/dashboard/crm/work-queue" className="text-rose-300">← Work Queue</Link>
        <header>
          <p className="text-xs uppercase tracking-widest text-rose-300">Operational work</p>
          <h1 className="text-3xl font-black">Create Task</h1>
          <p className="mt-2 text-sm text-white/55">Assign work to a TheOutHaven team member. If they have Microsoft 365 task sync enabled, the task also flows to their Microsoft To Do.</p>
        </header>

        <form action={createTaskAction} className="grid gap-4 rounded-2xl border border-white/10 bg-white/[.03] p-6 sm:grid-cols-2">
          <label className="sm:col-span-2">
            Title
            <input name="title" required maxLength={240} className="mt-1 w-full rounded-xl bg-black/30 p-3" />
          </label>

          <label className="sm:col-span-2">
            Description
            <textarea name="description" maxLength={10000} className="mt-1 min-h-28 w-full rounded-xl bg-black/30 p-3" />
          </label>

          {[
            ["queue_key", "Queue", ["general", "sales", "outreach", "claims", "onboarding", "support", "reservations", "billing", "content", "data_quality", "renewals", "partnerships"]],
            ["task_type", "Type", ["follow_up", "outreach", "claim_review", "onboarding", "support", "billing", "reservation", "site_visit", "data_correction", "profile_review", "renewal", "sales", "internal", "other"]],
            ["priority", "Priority", ["low", "normal", "high", "urgent"]],
          ].map(([name, label, values]: any) => (
            <label key={name}>
              {label}
              <select name={name} className="mt-1 w-full rounded-xl bg-black/30 p-3">
                {values.map((value: string) => <option key={value}>{value}</option>)}
              </select>
            </label>
          ))}

          <label>
            Due date
            <input type="datetime-local" name="due_at" className="mt-1 w-full rounded-xl bg-black/30 p-3" />
          </label>

          <label>
            Assign to
            <select name="assigned_to_user_id" defaultValue={actor.user_id} className="mt-1 w-full rounded-xl bg-black/30 p-3">
              <option value="">Unassigned</option>
              {organizationPeople.map((person) => (
                <option key={person.userId} value={person.userId}>
                  {person.name} — {person.email}
                </option>
              ))}
            </select>
          </label>

          <label>
            Team
            <input name="assigned_team" className="mt-1 w-full rounded-xl bg-black/30 p-3" />
          </label>

          {[
            ["account_id", "Account ID", p.account],
            ["location_id", "Location ID", p.location],
            ["contact_id", "Contact ID", p.contact],
            ["opportunity_id", "Opportunity ID", p.opportunity],
          ].map(([name, label, value]) => (
            <label key={name}>
              {label}
              <input name={name} defaultValue={value} className="mt-1 w-full rounded-xl bg-black/30 p-3" />
            </label>
          ))}

          <p className="sm:col-span-2 text-sm text-white/50">At least one relationship is required. The assignee is validated against active TheOutHaven admin users on the server.</p>
          <button className="rounded-xl bg-rose-300 p-3 font-black text-black sm:col-span-2">Create task</button>
        </form>
      </main>
    </CrmWorkspaceShell>
  );
}
