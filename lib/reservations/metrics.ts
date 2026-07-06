import { hasAssignedReservationResource } from "./floorSnapshot";

export function reservationNeedsAction(reservation: Record<string, any>) {
  const status = String(reservation.status || "").toLowerCase();
  const hasResource = hasAssignedReservationResource(reservation);

  if (status === "pending") return true;
  if (status === "confirmed") return true;
  if (["checked_in", "waiting", "arrived"].includes(status) && !hasResource) return true;

  return false;
}
