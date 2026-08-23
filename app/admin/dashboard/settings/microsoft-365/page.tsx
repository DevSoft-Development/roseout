import Link from "next/link";

import { getCurrentAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | undefined>>;

export default async function Microsoft365SettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const admin = await getCurrentAdmin();
  const params = await searchParams;
  const [{ data: connection }, { data: preferences }, { count: unmatchedCount }, { count: calendarCount }, { count: taskCount }, { count: linkedTaskCount }] = await Promise.all([
    supabaseAdmin.from("microsoft_365_connections").select("email,display_name,status,granted_scopes,connected_at,last_refreshed_at,last_error").eq("user_id", admin.user_id).maybeSingle(),
    supabaseAdmin.from("microsoft_365_sync_preferences").select("*").eq("user_id", admin.user_id).maybeSingle(),
    supabaseAdmin.from("microsoft_365_unmatched_email").select("id", { count: "exact", head: true }).eq("user_id", admin.user_id).eq("status", "pending"),
    supabaseAdmin.from("microsoft_365_calendar_events").select("id", { count: "exact", head: true }).eq("user_id", admin.user_id),
    supabaseAdmin.from("microsoft_365_todo_tasks").select("id", { count: "exact", head: true }).eq("user_id", admin.user_id),
    supabaseAdmin.from("microsoft_365_todo_tasks").select("id", { count: "exact", head: true }).eq("user_id", admin.user_id).not("matched_crm_task_id", "is", null),
  ]);

  const connected = connection?.status === "active";
  const pref = {
    email_sync_enabled: preferences?.email_sync_enabled ?? true,
    email_sync_mode: preferences?.email_sync_mode ?? "crm_related_only",
    include_internal_mail: preferences?.include_internal_mail ?? false,
    sync_attachments: preferences?.sync_attachments ?? false,
    queue_unmatched_email: preferences?.queue_unmatched_email ?? true,
    calendar_sync_enabled: preferences?.calendar_sync_enabled ?? true,
    calendar_sync_direction: preferences?.calendar_sync_direction ?? "two_way",
    task_sync_enabled: preferences?.task_sync_enabled ?? true,
    task_sync_direction: preferences?.task_sync_direction ?? "two_way",
    task_link_to_crm: preferences?.task_link_to_crm ?? true,
  };

  return (
    <main className="admin-page px-4 pb-16 pt-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="admin-kicker text-xs font-black uppercase tracking-[0.24em]">TheOutHaven workspace</p>
            <h1 className="mt-2 text-3xl font-black">Microsoft 365 Sync</h1>
            <p className="admin-muted mt-2 max-w-3xl text-sm">Connect Outlook mail, Calendar, and Microsoft To Do without turning the CRM into a full mailbox mirror.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/dashboard/crm/calendar" className="admin-primary rounded-xl px-4 py-2 text-sm">Open calendar</Link>
            <Link href="/admin/dashboard/settings" className="admin-secondary rounded-xl px-4 py-2 text-sm">Back to settings</Link>
          </div>
        </header>

        {params.connected ? <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.08] p-4 text-sm text-emerald-100">Microsoft 365 connected successfully.</div> : null}
        {params.saved ? <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.08] p-4 text-sm text-emerald-100">Sync preferences saved.</div> : null}
        {params.synced ? <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.08] p-4 text-sm text-emerald-100">Microsoft 365 sync completed.</div> : null}
        {params.error ? <div className="rounded-2xl border border-rose-300/20 bg-rose-300/[0.08] p-4 text-sm text-rose-100">{params.error}</div> : null}

        <section className="grid gap-4 md:grid-cols-4">
          <div className="admin-card rounded-2xl p-5 md:col-span-2">
            <p className="admin-muted text-xs font-bold uppercase tracking-widest">Connection</p>
            <h2 className="mt-2 text-xl font-black">{connected ? connection.email : "Not connected"}</h2>
            <p className="admin-muted mt-1 text-sm">{connected ? `${connection.display_name || "Microsoft 365 user"} · ${connection.status}` : "Use the dedicated TheOutHaven Microsoft 365 integration app."}</p>
            {connection?.last_error ? <p className="mt-3 rounded-xl bg-rose-500/10 p-3 text-xs text-rose-100/80">{connection.last_error}</p> : null}
            <div className="mt-5 flex flex-wrap gap-2">
              {!connected ? <a href="/api/admin/integrations/microsoft-365/connect" className="admin-primary rounded-xl px-4 py-2 text-sm">Connect Microsoft 365</a> : (
                <>
                  <form action="/api/admin/integrations/microsoft-365/sync" method="post"><button className="admin-primary rounded-xl px-4 py-2 text-sm">Sync now</button></form>
                  <Link href="/admin/dashboard/crm/calendar" className="admin-secondary rounded-xl px-4 py-2 text-sm">View Outlook calendar</Link>
                  <form action="/api/admin/integrations/microsoft-365/disconnect" method="post"><button className="admin-secondary rounded-xl px-4 py-2 text-sm">Disconnect</button></form>
                </>
              )}
            </div>
          </div>
          <div className="admin-card rounded-2xl p-5"><b className="text-3xl">{unmatchedCount || 0}</b><p className="admin-muted mt-1 text-sm">Unmatched email</p></div>
          <div className="admin-card rounded-2xl p-5"><b className="text-3xl">{(calendarCount || 0) + (taskCount || 0)}</b><p className="admin-muted mt-1 text-sm">Calendar + task items</p><p className="mt-1 text-xs text-white/35">{linkedTaskCount || 0} tasks linked to CRM</p></div>
        </section>

        <form action="/api/admin/integrations/microsoft-365/preferences" method="post" className="space-y-5">
          <section className="admin-card rounded-2xl p-6">
            <div className="flex items-center justify-between gap-4"><div><h2 className="text-xl font-black">Outlook email</h2><p className="admin-muted mt-1 text-sm">Only CRM-related messages are persisted by default.</p></div><input aria-label="Enable email sync" name="email_sync_enabled" type="checkbox" defaultChecked={pref.email_sync_enabled} className="h-5 w-5" /></div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="text-sm font-bold">Sync mode<select name="email_sync_mode" defaultValue={pref.email_sync_mode} className="admin-field mt-2 w-full rounded-xl p-3"><option value="crm_related_only">CRM-related email only</option><option value="all">All external email into review/matching</option></select></label>
              <div className="space-y-3 text-sm">
                <label className="flex items-center gap-3"><input name="queue_unmatched_email" type="checkbox" defaultChecked={pref.queue_unmatched_email} /> Queue uncertain external email for review</label>
                <label className="flex items-center gap-3"><input name="include_internal_mail" type="checkbox" defaultChecked={pref.include_internal_mail} /> Include internal @theouthaven.com mail</label>
                <label className="flex items-center gap-3"><input name="sync_attachments" type="checkbox" defaultChecked={pref.sync_attachments} /> Copy CRM attachment files into TheOutHaven</label>
              </div>
            </div>
            <p className="mt-4 text-xs text-white/40">Unmatched email stores sender/recipient/subject/preview metadata only. Full message body is persisted after CRM matching.</p>
          </section>

          <section className="grid gap-5 md:grid-cols-2">
            <div className="admin-card rounded-2xl p-6">
              <div className="flex items-center justify-between"><h2 className="text-xl font-black">Outlook Calendar</h2><input name="calendar_sync_enabled" type="checkbox" defaultChecked={pref.calendar_sync_enabled} /></div>
              <select name="calendar_sync_direction" defaultValue={pref.calendar_sync_direction} className="admin-field mt-4 w-full rounded-xl p-3 text-sm"><option value="two_way">Two-way sync</option><option value="microsoft_to_theouthaven">Microsoft → TheOutHaven</option><option value="theouthaven_to_microsoft">TheOutHaven → Microsoft</option></select>
              <p className="admin-muted mt-3 text-xs">CRM matches are based on organizer and attendee email addresses.</p>
              <Link href="/admin/dashboard/crm/calendar" className="mt-4 inline-flex text-sm font-black text-rose-300 hover:text-rose-200">Open synced calendar →</Link>
            </div>
            <div className="admin-card rounded-2xl p-6">
              <div className="flex items-center justify-between"><h2 className="text-xl font-black">Microsoft To Do</h2><input name="task_sync_enabled" type="checkbox" defaultChecked={pref.task_sync_enabled} /></div>
              <select name="task_sync_direction" defaultValue={pref.task_sync_direction} className="admin-field mt-4 w-full rounded-xl p-3 text-sm"><option value="two_way">Two-way sync</option><option value="microsoft_to_theouthaven">Microsoft → TheOutHaven</option><option value="theouthaven_to_microsoft">TheOutHaven → Microsoft</option></select>
              <label className="mt-4 flex items-start gap-3 rounded-xl border border-rose-300/20 bg-rose-300/[0.06] p-3 text-sm"><input name="task_link_to_crm" type="checkbox" defaultChecked={pref.task_link_to_crm} className="mt-0.5" /><span><b className="block text-rose-100">Link To Do with CRM Tasks by default</b><span className="admin-muted mt-1 block">Every synced To Do item gets an assigned CRM task, and assigned CRM tasks sync back to Microsoft To Do.</span></span></label>
              <p className="admin-muted mt-3 text-xs">Two-way sync keeps title, description, status, priority, due date, reminder, and completion state aligned. CRM-created tasks use a dedicated “TheOutHaven CRM” To Do list.</p>
            </div>
          </section>

          <button className="admin-primary rounded-xl px-5 py-3 text-sm">Save Microsoft 365 sync settings</button>
        </form>
      </div>
    </main>
  );
}
