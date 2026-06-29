import { normalizeReservationStatus, type ReservationStatus } from "./status";

type ReservationNameSource = Record<string, unknown> & {
  customer?: Record<string, unknown> | null;
  profile?: Record<string, unknown> | null;
  user?: Record<string, unknown> | null;
};

const GENERIC_DEMO_RESERVATION_RE = /^demo reservation\s+\d+$/i;

function cleanDisplayString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function titleCaseEmailLocalPart(value: string) {
  return value
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getReservationGuestName(reservation?: ReservationNameSource | null): string {
  if (!reservation) return "Guest";

  const candidates = [
    reservation.customer_name,
    reservation.guest_name,
    reservation.contact_name,
    reservation.name,
    reservation.full_name,
    reservation.display_name,
    reservation.user_name,
    reservation.reservation_name,
    reservation.customer?.full_name,
    reservation.profile?.full_name,
    reservation.user?.full_name,
  ];

  const name = candidates
    .map(cleanDisplayString)
    .find((value) => value.length > 0 && !GENERIC_DEMO_RESERVATION_RE.test(value));

  if (name) return name;

  const email = cleanDisplayString(reservation.customer_email) || cleanDisplayString(reservation.contact_email) || cleanDisplayString(reservation.email);

  if (email && email.includes("@")) {
    const localPart = titleCaseEmailLocalPart(email.split("@")[0] || "");
    if (localPart) return localPart;
  }

  const phone = cleanDisplayString(reservation.customer_phone) || cleanDisplayString(reservation.contact_phone) || cleanDisplayString(reservation.phone);

  if (phone) {
    const last4 = phone.replace(/\D/g, "").slice(-4);
    return last4 ? `Guest ending ${last4}` : "Guest";
  }

  const demoFallback = candidates.map(cleanDisplayString).find((value) => value.length > 0);
  return demoFallback || "Guest";
}

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
