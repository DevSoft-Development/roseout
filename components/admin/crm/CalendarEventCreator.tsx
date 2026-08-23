type CalendarEventCreatorProps = {
  connected: boolean;
  defaultDate: string;
  open?: boolean;
};

export default function CalendarEventCreator({ connected, defaultDate, open = false }: CalendarEventCreatorProps) {
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
            <label htmlFor="calendar-attendees" className="mb-2 block text-sm font-black text-white">Attendees</label>
            <input id="calendar-attendees" name="attendees" className="admin-input w-full rounded-xl px-3 py-2.5" placeholder="name@example.com, another@example.com" />
            <p className="admin-muted mt-1 text-xs">Outlook will send invitations to listed attendees.</p>
          </div>
        </div>

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
