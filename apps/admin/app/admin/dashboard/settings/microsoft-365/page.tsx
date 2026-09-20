import "./microsoft-365.css";

import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import {
  AdminActionButton,
  AdminPageHeader,
  AdminPageShell,
  AdminStatusBadge,
} from "../../../../../components/admin/AdminDesignSystem";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | undefined>>;

export default async function Microsoft365SettingsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const admin = await getCurrentAdmin();
  const params = await searchParams;
  const adminDb = getAdminDatabaseClient();

  const [
    { data: connection },
    { data: preferences },
    { count: unmatchedCount },
    { count: calendarCount },
    { count: taskCount },
    { count: linkedTaskCount },
  ] = await Promise.all([
    adminDb
      .from("microsoft_365_connections")
      .select(
        "email,display_name,status,granted_scopes,connected_at,last_refreshed_at,last_error",
      )
      .eq("user_id", admin.user_id)
      .maybeSingle(),
    adminDb
      .from("microsoft_365_sync_preferences")
      .select("*")
      .eq("user_id", admin.user_id)
      .maybeSingle(),
    adminDb
      .from("microsoft_365_unmatched_email")
      .select("id", { count: "exact", head: true })
      .eq("user_id", admin.user_id)
      .eq("status", "pending"),
    adminDb
      .from("microsoft_365_calendar_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", admin.user_id),
    adminDb
      .from("microsoft_365_todo_tasks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", admin.user_id),
    adminDb
      .from("microsoft_365_todo_tasks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", admin.user_id)
      .not("matched_crm_task_id", "is", null),
  ]);

  const connected = connection?.status === "active";
  const intentionallyDisconnected = params.disconnected === "1";
  const connectionError = Boolean(params.error);

  if (!connected && !intentionallyDisconnected && !connectionError) {
    const autoConnect = new URLSearchParams({
      auto: "1",
      next: "/admin/dashboard/settings/microsoft-365",
    });
    redirect("/api/admin/integrations/microsoft-365/connect?" + autoConnect.toString());
  }
  const pref = {
    email_sync_enabled: preferences?.email_sync_enabled ?? true,
    email_sync_mode: preferences?.email_sync_mode ?? "crm_related_only",
    include_internal_mail: preferences?.include_internal_mail ?? false,
    sync_attachments: preferences?.sync_attachments ?? false,
    queue_unmatched_email: preferences?.queue_unmatched_email ?? true,
    calendar_sync_enabled: preferences?.calendar_sync_enabled ?? true,
    calendar_sync_direction:
      preferences?.calendar_sync_direction ?? "two_way",
    task_sync_enabled: preferences?.task_sync_enabled ?? true,
    task_sync_direction: preferences?.task_sync_direction ?? "two_way",
    task_link_to_crm: preferences?.task_link_to_crm ?? true,
  };

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="System · Microsoft 365"
        title="Microsoft 365 Sync"
        subtitle="Connect Outlook mail, Calendar, and Microsoft To Do without turning the CRM into a full mailbox mirror."
        badge={<AdminStatusBadge tone={connected ? "green" : "amber"}>{connected ? "Connected" : "Connection required"}</AdminStatusBadge>}
        actions={
          <>
            <AdminActionButton href="/admin/dashboard/crm/calendar">Open Calendar</AdminActionButton>
            <AdminActionButton href="/admin/dashboard">Dashboard</AdminActionButton>
          </>
        }
      />
      <div className="m365-page">

      <div className="m365-notices">
        {params.connected ? (
          <div className="success">Microsoft 365 connected successfully.</div>
        ) : null}
        {params.saved ? (
          <div className="success">Sync preferences saved.</div>
        ) : null}
        {params.synced ? (
          <div className="success">Microsoft 365 sync completed.</div>
        ) : null}
        {params.disconnected ? (
          <div className="success">Microsoft 365 disconnected.</div>
        ) : null}
        {params.error ? <div className="error">{params.error}</div> : null}
      </div>

      <section className="m365-summary">
        <article className="m365-connection">
          <small>Connection</small>
          <h2>{connected ? connection.email : "Not connected"}</h2>
          <p>
            {connected
              ? `${connection.display_name || "Microsoft 365 user"} · ${connection.status}`
              : "Use the dedicated TheOutHaven Microsoft 365 integration app."}
          </p>
          {!params.error && connection?.last_error ? (
            <div className="m365-error-detail">
              Previous connection error: {connection.last_error}
            </div>
          ) : null}

          <div className="m365-actions">
            {!connected ? (
              connectionError || intentionallyDisconnected ? (
                <a href="/api/admin/integrations/microsoft-365/connect?consent=1&next=/admin/dashboard/settings/microsoft-365">
                  Reauthorize Microsoft 365
                </a>
              ) : null
            ) : (
              <>
                <form
                  action="/api/admin/integrations/microsoft-365/sync"
                  method="post"
                >
                  <button type="submit">Sync now</button>
                </form>
                <a href="/api/admin/integrations/microsoft-365/connect?consent=1&next=/admin/dashboard/settings/microsoft-365">
                  Reauthorize
                </a>
                <form
                  action="/api/admin/integrations/microsoft-365/disconnect"
                  method="post"
                >
                  <button type="submit" className="secondary">
                    Disconnect
                  </button>
                </form>
              </>
            )}
          </div>
        </article>

        <article className="m365-stat">
          <strong>{unmatchedCount || 0}</strong>
          <span>Unmatched email</span>
        </article>

        <article className="m365-stat">
          <strong>{(calendarCount || 0) + (taskCount || 0)}</strong>
          <span>Calendar + task items</span>
          <small>{linkedTaskCount || 0} tasks linked to CRM</small>
        </article>
      </section>

      <form
        action="/api/admin/integrations/microsoft-365/preferences"
        method="post"
        className="m365-settings"
      >
        <section className="m365-card">
          <div className="m365-section-title">
            <div>
              <h2>Outlook email</h2>
              <p>Only CRM-related messages are persisted by default.</p>
            </div>
            <input
              aria-label="Enable email sync"
              name="email_sync_enabled"
              type="checkbox"
              defaultChecked={pref.email_sync_enabled}
            />
          </div>

          <div className="m365-grid-two">
            <label>
              Sync mode
              <select
                name="email_sync_mode"
                defaultValue={pref.email_sync_mode}
              >
                <option value="crm_related_only">CRM-related email only</option>
                <option value="all">
                  All external email into review/matching
                </option>
              </select>
            </label>

            <div className="m365-checklist">
              <label>
                <input
                  name="queue_unmatched_email"
                  type="checkbox"
                  defaultChecked={pref.queue_unmatched_email}
                />
                Queue uncertain external email for review
              </label>
              <label>
                <input
                  name="include_internal_mail"
                  type="checkbox"
                  defaultChecked={pref.include_internal_mail}
                />
                Include internal @theouthaven.com mail
              </label>
              <label>
                <input
                  name="sync_attachments"
                  type="checkbox"
                  defaultChecked={pref.sync_attachments}
                />
                Copy CRM attachment files into TheOutHaven
              </label>
            </div>
          </div>

          <small>
            Unmatched email stores sender/recipient/subject/preview metadata
            only. Full message body is persisted after CRM matching.
          </small>
        </section>

        <section className="m365-grid-two">
          <article className="m365-card">
            <div className="m365-section-title">
              <h2>Outlook Calendar</h2>
              <input
                aria-label="Enable calendar sync"
                name="calendar_sync_enabled"
                type="checkbox"
                defaultChecked={pref.calendar_sync_enabled}
              />
            </div>

            <select
              name="calendar_sync_direction"
              defaultValue={pref.calendar_sync_direction}
            >
              <option value="two_way">Two-way sync</option>
              <option value="microsoft_to_theouthaven">
                Microsoft → TheOutHaven
              </option>
              <option value="theouthaven_to_microsoft">
                TheOutHaven → Microsoft
              </option>
            </select>

            <p>
              CRM matches are based on organizer and attendee email addresses.
            </p>
            <Link href="/admin/dashboard/crm/calendar">
              Open synced calendar →
            </Link>
          </article>

          <article className="m365-card">
            <div className="m365-section-title">
              <h2>Microsoft To Do</h2>
              <input
                aria-label="Enable task sync"
                name="task_sync_enabled"
                type="checkbox"
                defaultChecked={pref.task_sync_enabled}
              />
            </div>

            <select
              name="task_sync_direction"
              defaultValue={pref.task_sync_direction}
            >
              <option value="two_way">Two-way sync</option>
              <option value="microsoft_to_theouthaven">
                Microsoft → TheOutHaven
              </option>
              <option value="theouthaven_to_microsoft">
                TheOutHaven → Microsoft
              </option>
            </select>

            <label className="m365-feature-toggle">
              <input
                name="task_link_to_crm"
                type="checkbox"
                defaultChecked={pref.task_link_to_crm}
              />
              <span>
                <b>Link To Do with CRM Tasks by default</b>
                <small>
                  Synced To Do items get CRM tasks, and assigned CRM tasks sync
                  back to Microsoft To Do.
                </small>
              </span>
            </label>

            <p>
              Two-way sync keeps title, description, status, priority, due date,
              reminder, and completion state aligned.
            </p>
          </article>
        </section>

        <button type="submit" className="m365-save">
          Save Microsoft 365 sync settings
        </button>
      </form>
      </div>
    </AdminPageShell>
  );
}
