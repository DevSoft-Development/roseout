export type FloorReservation = {
  id: string;
  status?: string | null;
  assigned_resource_id?: string | null;
  assigned_layout_item_id?: string | null;
  assigned_resource_label?: string | null;
  reservable_item_name?: string | null;
  customer_name?: string | null;
  party_size?: number | null;
  reservation_time?: string | null;
};

export type FloorResource = {
  id?: string | null;
  resource_id?: string | null;
  layout_item_id?: string | null;
  assigned_resource_id?: string | null;
  label?: string | null;
  item_name?: string | null;
  name?: string | null;
  item_type?: string | null;
  resource_type?: string | null;
  type?: string | null;
  capacity?: number | null;
  capacity_min?: number | null;
  capacity_max?: number | null;
  status?: string | null;
  is_active?: boolean | null;
};

export type FloorSnapshotState = {
  status: "Open" | "Reserved" | "Arrived" | "Seated" | "Blocked" | "Closed";
  available: boolean;
  reservation?: FloorReservation;
};

function normalize(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function resourceId(resource: FloorResource) {
  return String(resource.id || resource.resource_id || resource.layout_item_id || resource.assigned_resource_id || "");
}

export function resourceName(resource: FloorResource) {
  return resource.label || resource.item_name || resource.name || "Resource";
}

export function resourceType(resource: FloorResource) {
  return resource.item_type || resource.resource_type || resource.type || "resource";
}

export function resourceCapacity(resource: FloorResource) {
  return Number(resource.capacity || resource.capacity_max || resource.capacity_min || 0);
}

export function reservationResourceId(reservation: FloorReservation) {
  return reservation.assigned_resource_id || reservation.assigned_layout_item_id || "";
}

export function activeFloorReservations(reservations: FloorReservation[]) {
  return reservations.filter((reservation) => !["completed", "cancelled", "declined", "no_show"].includes(String(reservation.status || "")));
}

export function getFloorResourceReservation(resource: FloorResource, reservations: FloorReservation[]) {
  const id = resourceId(resource);
  const name = resourceName(resource);
  const matches = activeFloorReservations(reservations).filter((reservation) => {
    const assignedId = reservationResourceId(reservation);
    return assignedId ? assignedId === id : reservation.assigned_resource_label === name || reservation.reservable_item_name === name;
  });
  return matches.find((reservation) => reservation.status === "seated")
    || matches.find((reservation) => reservation.status === "checked_in" || reservation.status === "arrived")
    || matches.find((reservation) => reservation.status === "confirmed" || reservation.status === "pending")
    || matches[0];
}

export function getFloorSnapshotState(resource: FloorResource, reservations: FloorReservation[]): FloorSnapshotState {
  const base = String(resource.status || "").toLowerCase();
  if (base === "blocked" || base === "maintenance") return { status: "Blocked", available: false };
  if (base === "closed" || resource.is_active === false) return { status: "Closed", available: false };
  const reservation = getFloorResourceReservation(resource, reservations);
  if (!reservation) return { status: "Open", available: true };
  if (reservation.status === "seated") return { status: "Seated", available: false, reservation };
  if (reservation.status === "checked_in" || reservation.status === "arrived") return { status: "Arrived", available: false, reservation };
  return { status: "Reserved", available: false, reservation };
}

export function getFloorSnapshotStatus(resource: FloorResource, reservations: FloorReservation[]) {
  return getFloorSnapshotState(resource, reservations).status;
}

export function dedupeFloorResources<T extends FloorResource>(resources: T[]) {
  const seen = new Set<string>();
  const output: T[] = [];
  for (const resource of resources) {
    const name = normalize(resourceName(resource));
    const type = normalize(resourceType(resource));
    const capacity = resourceCapacity(resource) || "";
    const key = name ? `${name}|${capacity}|${type}` : resourceId(resource);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(resource);
  }
  return output;
}
