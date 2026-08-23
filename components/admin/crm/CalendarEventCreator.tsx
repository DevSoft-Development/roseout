type OrganizationPerson = {
  userId: string;
  email: string;
  name: string;
  role: string;
};

type CalendarEventCreatorProps = {
  connected: boolean;
  defaultDate: string;
  organizationPeople: OrganizationPerson[];
  open?: boolean;
};

export default function CalendarEventCreator({
  connected,
  defaultDate,
  organizationPeople,
  open = false,
}: CalendarEventCreatorProps) {
  if (!connected) return null;

  return (
    <details id="new-event" open={open} className="admin-card overflow-hidden rounded-2xl">
      <summary className="admin-primary flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-black marker:hidden">
        <span>+ Add calendar event</span>
        <span className="text-xs font-bold text-white/75">Creates it in Outlook</span>
      </summary>

      <form action="/api/admin/integrations/microsoft-365/calendar/events" method="post" className="space-y-5 border-t border-white/10 p-5">
        <div>
          <label htmlFor="calendar-subject" className="mb-2 block text-sm font-black text-white">Event title</label>
          <input id="calendar-subject" name="subject" maxLength={200} required className="admin-input w-full rounded-xl px-3 py-2.5" placeholder="Sales call, follow-up, site visit..." />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label htmlFor="calendar-date" className="mb-2 block text-sm font-black text-white">Date</label>
            <input id="calendar-date" type="date" name="date" defaultValue={defaultDate} required className="admin-input w-full rounded-xl px-3 py-2.5" />
          </div>
          <div>
            <label htmlFor="calendar-start" className="mb-2 block text-sm font-black text-white">Start</label>
            <input id="calendar-start" type="time" name="start_time" defaultValue="09:00" className="admin-input w-full rounded-xl px-3 py-2.5" />
          </div>
          <div>
            <label htmlFor="calendar-end" className="mb-2 block text-sm font-black text-white">End</label>
            <input id="calendar-end" type="time" name="end_time" defaultValue="10:00" className="admin-input w-full rounded-xl px-3 py-2.5" />
          </div>
        </div>

        <label className="flex items-center gap-3 text-sm font-bold text-white/75">
          <input type="checkbox" name="all_day" className="h-4 w-4 rounded border-white/20 bg-black/30" />
          All-day event
        </label>

        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <label htmlFor="calendar-location" className="mb-2 block text-sm font-black text-white">Location</label>
            <input id="calendar-location" name="location" maxLength={500} className="admin-input w-full rounded-xl px-3 py-2.5" placeholder="Office, venue, address, or Teams" />
          </div>
          <div>
            <label htmlFor="calendar-attendees" className="mb-2 block text-sm font-black text-white">Other attendees</label>
            <input id="calendar-attendees" name="attendees" className="admin-input w-full rounded-xl px-3 py-2.5" placeholder="customer@example.com, partner@example.com" />
            <p className="admin-muted mt-1 text-xs">Use this for people outside TheOutHaven.</p>
          </div>
        </div>

        <fieldset className="rounded-2xl border border-white/10 bg-black/15 p-4">
          <legend className="px-2 text-sm font-black text-white">Add people from TheOutHaven</legend>
          <p className="admin-muted mb-3 text-xs">Selected team members are added as Outlook attendees and receive the normal calendar invitation.</p>
          {organizationPeople.length ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {organizationPeople.map((person) => (
                <label key={person.userId} className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.025] p-3 hover:border-rose-300/25 hover:bg-rose-300/[0.04]">
                  <input type="checkbox" name="organization_attendees" value={person.userId} className="mt-1 h-4 w-4 rounded border-white/20 bg-black/30" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-black text-white">{person.name}</span>
                    <span className="block truncate text-xs text-white/50">{person.email}</span>
                    <span className="mt-1 block text-[10px] font-bold uppercase tracking-wider text-rose-200/70">{person.role.replaceAll("_", " ")}</span>
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <p className="admin-muted text-sm">No organization members are available yet.</p>
          )}
        </fieldset>

        <div>
          <label htmlFor="calendar-notes" className="mb-2 block text-sm font-black text-white">Notes</label>
          <textarea id="calendar-notes" name="notes" maxLength={5000} rows={4} className="admin-input w-full rounded-xl px-3 py-2.5" placeholder="Agenda, preparation notes, customer context..." />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
          <p className="admin-muted text-xs">Times are saved in Eastern Time.</p>
          <button type="submit" className="admin-primary rounded-xl px-5 py-2.5 text-sm">Create event</button>
        </div>
      </form>
    </details>
  );
}
