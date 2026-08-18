import { sendRenderedEmail } from "./sender";
import { renderReservationLifecycleEmail, type ReservationLifecycleKind } from "./reservation-lifecycle";

export type ReservationEmailInput = {
  to?: string | null;
  locationName: string;
  reservationDate: string;
  reservationTime: string;
  partySize?: number | null;
  confirmationCode?: string | null;
  customerName?: string | null;
  modifyUrl?: string;
  cancelUrl?: string;
};

function sendLifecycleEmail(kind: ReservationLifecycleKind, i: ReservationEmailInput) {
  const ctaUrl = i.modifyUrl || i.cancelUrl || (kind === "cancelled" ? "https://theouthaven.com" : "https://theouthaven.com/reservations");
  const rendered = renderReservationLifecycleEmail({
    kind,
    locationName: i.locationName,
    reservationDate: i.reservationDate,
    reservationTime: i.reservationTime,
    partySize: i.partySize,
    confirmationCode: i.confirmationCode,
    customerName: i.customerName,
    ctaUrl,
  });

  return sendRenderedEmail({
    to: i.to,
    rendered,
    department: "reservations",
    templateKey: `reservation_${kind}_customer`,
  });
}

export function sendReservationConfirmationEmail(i: ReservationEmailInput) {
  return sendLifecycleEmail("confirmation", i);
}

export function sendReservationModifiedEmail(i: ReservationEmailInput) {
  return sendLifecycleEmail("modified", i);
}

export function sendReservationCancelledEmail(i: ReservationEmailInput) {
  return sendLifecycleEmail("cancelled", i);
}

export function sendReservationReminderEmail(i: ReservationEmailInput) {
  return sendLifecycleEmail("reminder", i);
}

export function sendWaitlistAvailableEmail(i: ReservationEmailInput) {
  return sendLifecycleEmail("waitlist", i);
}
