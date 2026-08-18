import Link from "next/link";
import CrmWorkspaceShell from "@/components/admin/crm/CrmWorkspaceShell";
import { requireAdminRole } from "@/lib/admin-auth";
import { CRM_READ_ROLES } from "@/lib/crm/permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { dismissCrmMessageNotification, markCrmMessageNotificationRead } from "./actions";

export const dynamic = "force-dynamic";

function formatWhen(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default async function CrmNotificationsPage() {
  await requireAdminRole(CRM_READ_ROLES);

  const { data: notifications, error } = await supabaseAdmin
    .from("crm_message_notifications")
    .select("id,title,body,action_href,notification_type,severity,routing_status,read_at,created_at")
    .is("dismissed_at", null)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw error;

  const rows = notifications || [];
  const unread = rows.filter((row) => !row.read_at).length;
  const unmatched = rows.filter((row) => row.routing_status === "unmatched" && !row.read_at).length;
  const compliance = rows.filter((row) => row.notification_type === "compliance_keyword" && !row.read_at).length;

  return (
    <CrmWorkspaceShell>
      <main className="space-y-5 text-white">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-rose-300">CRM</p>
            <h1 className="text-3xl font-black">Notifications</h1>
            <p className="mt-1 text-white/60">Inbound SMS alerts from the TheOutHaven main CRM number.</p>
          </div>
          <Link href="/admin/dashboard/crm/communications/unmatched" className="rounded-xl border border-white/15 px-4 py-2 font-bold text-white hover:bg-white/5">
            Open unmatched inbox
          </Link>
        </header>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[["Unread", unread], ["Unmatched", unmatched], ["Compliance", compliance]].map(([label, value]) => (
            <div key={String(label)} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <b className="text-2xl">{value}</b>
              <small className="mt-1 block text-white/50">{label}</small>
            </div>
          ))}
        </section>

        <section className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
          {rows.length ? rows.map((row) => (
            <article key={row.id} className={`border-t border-white/10 p-4 first:border-t-0 ${row.read_at ? "opacity-65" : "bg-white/[0.03]"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {!row.read_at ? <span className="h-2.5 w-2.5 rounded-full bg-rose-400" aria-label="Unread" /> : null}
                    <h2 className="font-black">{row.title}</h2>
                    <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white/55">
                      {String(row.routing_status).replaceAll("_", " ")}
                    </span>
                    {row.severity !== "normal" ? (
                      <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-200">
                        {row.severity}
                      </span>
                    ) : null}
                  </div>
                  {row.body ? <p className="mt-2 whitespace-pre-wrap text-sm text-white/70">{row.body}</p> : null}
                  <p className="mt-2 text-xs text-white/40">{formatWhen(row.created_at)}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Link href={row.action_href} className="rounded-lg bg-white px-3 py-2 text-xs font-black text-black">
                    Open
                  </Link>
                  {!row.read_at ? (
                    <form action={markCrmMessageNotificationRead.bind(null, row.id)}>
                      <button className="rounded-lg border border-white/15 px-3 py-2 text-xs font-bold">Mark read</button>
                    </form>
                  ) : null}
                  <form action={dismissCrmMessageNotification.bind(null, row.id)}>
                    <button className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-white/55">Dismiss</button>
                  </form>
                </div>
              </div>
            </article>
          )) : (
            <p className="p-12 text-center text-white/60">No CRM message notifications yet.</p>
          )}
        </section>
      </main>
    </CrmWorkspaceShell>
  );
}
