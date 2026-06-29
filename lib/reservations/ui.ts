import { normalizeReservationStatus, type ReservationStatus } from "./status";

export const RESERVATION_STATUS_LABELS: Record<string, string> = {
  pending: "Needs action",
  confirmed: "Ready for arrival",
  checked_in: "Guest arrived",
  arrived: "Guest arrived",
  seated: "Seated now",
  occupied: "Seated now",
  completed: "Finished",
  cancelled: "Cancelled",
  declined: "Cancelled",
  no_show: "No-show",
  waitlisted: "Waitlisted",
};

export function getReservationStatusLabel(status?: string | null) {
  const normalized = normalizeReservationStatus(status);
  return RESERVATION_STATUS_LABELS[String(normalized)] || "Needs action";
}

export type ReservationNextAction = {
  label: string;
  targetStatus?: ReservationStatus;
  destructive?: boolean;
  disabledReason?: string;
};

export function getReservationPrimaryNextAction(status?: string | null): ReservationNextAction {
  const normalized = normalizeReservationStatus(status);
  switch (normalized) {
    case "pending":
      return { label: "Confirm", targetStatus: "confirmed" };
    case "confirmed":
      return { label: "Check in", targetStatus: "checked_in" };
    case "checked_in":
      return { label: "Seat guest", targetStatus: "seated" };
    case "seated":
      return { label: "Complete", targetStatus: "completed" };
    case "waitlisted":
      return { label: "Offer slot", targetStatus: "confirmed", disabledReason: "Offer workflow depends on availability for this location." };
    default:
      return { label: "View details" };
  }
}

export const ALLOWED_RESERVATION_STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ["confirmed", "cancelled", "declined"],
  confirmed: ["checked_in", "cancelled", "no_show"],
  checked_in: ["seated", "cancelled", "no_show"],
  arrived: ["seated", "cancelled", "no_show"],
  seated: ["completed", "no_show"],
  waitlisted: ["pending", "confirmed", "cancelled"],
  completed: [],
  cancelled: [],
  declined: [],
  no_show: [],
};

export function canTransitionReservationStatus(from?: string | null, to?: string | null) {
  const fromStatus = String(normalizeReservationStatus(from));
  const toStatus = String(normalizeReservationStatus(to));
  return Boolean(toStatus && ALLOWED_RESERVATION_STATUS_TRANSITIONS[fromStatus]?.includes(toStatus));
}

export function formatReservationTime(time?: string | null) {
  const clean = String(time || "").slice(0, 5);
  const [hourRaw, minuteRaw = "00"] = clean.split(":");
  const hour = Number(hourRaw);
  if (!Number.isFinite(hour)) return clean || "Time TBD";
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${minuteRaw.padStart(2, "0")} ${suffix}`;
}
