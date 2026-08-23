import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { createMicrosoft365CalendarEvent } from "@/lib/microsoft-365/calendar";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function redirectWith(request: NextRequest, month: string, key: string, value: string) {
  const url = new URL("/admin/dashboard/crm/calendar", request.url);
  if (/^\d{4}-\d{2}$/.test(month)) url.searchParams.set("month", month);
  url.searchParams.set(key, value);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.crm);
  const formData = await request.formData();

  const subject = String(formData.get("subject") || "").trim();
  const date = String(formData.get("date") || "").trim();
  const startTime = String(formData.get("start_time") || "").trim();
  const endTime = String(formData.get("end_time") || "").trim();
  const allDay = formData.get("all_day") === "on";
  const location = String(formData.get("location") || "").trim();
  const notes = String(formData.get("notes") || "").trim();
  const attendeeRaw = String(formData.get("attendees") || "");
  const month = DATE_PATTERN.test(date) ? date.slice(0, 7) : "";

  if (!subject || subject.length > 200) {
    return redirectWith(request, month, "create_error", "Enter an event title up to 200 characters.");
  }
  if (!DATE_PATTERN.test(date)) {
    return redirectWith(request, month, "create_error", "Choose a valid event date.");
  }
  if (!allDay) {
    if (!TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime)) {
      return redirectWith(request, month, "create_error", "Choose a valid start and end time.");
    }
    if (endTime <= startTime) {
      return redirectWith(request, month, "create_error", "End time must be after start time.");
    }
  }
  if (location.length > 500 || notes.length > 5000) {
    return redirectWith(request, month, "create_error", "Location or notes are too long.");
  }

  const attendeeEmails = Array.from(new Set(
    attendeeRaw
      .split(/[;,\n]/)
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  ));
  if (attendeeEmails.length > 50 || attendeeEmails.some((email) => !EMAIL_PATTERN.test(email))) {
    return redirectWith(request, month, "create_error", "Check attendee email addresses. Up to 50 are allowed.");
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
    return redirectWith(request, month, "create_error", message);
  }
}
