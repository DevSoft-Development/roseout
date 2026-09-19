import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { buildIcsText } from "@/lib/reservationOperations";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const reservationId = clean(id);

  if (!reservationId) {
    return new Response("Missing reservation id.", { status: 400 });
  }

  const { data: reservation, error } = await supabaseAdmin
    .from("location_reservations")
    .select("*")
    .eq("id", reservationId)
    .maybeSingle();

  if (error || !reservation) {
    return new Response(error?.message || "Reservation not found.", { status: error ? 500 : 404 });
  }

  const startsAt = new Date(`${reservation.reservation_date}T${String(reservation.reservation_time).slice(0, 5)}:00`);
  const locationName = reservation.bookable_item_name
    ? `${reservation.bookable_item_name} at TheOutHaven`
    : "TheOutHaven reservation";

  const ics = buildIcsText({
    title: locationName,
    description: `Reservation for ${reservation.customer_name || "Guest"}, party of ${reservation.party_size || 1}.`,
    location: reservation.bookable_item_name || "TheOutHaven location",
    startsAt,
    durationMinutes: Number(reservation.duration_minutes || reservation.turn_time_minutes || 90),
  });

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="theouthaven-reservation-${reservationId}.ics"`,
    },
  });
}
