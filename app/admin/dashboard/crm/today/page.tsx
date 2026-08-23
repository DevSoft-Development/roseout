import Link from "next/link";
import CrmWorkspaceShell from "@/components/admin/crm/CrmWorkspaceShell";
import TodayUnreadMessages from "@/components/admin/crm/TodayUnreadMessages";
import { requireAdminRole } from "@/lib/admin-auth";
import { CRM_READ_ROLES } from "@/lib/crm/permissions";
import { queryWorkQueue } from "@/lib/crm/tasks/queries";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const EASTERN_TIME_ZONE = "America/New_York";

type TodayCalendarEvent = {
  id: string;
  subject: string | null;
  starts_at: string | null;
  ends_at: string | null;
  location_name: string | null;
  is_all_day: boolean | null;
  web_link: string | null;
  matched_contact_id: string | null;
  matched_account_id: string | null;
  matched_location_id: string | null;
  matched_task_id: string | null;
};

function easternDateKey(value: string | Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value instanceof Date ? value : new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function formatCalendarEventTime(event: TodayCalendarEvent) {
  if (event.is_all_day) return "All day";
  if (!event.starts_at) return "Time unavailable";

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  });
  const start = formatter.format(new Date(event.starts_at));
  const end = event.ends_at ? formatter.format(new Date(event.ends_at)) : null;
  return end ? `${start} – ${end}` : start;
}

function calendarEventIsCrmLinked(event: TodayCalendarEvent) {
  return Boolean(event.matched_contact_id || event.matched_account_id || event.matched_location_id || event.matched_task_id);
}

function TaskList({
  title,
  description,
  tasks,
  href,
}: {
  title: string;
  description: string;
  tasks: any[];
  href: string;
}) {
  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#0e0e11]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 p-5">
        <div>
          <h2 className="text-xl font-black text-white">{title}</h2>
          <p className="mt-1 text-sm text-zinc-500">{description}</p>
        </div>
        <Link href={href} className="rounded-xl border border-white/10 px-3 py-2 text-sm font-black text-white/80 hover:bg-white/[0.05]">
          View all
        </Link>
      </div>
      {tasks.length ? (
        <div className="divide-y divide-white/[0.07]">
          {tasks.slice(0, 6).map((task: any) => (
            <Link key={task.id} href={`/admin/dashboard/crm/work-queue/${task.id}`} className="grid gap-2 p-4 transition hover:bg-white/[0.04] sm:grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-white">{task.title}</p>
                <p className="mt-1 truncate text-xs text-zinc-500">{task.crm_accounts?.name || task.locations?.name || "CRM record"}</p>
              </div>
              <div className="text-left sm:text-right">
                <p className="text-xs font-bold capitalize text-zinc-400">{String(task.priority || "normal").replaceAll("_", " ")}</p>
                <p className="mt-1 text-xs text-zinc-600">{task.due_at ? new Date(task.due_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "No due time"}</p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p className="p-5 text-sm text-zinc-500">Nothing in this section right now.</p>
      )}
    </section>
  );
}

export default async function CrmTodayPage() {
  const actor = await requireAdminRole(CRM_READ_ROLES);
  const now = new Date();
  const todayKey = easternDateKey(now);
  const calendarWindowStart = new Date(now.getTime() - 36 * 60 * 60 * 1000);
  const calendarWindowEnd = new Date(now.getTime() + 36 * 60 * 60 * 1000);

  const [dueToday, overdue, followUps, attention, calendarResult] = await Promise.all([
    queryWorkQueue(actor.user_id, "due-today", {}),
    queryWorkQueue(actor.user_id, "overdue", {}),
    queryWorkQueue(actor.user_id, "follow-ups", {}),
    queryWorkQueue(actor.user_id, "escalations", {}),
    supabaseAdmin
      .from("microsoft_365_calendar_events")
      .select("id,subject,starts_at,ends_at,location_name,is_all_day,web_link,matched_contact_id,matched_account_id,matched_location_id,matched_task_id")
      .eq("user_id", actor.user_id)
      .eq("is_cancelled", false)
      .gte("starts_at", calendarWindowStart.toISOString())
      .lt("starts_at", calendarWindowEnd.toISOString())
      .order("starts_at", { ascending: true }),
  ]);

  const todayCalendarEvents = ((calendarResult.data || []) as TodayCalendarEvent[])
    .filter((event) => event.starts_at && easternDateKey(event.starts_at) === todayKey);

  return (
    <CrmWorkspaceShell>
      <main className="space-y-5 text-white">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-300">TheOutHaven CRM</p>
            <h1 className="mt-1 text-3xl font-black">Today</h1>
            <p className="mt-1 text-white/55">Start here. Messages, calendar events, and work that need attention now, without the full CRM reporting dashboard.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/dashboard/crm/locations" className="rounded-xl border border-white/10 px-4 py-2 text-sm font-black text-white/80 hover:bg-white/[0.05]">Find a location</Link>
            <Link href="/admin/dashboard/crm/tasks?create=task" className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-black text-white hover:bg-rose-500">Create task</Link>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ["Due today", dueToday.count, "/admin/dashboard/crm/my-work?view=due-today"],
            ["Overdue", overdue.count, "/admin/dashboard/crm/my-work?view=overdue"],
            ["Follow-ups", followUps.count, "/admin/dashboard/crm/my-work?view=follow-ups"],
            ["Needs attention", attention.count, "/admin/dashboard/crm/my-work?view=escalations"],
          ].map(([label, value, href]) => (
            <Link key={String(label)} href={String(href)} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition hover:border-rose-300/30 hover:bg-white/[0.06]">
              <b className="text-2xl text-white">{value}</b>
              <small className="mt-1 block font-bold text-white/50">{label}</small>
            </Link>
          ))}
        </section>

        <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#0e0e11]">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 p-5">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-black text-white">Today’s calendar</h2>
                {todayCalendarEvents.length ? <span className="rounded-full bg-rose-500/15 px-2.5 py-1 text-xs font-black text-rose-200">{todayCalendarEvents.length}</span> : null}
              </div>
              <p className="mt-1 text-sm text-zinc-500">Synced Outlook events for today, shown in Eastern Time.</p>
            </div>
            <Link href="/admin/dashboard/crm/calendar" className="rounded-xl border border-white/10 px-3 py-2 text-sm font-black text-white/80 hover:bg-white/[0.05]">
              Open calendar
            </Link>
          </div>

          {calendarResult.error ? (
            <p className="p-5 text-sm text-rose-200">Today’s calendar could not be loaded. Open Calendar to review Microsoft 365 sync status.</p>
          ) : todayCalendarEvents.length ? (
            <div className="divide-y divide-white/[0.07]">
              {todayCalendarEvents.slice(0, 6).map((event) => (
                <article key={event.id} className="grid gap-3 p-4 sm:grid-cols-[110px_minmax(0,1fr)_auto] sm:items-center">
                  <p className="text-sm font-black text-rose-200">{formatCalendarEventTime(event)}</p>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-black text-white">{event.subject || "Untitled event"}</p>
                      {calendarEventIsCrmLinked(event) ? <span className="rounded-full border border-emerald-300/20 bg-emerald-300/[0.08] px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-emerald-100">CRM linked</span> : null}
                    </div>
                    {event.location_name ? <p className="mt-1 truncate text-xs text-zinc-500">{event.location_name}</p> : null}
                  </div>
                  {event.web_link ? (
                    <a href={event.web_link} target="_blank" rel="noopener noreferrer" className="text-xs font-black text-rose-300 hover:text-rose-200">Open in Outlook ↗</a>
                  ) : null}
                </article>
              ))}
              {todayCalendarEvents.length > 6 ? (
                <Link href="/admin/dashboard/crm/calendar" className="block p-4 text-center text-sm font-black text-rose-300 hover:bg-white/[0.04]">
                  +{todayCalendarEvents.length - 6} more event{todayCalendarEvents.length - 6 === 1 ? "" : "s"}
                </Link>
              ) : null}
            </div>
          ) : (
            <p className="p-5 text-sm text-zinc-500">No synced Outlook events are scheduled for today.</p>
          )}
        </section>

        <TodayUnreadMessages />

        <div className="grid gap-5 xl:grid-cols-2">
          <TaskList title="Due today" description="Work scheduled for today." tasks={dueToday.tasks} href="/admin/dashboard/crm/my-work?view=due-today" />
          <TaskList title="Overdue" description="Past-due work that still needs action." tasks={overdue.tasks} href="/admin/dashboard/crm/my-work?view=overdue" />
          <TaskList title="Follow-ups" description="Customer and location follow-ups currently in your queue." tasks={followUps.tasks} href="/admin/dashboard/crm/my-work?view=follow-ups" />
          <TaskList title="Needs attention" description="Escalated or priority work that should be reviewed." tasks={attention.tasks} href="/admin/dashboard/crm/my-work?view=escalations" />
        </div>
      </main>
    </CrmWorkspaceShell>
  );
}
