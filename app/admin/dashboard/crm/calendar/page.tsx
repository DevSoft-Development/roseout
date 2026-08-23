import Link from "next/link";

import CalendarEventCreator from "@/components/admin/crm/CalendarEventCreator";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { CRM_WRITE_ROLES } from "@/lib/crm/permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const EASTERN_TIME_ZONE = "America/New_York";
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type SearchParams = Promise<Record<string, string | undefined>>;

type CalendarEvent = {
  id: string;
  subject: string | null;
  body_preview: string | null;
  starts_at: string | null;
  ends_at: string | null;
  location_name: string | null;
  organizer_email: string | null;
  attendee_emails: string[] | null;
  is_all_day: boolean | null;
  web_link: string | null;
  matched_contact_id: string | null;
  matched_account_id: string | null;
  matched_location_id: string | null;
  matched_task_id: string | null;
};

function easternParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  return { year: value("year"), month: value("month"), day: value("day") };
}

function easternDateKey(value: string | Date) {
  const { year, month, day } = easternParts(value instanceof Date ? value : new Date(value));
  return `${year}-${month}-${day}`;
}

function currentMonthKey() {
  const { year, month } = easternParts(new Date());
  return `${year}-${month}`;
}

function parseMonth(raw?: string) {
  const fallback = currentMonthKey();
  const candidate = /^\d{4}-\d{2}$/.test(raw || "") ? raw! : fallback;
  const [year, month] = candidate.split("-").map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    const [fallbackYear, fallbackMonth] = fallback.split("-").map(Number);
    return { year: fallbackYear, month: fallbackMonth, key: fallback };
  }
  return { year, month, key: `${year}-${String(month).padStart(2, "0")}` };
}

function shiftMonth(year: number, month: number, amount: number) {
  const date = new Date(Date.UTC(year, month - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function dateKeyUtc(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function formatMonth(year: number, month: number) {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function formatEventTime(event: CalendarEvent) {
  if (event.is_all_day) return "All day";
  if (!event.starts_at) return "Time unavailable";
  const start = new Date(event.starts_at);
  const end = event.ends_at ? new Date(event.ends_at) : null;
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  });
  return end ? `${time.format(start)} – ${time.format(end)}` : time.format(start);
}

function formatAgendaDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function crmLinked(event: CalendarEvent) {
  return Boolean(event.matched_contact_id || event.matched_account_id || event.matched_location_id || event.matched_task_id);
}

export default async function CalendarPage({ searchParams }: { searchParams: SearchParams }) {
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.crm);
  const params = await searchParams;
  const selected = parseMonth(params.month);
  const todayKey = easternDateKey(new Date());
  const requestedCreateDate = DATE_PATTERN.test(params.create_date || "") ? params.create_date! : null;
  const defaultCreateDate = requestedCreateDate || todayKey;
  const monthStart = new Date(Date.UTC(selected.year, selected.month - 1, 1));
  const gridStart = new Date(monthStart);
  gridStart.setUTCDate(gridStart.getUTCDate() - gridStart.getUTCDay());
  const gridDays = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setUTCDate(gridStart.getUTCDate() + index);
    return date;
  });
  const queryStart = new Date(gridStart);
  queryStart.setUTCDate(queryStart.getUTCDate() - 2);
  const queryEnd = new Date(gridStart);
  queryEnd.setUTCDate(queryEnd.getUTCDate() + 44);

  const [{ data: rawEvents, error: eventsError }, { data: connection }, { data: calendarSync }] = await Promise.all([
    supabaseAdmin
      .from("microsoft_365_calendar_events")
      .select("id,subject,body_preview,starts_at,ends_at,location_name,organizer_email,attendee_emails,is_all_day,web_link,matched_contact_id,matched_account_id,matched_location_id,matched_task_id")
      .eq("user_id", admin.user_id)
      .eq("is_cancelled", false)
      .gte("starts_at", queryStart.toISOString())
      .lt("starts_at", queryEnd.toISOString())
      .order("starts_at", { ascending: true }),
    supabaseAdmin
      .from("microsoft_365_connections")
      .select("email,status,last_refreshed_at")
      .eq("user_id", admin.user_id)
      .maybeSingle(),
    supabaseAdmin
      .from("microsoft_365_sync_state")
      .select("last_success_at,last_error")
      .eq("user_id", admin.user_id)
      .eq("resource", "calendar")
      .maybeSingle(),
  ]);

  const events = (rawEvents || []) as CalendarEvent[];
  const eventsByDay = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    if (!event.starts_at) continue;
    const key = easternDateKey(event.starts_at);
    const list = eventsByDay.get(key) || [];
    list.push(event);
    eventsByDay.set(key, list);
  }

  const agenda = events.filter((event) => event.starts_at && easternDateKey(event.starts_at).startsWith(`${selected.key}-`));
  const previousMonth = shiftMonth(selected.year, selected.month, -1);
  const nextMonth = shiftMonth(selected.year, selected.month, 1);
  const connected = connection?.status === "active";
  const canWrite = CRM_WRITE_ROLES.some((role) => role === admin.role);
  const lastSync = calendarSync?.last_success_at || connection?.last_refreshed_at;

  return (
    <main className="admin-page px-4 pb-16 pt-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="admin-kicker text-xs font-black uppercase tracking-[0.24em]">CRM · Microsoft 365</p>
            <h1 className="mt-2 text-3xl font-black">Calendar</h1>
            <p className="admin-muted mt-2 max-w-3xl text-sm">Your synced Outlook calendar, shown in Eastern Time alongside CRM matching status.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {connected && canWrite ? (
              <Link href={`/admin/dashboard/crm/calendar?month=${selected.key}&create_date=${todayKey}#new-event`} className="admin-primary rounded-xl px-4 py-2 text-sm">+ Add event</Link>
            ) : null}
            {connected ? (
              <form action="/api/admin/integrations/microsoft-365/sync" method="post">
                <input type="hidden" name="return_to" value={`/admin/dashboard/crm/calendar?month=${selected.key}`} />
                <button className="admin-secondary rounded-xl px-4 py-2 text-sm">Sync now</button>
              </form>
            ) : null}
            <Link href="/admin/dashboard/settings/microsoft-365" className="admin-secondary rounded-xl px-4 py-2 text-sm">Microsoft 365 settings</Link>
          </div>
        </header>

        {!connected ? (
          <section className="rounded-2xl border border-rose-300/25 bg-rose-300/[0.07] p-5">
            <h2 className="font-black text-rose-100">Microsoft 365 is not connected</h2>
            <p className="mt-1 text-sm text-white/60">Connect your Microsoft account to bring Outlook Calendar into this workspace.</p>
            <Link href="/admin/dashboard/settings/microsoft-365" className="admin-primary mt-4 inline-flex rounded-xl px-4 py-2 text-sm">Connect Microsoft 365</Link>
          </section>
        ) : null}

        {params.created === "1" ? (
          <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.08] p-4 text-sm font-bold text-emerald-100">Event created in Outlook and added to the CRM calendar.</div>
        ) : null}

        {params.create_error ? (
          <div className="rounded-2xl border border-rose-300/20 bg-rose-300/[0.08] p-4 text-sm text-rose-100">{params.create_error}</div>
        ) : null}

        {eventsError ? (
          <div className="rounded-2xl border border-rose-300/20 bg-rose-300/[0.08] p-4 text-sm text-rose-100">Calendar data could not be loaded: {eventsError.message}</div>
        ) : null}

        {calendarSync?.last_error ? (
          <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.07] p-4 text-sm text-amber-100">Last calendar sync warning: {calendarSync.last_error}</div>
        ) : null}

        {canWrite ? <CalendarEventCreator connected={connected} defaultDate={defaultCreateDate} open={Boolean(requestedCreateDate || params.create_error)} /> : null}

        <section className="grid gap-4 md:grid-cols-3">
          <div className="admin-card rounded-2xl p-5 md:col-span-2">
            <p className="admin-muted text-xs font-black uppercase tracking-[0.18em]">Connected mailbox</p>
            <p className="mt-2 text-lg font-black">{connection?.email || "Microsoft 365"}</p>
            <p className="admin-muted mt-1 text-sm">{lastSync ? `Last calendar sync ${new Date(lastSync).toLocaleString("en-US", { timeZone: EASTERN_TIME_ZONE })}` : "Waiting for the first calendar sync."}</p>
          </div>
          <div className="admin-card rounded-2xl p-5">
            <p className="text-3xl font-black">{agenda.length}</p>
            <p className="admin-muted mt-1 text-sm">Events in {formatMonth(selected.year, selected.month)}</p>
          </div>
        </section>

        <section className="admin-card overflow-hidden rounded-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <Link href={`/admin/dashboard/crm/calendar?month=${previousMonth}`} className="admin-secondary rounded-xl px-3 py-2 text-sm" aria-label="Previous month">←</Link>
              <Link href="/admin/dashboard/crm/calendar" className="admin-secondary rounded-xl px-3 py-2 text-sm">Today</Link>
              <Link href={`/admin/dashboard/crm/calendar?month=${nextMonth}`} className="admin-secondary rounded-xl px-3 py-2 text-sm" aria-label="Next month">→</Link>
            </div>
            <h2 className="text-xl font-black">{formatMonth(selected.year, selected.month)}</h2>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[840px]">
              <div className="grid grid-cols-7 border-b border-white/10 bg-black/20">
                {DAY_LABELS.map((label) => <div key={label} className="px-3 py-2 text-center text-xs font-black uppercase tracking-widest text-white/45">{label}</div>)}
              </div>
              <div className="grid grid-cols-7">
                {gridDays.map((day) => {
                  const key = dateKeyUtc(day);
                  const dayEvents = eventsByDay.get(key) || [];
                  const inMonth = day.getUTCMonth() === selected.month - 1;
                  const isToday = key === todayKey;
                  return (
                    <div key={key} className={`min-h-36 border-b border-r border-white/[0.08] p-2.5 ${inMonth ? "bg-white/[0.018]" : "bg-black/20"}`}>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-black ${isToday ? "bg-[#e1062a] text-white" : inMonth ? "text-white/80" : "text-white/30"}`}>
                          {day.getUTCDate()}
                        </div>
                        {connected && canWrite ? (
                          <Link
                            href={`/admin/dashboard/crm/calendar?month=${key.slice(0, 7)}&create_date=${key}#new-event`}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 text-sm font-black text-white/50 transition hover:border-rose-300/30 hover:bg-rose-300/[0.08] hover:text-rose-200"
                            aria-label={`Add event on ${key}`}
                          >
                            +
                          </Link>
                        ) : null}
                      </div>
                      <div className="space-y-1.5">
                        {dayEvents.slice(0, 3).map((event) => (
                          <div key={event.id} className="rounded-lg border border-rose-300/15 bg-rose-300/[0.07] px-2 py-1.5">
                            <p className="truncate text-xs font-black text-white">{event.subject || "Untitled event"}</p>
                            <p className="mt-0.5 text-[11px] text-white/50">{formatEventTime(event)}</p>
                          </div>
                        ))}
                        {dayEvents.length > 3 ? <p className="px-1 text-[11px] font-bold text-rose-200">+{dayEvents.length - 3} more</p> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <p className="admin-kicker text-xs font-black uppercase tracking-[0.18em]">Agenda</p>
            <h2 className="mt-1 text-2xl font-black">{formatMonth(selected.year, selected.month)} events</h2>
          </div>

          {agenda.length ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {agenda.map((event) => (
                <article key={event.id} className="admin-card rounded-2xl p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-rose-200">{event.starts_at ? formatAgendaDate(event.starts_at) : "Calendar"} · {formatEventTime(event)}</p>
                      <h3 className="mt-1 text-lg font-black">{event.subject || "Untitled event"}</h3>
                    </div>
                    {crmLinked(event) ? <span className="rounded-full border border-emerald-300/20 bg-emerald-300/[0.08] px-2.5 py-1 text-xs font-black text-emerald-100">CRM linked</span> : null}
                  </div>
                  {event.location_name ? <p className="admin-muted mt-3 text-sm">Location: {event.location_name}</p> : null}
                  {event.organizer_email ? <p className="admin-muted mt-1 text-sm">Organizer: {event.organizer_email}</p> : null}
                  {event.attendee_emails?.length ? <p className="admin-muted mt-1 text-sm">{event.attendee_emails.length} attendee{event.attendee_emails.length === 1 ? "" : "s"}</p> : null}
                  {event.body_preview ? <p className="mt-3 line-clamp-2 text-sm leading-6 text-white/60">{event.body_preview}</p> : null}
                  {event.web_link ? <a href={event.web_link} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex text-sm font-black text-rose-300 hover:text-rose-200">Open in Outlook ↗</a> : null}
                </article>
              ))}
            </div>
          ) : (
            <div className="admin-card rounded-2xl p-8 text-center">
              <p className="font-black">No synced Outlook events for this month.</p>
              <p className="admin-muted mt-2 text-sm">{canWrite ? "Create an event here or run a Microsoft 365 sync to pull existing Outlook events into the CRM." : "Run a Microsoft 365 sync to pull existing Outlook events into the CRM."}</p>
              {connected ? (
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {canWrite ? <Link href={`/admin/dashboard/crm/calendar?month=${selected.key}&create_date=${todayKey}#new-event`} className="admin-primary rounded-xl px-4 py-2 text-sm">+ Add event</Link> : null}
                  <form action="/api/admin/integrations/microsoft-365/sync" method="post">
                    <input type="hidden" name="return_to" value={`/admin/dashboard/crm/calendar?month=${selected.key}`} />
                    <button className="admin-secondary rounded-xl px-4 py-2 text-sm">Sync calendar now</button>
                  </form>
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
