import "server-only";

import { appendReservationMessage, findReservationForInboundSms } from "@/lib/communications/reservation-thread";
import { normalizePhone, purposeForTelnyxNumber, sendTelnyxSmsFromNumber } from "@/lib/sms/telnyx";

export async function routeReservationFromSmsChannel(params: {
  from: string;
  to: string;
  body: string;
  eventId: string;
  providerMessageId: string | null;
}) {
  const phone = normalizePhone(params.from);
  const entryNumber = normalizePhone(params.to);
  if (!phone || !entryNumber) return null;
  const entryChannel = purposeForTelnyxNumber(entryNumber) || "sms";

  const reservation = await findReservationForInboundSms(phone);
  if (!reservation) {
    const body = "I can get this to Reservations, but I need to identify the reservation first. Send the location name and reservation date.";
    await sendTelnyxSmsFromNumber({ to: phone, body, fromNumber: entryNumber });
    return { handled: true, matched: false, action: "reservation_handoff_needs_match" };
  }

  await appendReservationMessage({
    reservation,
    direction: "inbound",
    channel: "sms",
    body: params.body,
    provider: "telnyx",
    providerMessageId: params.providerMessageId,
    sourceRecordId: `telnyx-event:${params.eventId}`,
    recipientAddress: phone,
    metadata: {
      telnyx_event_id: params.eventId,
      to: entryNumber,
      entry_number: entryNumber,
      entry_channel: entryChannel,
      handling_department: "reservations",
      cross_channel_handoff: entryChannel !== "reservations",
    },
  });

  const acknowledgement = "I found your reservation and sent this to our Reservations team. You can keep texting here and they’ll see your messages.";
  const sent = await sendTelnyxSmsFromNumber({ to: phone, body: acknowledgement, fromNumber: entryNumber });
  await appendReservationMessage({
    reservation,
    direction: "outbound",
    channel: "sms",
    body: acknowledgement,
    provider: "telnyx",
    providerMessageId: sent.id,
    sourceRecordId: `reservation-handoff-ack:${params.eventId}`,
    recipientAddress: phone,
    metadata: {
      automatic_acknowledgement: true,
      entry_number: entryNumber,
      entry_channel: entryChannel,
      handling_department: "reservations",
      cross_channel_handoff: entryChannel !== "reservations",
    },
  });

  return {
    handled: true,
    matched: true,
    action: "reservation_handoff",
    reservationId: reservation.id,
    locationId: reservation.location_id,
  };
}
