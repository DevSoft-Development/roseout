export const RESERVATION_STATUSES = [
  "pending",
  "confirmed",
  "checked_in",
  "seated",
  "completed",
  "cancelled",
  "no_show",
  "waitlisted",
] as const;

export type ReservationStatus = (typeof RESERVATION_STATUSES)[number] | "arrived" | "seated" | "occupied" | "declined";

export const ACTIVE_RESERVATION_STATUSES = [
  "pending",
  "confirmed",
  "checked_in",
  "arrived",
  "seated",
  "occupied",
] as const;

export function normalizeReservationStatus(status?: string | null): ReservationStatus {
  if (status === "arrived") return "checked_in";
  if (status === "occupied") return "seated";
  if (RESERVATION_STATUSES.includes(status as (typeof RESERVATION_STATUSES)[number])) {
    return status as ReservationStatus;
  }
  return "pending";
}

export function isActiveReservation(status?: string | null) {
  return ACTIVE_RESERVATION_STATUSES.includes(status as (typeof ACTIVE_RESERVATION_STATUSES)[number]);
}

export function isCompletedReservation(status?: string | null) {
  return ["completed", "cancelled", "no_show", "declined"].includes(String(status || ""));
}

export function canModifyReservation(status?: string | null) {
  return ["pending", "confirmed", "waitlisted"].includes(String(normalizeReservationStatus(status)));
}

export function canCancelReservation(status?: string | null) {
  return ["pending", "confirmed", "checked_in", "waitlisted"].includes(String(normalizeReservationStatus(status)));
}

export function isWaitlistedReservation(status?: string | null) {
  return normalizeReservationStatus(status) === "waitlisted";
}
