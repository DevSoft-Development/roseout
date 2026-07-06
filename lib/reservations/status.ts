export const CANONICAL_RESERVATION_STATUSES = [
  "pending",
  "confirmed",
  "checked_in",
  "waiting",
  "seated",
  "completed",
  "cancelled",
  "no_show",
] as const;

export type CanonicalReservationStatus = (typeof CANONICAL_RESERVATION_STATUSES)[number];

export const RESERVATION_STATUSES = [
  ...CANONICAL_RESERVATION_STATUSES,
  "waitlisted",
  "declined",
] as const;

export type ReservationStatus =
  | CanonicalReservationStatus
  | "arrived"
  | "occupied"
  | "declined"
  | "waitlisted";

export const ACTIVE_RESERVATION_STATUSES = [
  "pending",
  "confirmed",
  "checked_in",
  "waiting",
  "arrived",
  "seated",
  "occupied",
] as const;

export function normalizeReservationStatus(status?: string | null): ReservationStatus {
  const value = String(status || "").toLowerCase().trim();
  if (value === "arrived") return "checked_in";
  if (value === "occupied") return "seated";
  if (value === "reservation" || value === "requested" || value === "request") return "pending";
  if (value === "complete") return "completed";
  if (value === "noshow" || value === "no-show") return "no_show";
  if (RESERVATION_STATUSES.includes(value as (typeof RESERVATION_STATUSES)[number])) {
    return value as ReservationStatus;
  }
  return "pending";
}

export function getReservationStatusLabel(status?: string | null) {
  const normalized = normalizeReservationStatus(status);
  const labels: Record<string, string> = {
    pending: "Pending",
    confirmed: "Confirmed",
    checked_in: "Waiting",
    waiting: "Waiting",
    arrived: "Waiting",
    seated: "Seated",
    completed: "Completed",
    cancelled: "Cancelled",
    no_show: "No-show",
    waitlisted: "Waitlisted",
    declined: "Cancelled",
    occupied: "Seated",
  };
  return labels[String(normalized)] || "Pending";
}

export function getReservationStatusTone(status?: string | null) {
  const normalized = normalizeReservationStatus(status);
  if (normalized === "confirmed") return "info";
  if (normalized === "checked_in" || normalized === "waiting") return "warning";
  if (normalized === "seated" || normalized === "completed") return "success";
  if (normalized === "cancelled" || normalized === "declined" || normalized === "no_show") return "danger";
  return "neutral";
}

export const ALLOWED_RESERVATION_STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ["confirmed", "checked_in", "waiting", "cancelled", "declined", "no_show"],
  confirmed: ["checked_in", "waiting", "seated", "cancelled", "no_show"],
  checked_in: ["waiting", "seated", "cancelled", "no_show"],
  waiting: ["checked_in", "seated", "cancelled", "no_show"],
  seated: ["completed", "cancelled", "no_show"],
  waitlisted: ["pending", "confirmed", "cancelled"],
  completed: [],
  cancelled: [],
  declined: [],
  no_show: [],
};

export function canTransitionReservationStatus(from?: string | null, to?: string | null) {
  const fromStatus = String(normalizeReservationStatus(from));
  const toStatus = String(normalizeReservationStatus(to));
  if (!toStatus) return false;
  if (fromStatus === toStatus) return true;
  return Boolean(ALLOWED_RESERVATION_STATUS_TRANSITIONS[fromStatus]?.includes(toStatus));
}

export type ReservationAction = {
  key: string;
  label: string;
  targetStatus?: ReservationStatus;
  requiresAssignment?: boolean;
  destructive?: boolean;
  disabledReason?: string;
};

export function getNextReservationActions(reservation: { status?: string | null; bookable_item_id?: unknown; bookable_item_name?: unknown } | string | null | undefined): ReservationAction[] {
  const status = typeof reservation === "string" ? reservation : reservation?.status;
  const normalized = normalizeReservationStatus(status);
  const hasAssignment = typeof reservation === "object" && reservation !== null && Boolean(String(reservation.bookable_item_id || reservation.bookable_item_name || "").trim());
  const actions: ReservationAction[] = [];
  if (normalized === "pending") actions.push({ key: "confirm", label: "Confirm", targetStatus: "confirmed" });
  if (normalized === "confirmed") actions.push({ key: "check_in", label: "Check in", targetStatus: "checked_in" });
  if (["checked_in", "waiting"].includes(normalized)) actions.push({ key: "seat", label: hasAssignment ? "Seat guest" : "Assign table", targetStatus: "seated", requiresAssignment: true });
  if (normalized === "seated") actions.push({ key: "complete", label: "Complete visit", targetStatus: "completed" });
  if (!["completed", "cancelled", "declined", "no_show"].includes(normalized)) {
    actions.push({ key: "move_time", label: "Move time" });
    actions.push({ key: "message", label: "Message" });
    actions.push({ key: "cancel", label: "Cancel", targetStatus: "cancelled", destructive: true });
    actions.push({ key: "no_show", label: "Mark no-show", targetStatus: "no_show", destructive: true });
  }
  return actions;
}


export function canCheckInReservation(status?: string | null) {
  return normalizeReservationStatus(status) === "confirmed";
}

export function canAssignReservationResource(status?: string | null) {
  return ["checked_in", "waiting"].includes(String(normalizeReservationStatus(status)));
}

export function canSeatReservation(status?: string | null) {
  return ["checked_in", "waiting"].includes(String(normalizeReservationStatus(status)));
}

export function canCompleteReservation(status?: string | null) {
  return normalizeReservationStatus(status) === "seated";
}

export function isTerminalReservationStatus(status?: string | null) {
  return ["completed", "cancelled", "declined", "no_show"].includes(String(normalizeReservationStatus(status)));
}

export function isActiveReservation(status?: string | null) {
  return ACTIVE_RESERVATION_STATUSES.includes(status as (typeof ACTIVE_RESERVATION_STATUSES)[number]) || ACTIVE_RESERVATION_STATUSES.includes(normalizeReservationStatus(status) as any);
}

export function isCompletedReservation(status?: string | null) {
  return ["completed", "cancelled", "no_show", "declined"].includes(String(normalizeReservationStatus(status)));
}

export function canModifyReservation(status?: string | null) {
  return ["pending", "confirmed", "checked_in", "waiting", "waitlisted"].includes(String(normalizeReservationStatus(status)));
}

export function canCancelReservation(status?: string | null) {
  return ["pending", "confirmed", "checked_in", "waiting", "waitlisted"].includes(String(normalizeReservationStatus(status)));
}

export function isWaitlistedReservation(status?: string | null) {
  return normalizeReservationStatus(status) === "waitlisted";
}
