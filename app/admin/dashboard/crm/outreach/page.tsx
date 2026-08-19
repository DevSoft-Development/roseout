import Link from "next/link";
import CrmContextBanner from "@/components/admin/crm/CrmContextBanner";
import { parseCrmContextSearchParams, withCrmContext } from "@/lib/crm/context";
import CrmWorkspaceShell from "@/components/admin/crm/CrmWorkspaceShell";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { listOutreach } from "@/lib/crm/core-modules";
import { listLocationCrmCommunications } from "@/lib/crm/location-outreach-communications";

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

function formatCommunicationDate(value?: string | null) {
  if (!value) return "Unknown time";
  return new Date(value).toLocaleString();
}

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdminRole(ADMIN_PAGE_ACCESS.crm);
  const p = await searchParams;
  const context = parseCrmContextSearchParams(p);
  const [r, communications] = await Promise.all([
    listOutreach(p),
    p.location_id ? listLocationCrmCommunications(p.location_id) : Promise.resolve([]),
  ]);

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

        {p.location_id ? (
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[.2em] text-rose-200">Location CRM</p>
                <h2 className="mt-1 text-xl font-black">Communication history</h2>
                <p className="mt-1 text-sm text-white/55">Actual CRM messages sent to and received from this location. Reservation and support traffic is excluded here.</p>
              </div>
              <Link href={`/admin/dashboard/crm/${p.location_id}?tab=communication`} className="rounded-xl border border-white/15 px-3 py-2 text-sm font-black text-white/80">Open full location communications</Link>
            </div>

            <div className="mt-4 space-y-3">
              {communications.map((message) => (
                <article key={message.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-wide text-white/55">
                      <span>{message.channel || "message"}</span>
                      <span>·</span>
                      <span>{message.direction || "outbound"}</span>
                      <span>·</span>
                      <span>{message.status || "sent"}</span>
                    </div>
                    <time className="text-xs text-white/40">{formatCommunicationDate(message.created_at)}</time>
                  </div>
                  {message.subject ? <p className="mt-2 font-black text-white">{message.subject}</p> : null}
                  {message.body ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/70">{message.body}</p> : null}
                  <p className="mt-3 text-xs text-white/40">
                    {message.direction === "inbound" ? message.from_address : message.to_address || message.from_address || "CRM contact"}
                  </p>
                </article>
              ))}
              {!communications.length ? <p className="rounded-xl border border-dashed border-white/15 p-6 text-center text-sm text-white/55">No CRM messages have been logged for this location yet.</p> : null}
            </div>
          </section>
        ) : null}

        <section className="space-y-3">
          <div>
            <h2 className="text-xl font-black">Outreach work</h2>
            <p className="mt-1 text-sm text-white/50">Tasks, follow-ups, site visits, claim delivery work, and other CRM outreach actions.</p>
          </div>
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
          {!r.rows.length ? <p className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-white/60">No outreach work matches these filters.</p> : null}
        </section>
      </main>
    </CrmWorkspaceShell>
  );
}
