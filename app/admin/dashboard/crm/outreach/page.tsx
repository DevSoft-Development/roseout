import Link from "next/link";
import CrmContextBanner from "@/components/admin/crm/CrmContextBanner";
import { parseCrmContextSearchParams, withCrmContext } from "@/lib/crm/context";
import CrmWorkspaceShell from "@/components/admin/crm/CrmWorkspaceShell";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { listOutreach } from "@/lib/crm/core-modules";

export const dynamic = "force-dynamic";
const channels = ["social_outreach", "email_outreach", "phone_outreach", "site_visit", "follow_up", "claim_code_delivery"];
const contextFields = ["account_id", "contact_id", "location_id", "opportunity_id", "return_to"] as const;

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
          <p className="text-xs font-black uppercase tracking-[.25em] text-rose-300">Outreach</p>
          <h1 className="text-3xl font-black">Outreach workspace</h1>
          <p className="text-white/60">Real CRM tasks for social, email, phone, follow-ups, claim invitations, and site visits.</p>
        </header>
        <form className="grid gap-2 md:grid-cols-5">
          {contextFields.map((name) => p[name] ? <input key={name} type="hidden" name={name} value={p[name]} /> : null)}
          <input name="q" defaultValue={p.q} placeholder="Search interactions" className="rounded-lg bg-black/40 p-2" />
          <select name="channel" defaultValue={p.channel || ""} className="rounded-lg bg-black p-2">
            <option value="">All channels</option>
            {channels.map((x) => <option key={x}>{x}</option>)}
          </select>
          <select name="status" defaultValue={p.status || ""} className="rounded-lg bg-black p-2">
            <option value="">All statuses</option>
            {["open", "in_progress", "completed", "blocked", "cancelled"].map((x) => <option key={x}>{x}</option>)}
          </select>
          <button className="rounded-lg bg-white font-black text-black">Apply</button>
        </form>
        <div className="grid gap-3 lg:grid-cols-2">
          {r.rows.map((x: any) => (
            <Link
              href={withCrmContext(`/admin/dashboard/crm/work-queue/${x.id}`, context, { return_to: p.return_to })}
              key={x.id}
              className="rounded-2xl border border-white/10 bg-white/[.04] p-4"
            >
              <b>{x.title}</b>
              <p className="text-sm text-white/55">{x.task_type} · {x.status} · owner {x.assigned_to_user_id || "unassigned"}</p>
              <p className="text-sm text-white/45">{x.crm_accounts?.name || x.locations?.name || "No linked account/location"} · next {x.next_follow_up_at || x.due_at || "—"}</p>
            </Link>
          ))}
        </div>
        {!r.rows.length ? <p className="rounded-2xl border border-dashed border-white/15 p-8 text-white/60">No outreach records match these filters.</p> : null}
      </main>
    </CrmWorkspaceShell>
  );
}
