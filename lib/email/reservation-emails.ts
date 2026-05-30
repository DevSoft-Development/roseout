import { sendBrandedEmail } from "./sender";

export type ReservationEmailInput = {
  to?: string | null;
  locationName: string;
  reservationDate: string;
  reservationTime: string;
  partySize?: number | null;
  confirmationCode?: string | null;
  modifyUrl?: string;
  cancelUrl?: string;
};

function input(i: ReservationEmailInput) {
  return { locationName: i.locationName, reservationDate: i.reservationDate, reservationTime: i.reservationTime, partySize: i.partySize, confirmationCode: i.confirmationCode, ctaUrl: i.modifyUrl || i.cancelUrl || "https://theouthaven.com" };
}
export function sendReservationConfirmationEmail(i: ReservationEmailInput) { return sendBrandedEmail({ to: i.to, templateKey: "user_reservation_confirmation", input: input(i), department: "reservations" }); }
export function sendReservationCancelledEmail(i: ReservationEmailInput) { return sendBrandedEmail({ to: i.to, templateKey: "user_reservation_cancelled", input: input(i), department: "reservations" }); }
export function sendReservationReminderEmail(i: ReservationEmailInput) { return sendBrandedEmail({ to: i.to, templateKey: "user_reservation_reminder", input: input(i), department: "reservations" }); }
export function sendWaitlistAvailableEmail(i: ReservationEmailInput) { return sendBrandedEmail({ to: i.to, templateKey: "abandoned_reservation", input: { ...input(i), heading: "A spot just opened", intro: "Good news — a matching reservation slot opened. Book soon before it is released.", ctaUrl: i.modifyUrl }, department: "reservations" }); }
