export type FloorReservation = {
  id: string;
  status?: string | null;
  assigned_resource_label?: string | null;
  resource_id?: string | null;
  resource_label?: string | null;
  reservable_item_name?: string | null;
  bookable_item_id?: string | null;
  bookable_item_name?: string | null;
  bookable_item_type?: string | null;
  customer_name?: string | null;
  party_size?: number | null;
  reservation_time?: string | null;
};
export type FloorResource = {
  id?: string | null;
  layout_item_id?: string | null;
  bookable_item_id?: string | null;
  resource_id?: string | null;
  source?: string | null;
  resource_source?: string | null;
  resource_table?: string | null;
  label?: string | null;
  item_name?: string | null;
  name?: string | null;
  item_type?: string | null;
  type?: string | null;
  capacity?: number | null;
  capacity_min?: number | null;
  capacity_max?: number | null;
  location_id?: string | null;
  status?: string | null;
  is_active?: boolean | null;
};
export type FloorSnapshotState = { status:'Open'|'Reserved'|'Arrived'|'Table ready sent'|'Seated'|'Blocked'|'Closed'; available:boolean; reservation?:FloorReservation };

function cleanString(value: unknown) { return typeof value === 'string' ? value.trim() : ''; }
function hasValue(value: unknown) { return value !== undefined && value !== null && String(value).trim() !== ''; }
function normalizedLabel(value: unknown) { return cleanString(value).toLowerCase().replace(/\s+/g, ' '); }

export function resourceId(r: FloorResource){ return r.id || r.layout_item_id || r.bookable_item_id || r.resource_id || ''; }
export function resourceSource(r: FloorResource){ return r.resource_source || r.resource_table || r.source || (r.layout_item_id || r.id ? 'layout_items' : r.bookable_item_id ? 'location_bookable_items' : ''); }
export function resourceName(r: FloorResource){ return cleanString(r.item_name) || cleanString(r.name) || cleanString(r.label) || 'Resource'; }
export function resourceType(r: FloorResource){ return r.item_type || r.type || null; }
export function resourceCapacity(r: FloorResource){ return Number(r.capacity || r.capacity_max || r.capacity_min || 0); }
export function resourceAssignmentPayload(r: FloorResource){
  const source = resourceSource(r) || undefined;
  return {
    resource_id: resourceId(r),
    resource_source: source,
    resource_table: source,
    resource_label: resourceName(r),
    resource_type: resourceType(r),
    resource_capacity: resourceCapacity(r) || undefined,
  };
}
export function reservationResourceId(reservation: FloorReservation){ return cleanString(reservation.bookable_item_id); }
export function hasAssignedReservationResource(reservation?: Partial<FloorReservation> | null){
  if (!reservation) return false;
  return Boolean(
    hasValue(reservation.bookable_item_id) ||
    hasValue(reservation.bookable_item_name)
  );
}
export function getAssignedReservationResourceLabel(reservation?: Partial<FloorReservation> | null){
  if (!reservation) return 'Unassigned';
  return cleanString(reservation.bookable_item_name) || 'Unassigned';
}
export function activeFloorReservations(reservations: FloorReservation[]){ return reservations.filter((r)=>!['completed','cancelled','declined','no_show'].includes(String(r.status||''))); }
function resourceLabels(resource: FloorResource) { return [resource.item_name, resource.label].map(normalizedLabel).filter(Boolean); }
function reservationLabels(reservation: FloorReservation) { return [reservation.bookable_item_name].map(normalizedLabel).filter(Boolean); }
export function getFloorResourceReservation(resource: FloorResource, reservations: FloorReservation[]){
  const currentLabels = resourceLabels(resource);
  const matches = activeFloorReservations(reservations).filter((reservation) => {
    const reservationBookableId = cleanString(reservation.bookable_item_id);
    if (reservationBookableId && cleanString(resource.id) && reservationBookableId === cleanString(resource.id)) return true;
    if (reservationBookableId && cleanString(resource.bookable_item_id) && reservationBookableId === cleanString(resource.bookable_item_id)) return true;
    const assignedLabels = reservationLabels(reservation);
    return assignedLabels.length > 0 && currentLabels.length > 0 && assignedLabels.some((label) => currentLabels.includes(label));
  });
  return matches.find((r)=>r.status === 'seated') || matches.find((r)=>r.status === 'checked_in' || r.status === 'arrived') || matches.find((r)=>r.status === 'confirmed' || r.status === 'pending') || matches[0];
}
export function getFloorSnapshotState(resource: FloorResource, reservations: FloorReservation[]): FloorSnapshotState{
  const base = String(resource.status || '').toLowerCase();
  if (base === 'blocked' || base === 'maintenance') return { status:'Blocked', available:false };
  if (base === 'closed' || resource.is_active === false) return { status:'Closed', available:false };
  const reservation = getFloorResourceReservation(resource,reservations);
  if (!reservation) return { status:'Open', available:true };
  if (reservation.status === 'seated') return { status:'Seated', available:false, reservation };
  if ((reservation.status === 'checked_in' || reservation.status === 'arrived') && (reservation as any).table_ready_sms_sent) return { status:'Table ready sent', available:false, reservation };
  if (reservation.status === 'checked_in' || reservation.status === 'arrived') return { status:'Arrived', available:false, reservation };
  return { status:'Reserved', available:false, reservation };
}
export function getFloorSnapshotStatus(resource: FloorResource, reservations: FloorReservation[]){ return getFloorSnapshotState(resource,reservations).status; }
export function dedupeFloorResources<T extends FloorResource>(resources: T[]) { const seen = new Set<string>(); const output: T[] = []; for (const resource of resources) { const name = resourceName(resource).trim().toLowerCase(); const semanticKey = name !== 'resource' ? `${name}-${resourceCapacity(resource)}-${resource.item_type || resource.type || ''}` : ''; const key = semanticKey || String(resourceId(resource)); if (seen.has(key)) continue; seen.add(key); output.push(resource); } return output; }
