import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { microsoftGraphFetch } from "./graph";
import { matchCrmByEmails } from "./matching";

const EASTERN_WINDOWS_TIME_ZONE = "Eastern Standard Time";
const NON_CONFLICTING_SCHEDULE_STATUSES = new Set(["free", "workingElsewhere"]);

type GraphDateTime = {
  dateTime?: string | null;
  timeZone?: string | null;
};

type GraphAddress = {
  emailAddress?: {
    address?: string | null;
    name?: string | null;
  } | null;
};

type GraphCalendarEvent = {
  id: string;
  changeKey?: string | null;
  subject?: string | null;
  bodyPreview?: string | null;
  start?: GraphDateTime | null;
  end?: GraphDateTime | null;
  location?: { displayName?: string | null } | null;
  organizer?: GraphAddress | null;
  attendees?: GraphAddress[] | null;
  isCancelled?: boolean | null;
  isAllDay?: boolean | null;
  webLink?: string | null;
  lastModifiedDateTime?: string | null;
};

type GraphScheduleItem = {
  status?: string | null;
  start?: GraphDateTime | null;
  end?: GraphDateTime | null;
};

type GraphScheduleInformation = {
  scheduleId?: string | null;
  scheduleItems?: GraphScheduleItem[] | null;
  error?: {
    code?: string | null;
    message?: string | null;
  } | null;
};

type GraphScheduleResponse = {
  value?: GraphScheduleInformation[] | null;
};

export type CreateMicrosoft365CalendarEventInput = {
  subject: string;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  allDay: boolean;
  location?: string | null;
  notes?: string | null;
  attendeeEmails?: string[];
};

export type Microsoft365CalendarConflict = {
  email: string;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
};

function addOneDay(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day));
  value.setUTCDate(value.getUTCDate() + 1);
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}

function eventWindow(input: Pick<CreateMicrosoft365CalendarEventInput, "date" | "startTime" | "endTime" | "allDay">) {
  return {
    startDateTime: input.allDay
      ? `${input.date}T00:00:00`
      : `${input.date}T${input.startTime}:00`,
    endDateTime: input.allDay
      ? `${addOneDay(input.date)}T00:00:00`
      : `${input.date}T${input.endTime}:00`,
  };
}

function graphUtcIso(value: GraphDateTime | null | undefined) {
  const raw = value?.dateTime?.trim();
  if (!raw) return null;
  const normalized = /[zZ]|[+-]\d\d:\d\d$/.test(raw) ? raw : `${raw}Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function cleanEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export async function getMicrosoft365CalendarConflicts(
  userId: string,
  attendeeEmails: string[],
  input: Pick<CreateMicrosoft365CalendarEventInput, "date" | "startTime" | "endTime" | "allDay">,
): Promise<Microsoft365CalendarConflict[]> {
  const schedules = Array.from(new Set(attendeeEmails.map(cleanEmail).filter(Boolean)));
  if (!schedules.length) return [];

  const { startDateTime, endDateTime } = eventWindow(input);
  const response = await microsoftGraphFetch<GraphScheduleResponse>(userId, "/me/calendar/getSchedule", {
    method: "POST",
    headers: {
      Prefer: `outlook.timezone="${EASTERN_WINDOWS_TIME_ZONE}"`,
    },
    body: JSON.stringify({
      schedules,
      startTime: {
        dateTime: startDateTime,
        timeZone: EASTERN_WINDOWS_TIME_ZONE,
      },
      endTime: {
        dateTime: endDateTime,
        timeZone: EASTERN_WINDOWS_TIME_ZONE,
      },
      availabilityViewInterval: 15,
    }),
  });

  const byEmail = new Map((response.value || []).map((schedule) => [cleanEmail(schedule.scheduleId), schedule]));
  const conflicts: Microsoft365CalendarConflict[] = [];

  for (const email of schedules) {
    const schedule = byEmail.get(email);
    if (!schedule || schedule.error) {
      throw new Error(`M365_AVAILABILITY_UNVERIFIED:${email}`);
    }

    for (const item of schedule.scheduleItems || []) {
      const status = String(item.status || "unknown");
      if (NON_CONFLICTING_SCHEDULE_STATUSES.has(status)) continue;
      conflicts.push({
        email,
        status,
        startsAt: item.start?.dateTime?.trim() || null,
        endsAt: item.end?.dateTime?.trim() || null,
      });
    }
  }

  return conflicts;
}

export async function createMicrosoft365CalendarEvent(userId: string, input: CreateMicrosoft365CalendarEventInput) {
  const attendeeEmails = Array.from(new Set((input.attendeeEmails || []).map(cleanEmail).filter(Boolean)));
  const { startDateTime, endDateTime } = eventWindow(input);

  const payload = {
    subject: input.subject,
    body: input.notes
      ? { contentType: "Text", content: input.notes }
      : undefined,
    start: {
      dateTime: startDateTime,
      timeZone: EASTERN_WINDOWS_TIME_ZONE,
    },
    end: {
      dateTime: endDateTime,
      timeZone: EASTERN_WINDOWS_TIME_ZONE,
    },
    isAllDay: input.allDay,
    location: input.location ? { displayName: input.location } : undefined,
    attendees: attendeeEmails.map((email) => ({
      emailAddress: { address: email },
      type: "required",
    })),
    allowNewTimeProposals: true,
    transactionId: crypto.randomUUID(),
  };

  const event = await microsoftGraphFetch<GraphCalendarEvent>(userId, "/me/events", {
    method: "POST",
    headers: {
      Prefer: 'outlook.timezone="UTC"',
    },
    body: JSON.stringify(payload),
  });

  if (!event?.id) throw new Error("M365_CALENDAR_CREATE_FAILED");

  const organizerEmail = cleanEmail(event.organizer?.emailAddress?.address);
  const returnedAttendees = (event.attendees || [])
    .map((attendee) => cleanEmail(attendee?.emailAddress?.address))
    .filter(Boolean);
  const matchedEmails = returnedAttendees.length ? returnedAttendees : attendeeEmails;
  const match = await matchCrmByEmails(matchedEmails);

  const { error } = await supabaseAdmin.from("microsoft_365_calendar_events").upsert({
    user_id: userId,
    provider_event_id: event.id,
    provider_change_key: event.changeKey || null,
    subject: event.subject || input.subject,
    body_preview: event.bodyPreview || input.notes?.slice(0, 255) || null,
    starts_at: graphUtcIso(event.start),
    ends_at: graphUtcIso(event.end),
    start_time_zone: event.start?.timeZone || "UTC",
    end_time_zone: event.end?.timeZone || "UTC",
    location_name: event.location?.displayName || input.location || null,
    organizer_email: organizerEmail || null,
    attendee_emails: matchedEmails,
    is_cancelled: Boolean(event.isCancelled),
    is_all_day: Boolean(event.isAllDay ?? input.allDay),
    web_link: event.webLink || null,
    matched_contact_id: match.contactId,
    matched_account_id: match.accountId,
    matched_location_id: match.locationId,
    graph_last_modified_at: event.lastModifiedDateTime || null,
    metadata: { matched_by: match.reason, source: "crm_calendar_create" },
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,provider_event_id" });

  if (error) throw error;
  return event;
}
