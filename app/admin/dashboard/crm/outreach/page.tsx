import Link from "next/link";
import CrmContextBanner from "@/components/admin/crm/CrmContextBanner";
import { parseCrmContextSearchParams, withCrmContext } from "@/lib/crm/context";
import CrmWorkspaceShell from "@/components/admin/crm/CrmWorkspaceShell";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { listOutreach } from "@/lib/crm/core-modules";

export const dynamic = "force-dynamic";
const channels = [
  ["social_outreach", "Social"],
  ["email_outreach", "Email"],
  ["phone_outreach", "Phone"],
  ["site_visit", "Site visit"],
  ["follow_up", "Follow-up"],
  ["claim_code_delivery", "Claim invitation"],
] as const;
const contextFields = ["account_id", "contact_id", "location_id", "opportunity_id", "return_to"] as const;

function channelLabel(value?: string | null) {
  return channels.find(([id]) => id === value)?.[1] || String(value || "Communication").replaceAll("_", " ");
}

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdminRole(ADMIN_PAGE_ACCESS.crm);
  const p = await searchParams;
  const context = parseCrmContextSearchParams(p);
  const r = await listOutreach(p);

  return (
    <CrmWorkspaceShell>
      <main className="space-y-5 text-white">
        <CrmContextBanner context={context} />
        <header>
          <p className="text-xs font-black uppercase tracking-[.25em] text-rose-300">CRM</p>
          <h1 className="text-3xl font-black">Communications</h1>
          <p className="mt-1 text-white/60">Manage phone, email, social outreach, visits, and follow-ups in one place.</p>
        </header>

        <div className="flex flex-wrap gap-2">
          <Link href="/admin/dashboard/crm/calls" className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-black text-white">Start a call</Link>
        </div>

        <form className="grid gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:grid-cols-4">
          {contextFields.map((name) => p[name] ? <input key={name} type="hidden" name={name} value={p[name]} /> : null)}
          <input name="q" defaultValue={p.q} placeholder="Search communications" className="rounded-xl bg-black/30 p-3" />
          <select name="channel" defaultValue={p.channel || ""} className="rounded-xl bg-black/30 p-3">
            <option value="">All channels</option>
            {channels.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <select name="status" defaultValue={p.status || ""} className="rounded-xl bg-black/30 p-3">
            <option value="">All statuses</option>
            {["open", "in_progress", "completed", "blocked", "cancelled"].map((x) => <option key={x} value={x}>{x.replaceAll("_", " ")}</option>)}
          </select>
          <button className="rounded-xl bg-white font-black text-black">Apply filters</button>
        </form>

        <div className="grid gap-3 lg:grid-cols-2">
          {r.rows.map((x: any) => (
            <Link
              href={withCrmContext(`/admin/dashboard/crm/work-queue/${x.id}`, context, { return_to: p.return_to })}
              key={x.id}
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition hover:border-rose-200/30 hover:bg-white/[0.06]"
            >
              <div className="flex items-start justify-between gap-3">
                <b className="text-white">{x.title}</b>
                <span className="rounded-full bg-white/10 px-2 py-1 text-xs font-bold capitalize text-white/65">{String(x.status || "open").replaceAll("_", " ")}</span>
              </div>
              <p className="mt-2 text-sm text-white/60">{channelLabel(x.task_type)} · {x.assigned_to_user_id ? "Assigned" : "Unassigned"}</p>
              <p className="mt-1 text-sm text-white/45">{x.crm_accounts?.name || x.locations?.name || "CRM record"}</p>
              <p className="mt-3 text-xs font-bold text-rose-200">{x.next_follow_up_at || x.due_at ? `Follow up ${new Date(x.next_follow_up_at || x.due_at).toLocaleDateString()}` : "Open details"}</p>
            </Link>
          ))}
        </div>
        {!r.rows.length ? <p className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-white/60">No communications match these filters.</p> : null}
      </main>
    </CrmWorkspaceShell>
  );
}
