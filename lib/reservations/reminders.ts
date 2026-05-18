import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationName } from "@/lib/locationName";
import { sendReservationReminderEmail } from "@/lib/email/reservation-emails";
import { sendReservationReminderSMS } from "@/lib/sms/reservation-sms";

type ReminderWindow = "reminder_24h" | "reminder_2h";

type ReminderReservation = {
  id: string;
  location_id: string;
  customer_email?: string | null;
  customer_phone?: string | null;
  reservation_date: string;
  reservation_time: string;
  party_size?: number | null;
  confirmation_code?: string | null;
};

async function sendDueReminders(type: ReminderWindow, hoursBefore: number) {
  const now = new Date();
  const windowStart = new Date(now.getTime() + hoursBefore * 60 * 60 * 1000 - 15 * 60 * 1000).toISOString();
  const windowEnd = new Date(now.getTime() + hoursBefore * 60 * 60 * 1000 + 15 * 60 * 1000).toISOString();

  const { data: reservations, error } = await supabaseAdmin
    .from("location_reservations")
    .select("id, location_id, customer_email, customer_phone, reservation_date, reservation_time, party_size, status, confirmation_code")
    .eq("status", "confirmed")
    .gte("reservation_date", now.toISOString().split("T")[0]);

  if (error) throw new Error(error.message);

  const due = ((reservations || []) as ReminderReservation[]).filter((reservation) => {
    const startsAt = new Date(`${reservation.reservation_date}T${String(reservation.reservation_time).slice(0, 5)}:00`).toISOString();
    return startsAt >= windowStart && startsAt <= windowEnd;
  });

  for (const reservation of due) {
    const { data: existing } = await supabaseAdmin
      .from("reservation_reminders")
      .select("id, status")
      .eq("reservation_id", reservation.id)
      .eq("reminder_type", type)
      .maybeSingle();

    if (existing?.status === "sent") continue;

    const { data: location } = await supabaseAdmin
      .from("locations")
      .select("id, name, restaurant_name, activity_name, business_name")
      .eq("id", reservation.location_id)
      .maybeSingle();

    const locationName = getLocationName(location || {}, "TheOutHaven location");
    const results = await Promise.allSettled([
      sendReservationReminderEmail({
        to: reservation.customer_email,
        locationName,
        reservationDate: reservation.reservation_date,
        reservationTime: reservation.reservation_time,
        partySize: reservation.party_size,
        confirmationCode: reservation.confirmation_code,
      }),
      sendReservationReminderSMS({
        to: reservation.customer_phone,
        locationName,
        reservationDate: reservation.reservation_date,
        reservationTime: reservation.reservation_time,
      }),
    ]);

    const failed = results.find((result) => result.status === "rejected");
    await supabaseAdmin.from("reservation_reminders").upsert({
      reservation_id: reservation.id,
      location_id: reservation.location_id,
      reminder_type: type,
      scheduled_for: new Date(`${reservation.reservation_date}T${String(reservation.reservation_time).slice(0, 5)}:00`).toISOString(),
      sent_at: failed ? null : new Date().toISOString(),
      status: failed ? "failed" : "sent",
      error_message: failed && failed.status === "rejected" ? failed.reason?.message || "Reminder failed." : null,
    }, { onConflict: "reservation_id,reminder_type" });
  }

  return { processed: due.length };
}

export function send24HourReminders() {
  return sendDueReminders("reminder_24h", 24);
}

export function send2HourReminders() {
  return sendDueReminders("reminder_2h", 2);
}
