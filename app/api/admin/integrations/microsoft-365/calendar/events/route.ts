import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { requireAdminRole } from "@/lib/admin-auth";
import { resolveAdminOrganizationPeople } from "@/lib/admin-organization-people";
import { CRM_WRITE_ROLES } from "@/lib/crm/permissions";
import {
  createMicrosoft365CalendarEvent,
  getMicrosoft365CalendarConflicts,
  type Microsoft365CalendarConflict,
} from "@/lib/microsoft-365/calendar";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function redirectWith(request: NextRequest, month: string, key: string, value: string, date?: string) {
  const url = new URL("/admin/dashboard/crm/calendar", request.url);
  if (/^\d{4}-\d{2}$/.test(month)) url.searchParams.set("month", month);
  if (DATE_PATTERN.test(date || "")) url.searchParams.set("create_date", date!);
  url.searchParams.set(key, value);
  return NextResponse.redirect(url, 303);
}

function formatEasternTime(raw: string | null) {
  const match = raw?.match(/T(\d{2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = match[2];
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute} ${suffix}`;
}

function availabilityMessage(
  conflicts: Microsoft365CalendarConflict[],
  people: Array<{ email: string; name: string }>,
  allDay: boolean,
) {
  const firstByEmail = new Map<string, Microsoft365CalendarConflict>();
  for (const conflict of conflicts) {
    if (!firstByEmail.has(conflict.email)) firstByEmail.set(conflict.email, conflict);
  }

  const unavailable = people
    .map((person) => ({ person, conflict: firstByEmail.get(person.email.toLowerCase()) }))
    .filter((entry): entry is { person: { email: string; name: string }; conflict: Microsoft365CalendarConflict } => Boolean(entry.conflict));

  const details = unavailable.slice(0, 4).map(({ person, conflict }) => {
    if (allDay) return `${person.name} is not available during part of that day.`;
    const start = formatEasternTime(conflict.startsAt);
    const end = formatEasternTime(conflict.endsAt);
    return start && end
      ? `${person.name} is not available from ${start} to ${end}.`
      : `${person.name} is not available at that time.`;
  });

  if (unavailable.length > 4) details.push(`${unavailable.length - 4} more team member${unavailable.length - 4 === 1 ? " is" : "s are"} also unavailable.`);
  details.push("No event was created. Choose another time or remove the unavailable attendee.");
  return details.join(" ");
}

export async function POST(request: NextRequest) {
  const admin = await requireAdminRole(CRM_WRITE_ROLES);
  const formData = await request.formData();

  const subject = String(formData.get("subject") || "").trim();
  const date = String(formData.get("date") || "").trim();
  const startTime = String(formData.get("start_time") || "").trim();
  const endTime = String(formData.get("end_time") || "").trim();
  const allDay = formData.get("all_day") === "on";
  const location = String(formData.get("location") || "").trim();
  const notes = String(formData.get("notes") || "").trim();
  const attendeeRaw = String(formData.get("attendees") || "");
  const organizationAttendeeIds = Array.from(new Set(
    formData.getAll("organization_attendees").map((value) => String(value || "").trim()).filter(Boolean),
  ));
  const month = DATE_PATTERN.test(date) ? date.slice(0, 7) : "";

  if (!subject || subject.length > 200) {
    return redirectWith(request, month, "create_error", "Enter an event title up to 200 characters.", date);
  }
  if (!DATE_PATTERN.test(date)) {
    return redirectWith(request, month, "create_error", "Choose a valid event date.", date);
  }
  if (!allDay) {
    if (!TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime)) {
      return redirectWith(request, month, "create_error", "Choose a valid start and end time.", date);
    }
    if (endTime <= startTime) {
      return redirectWith(request, month, "create_error", "End time must be after start time.", date);
    }
  }
  if (location.length > 500 || notes.length > 5000) {
    return redirectWith(request, month, "create_error", "Location or notes are too long.", date);
  }

  const externalAttendeeEmails = Array.from(new Set(
    attendeeRaw
      .split(/[;,\n]/)
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  ));
  if (externalAttendeeEmails.some((email) => !EMAIL_PATTERN.test(email))) {
    return redirectWith(request, month, "create_error", "Check the attendee email addresses.", date);
  }

  const organizationPeople = await resolveAdminOrganizationPeople(organizationAttendeeIds);
  if (organizationPeople.length !== organizationAttendeeIds.length) {
    return redirectWith(request, month, "create_error", "One or more selected organization members are no longer available.", date);
  }

  const attendeeEmails = Array.from(new Set([
    ...organizationPeople.map((person) => person.email),
    ...externalAttendeeEmails,
  ]));
  if (attendeeEmails.length > 50) {
    return redirectWith(request, month, "create_error", "Up to 50 attendees are allowed per event.", date);
  }

  if (organizationPeople.length) {
    try {
      const conflicts = await getMicrosoft365CalendarConflicts(
        admin.user_id,
        organizationPeople.map((person) => person.email),
        {
          date,
          startTime: allDay ? null : startTime,
          endTime: allDay ? null : endTime,
          allDay,
        },
      );
      if (conflicts.length) {
        return redirectWith(request, month, "create_error", availabilityMessage(conflicts, organizationPeople, allDay), date);
      }
    } catch (error) {
      console.error("Microsoft 365 calendar availability check failed", error);
      const message = error instanceof Error && error.message === "M365_NOT_CONNECTED"
        ? "Microsoft 365 is not connected. No event was created."
        : "The selected team member's availability could not be verified. No event was created; try again before sending the invitation.";
      return redirectWith(request, month, "create_error", message, date);
    }
  }

  try {
    await createMicrosoft365CalendarEvent(admin.user_id, {
      subject,
      date,
      startTime: allDay ? null : startTime,
      endTime: allDay ? null : endTime,
      allDay,
      location: location || null,
      notes: notes || null,
      attendeeEmails,
    });

    revalidatePath("/admin/dashboard/crm/calendar");
    revalidatePath("/admin/dashboard/crm/today");
    return redirectWith(request, month, "created", "1");
  } catch (error) {
    console.error("Microsoft 365 calendar event creation failed", error);
    const message = error instanceof Error && error.message === "M365_NOT_CONNECTED"
      ? "Microsoft 365 is not connected."
      : "The event could not be created in Outlook. Try again.";
    return redirectWith(request, month, "create_error", message, date);
  }
}
