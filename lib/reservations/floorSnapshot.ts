export type FloorReservation = {
  id: string;
  status?: string | null;
  resource_id?: string | null;
  resource_label?: string | null;
  reservable_item_name?: string | null;
  bookable_item_id?: string | null;
  bookable_item_name?: string | null;
  bookable_item_type?: string | null;
  customer_name?: string | null;
  party_size?: number | null;
  reservation_time?: string | null;
  updated_at?: string | null;
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
export type FloorSnapshotState = { status:'Open'|'Pending'|'Confirmed'|'Waiting'|'Ready sent'|'Seated'|'Completed'|'Blocked'|'Closed'; available:boolean; reservation?:FloorReservation };

function cleanString(value: unknown) { return typeof value === 'string' ? value.trim() : ''; }
function hasValue(value: unknown) { return value !== undefined && value !== null && String(value).trim() !== ''; }
function normalizedLabel(value: unknown) { return cleanString(value).toLowerCase().replace(/\s+/g, ' '); }
function isUuid(value: unknown) { return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim()); }

export function resourceId(r: FloorResource){ return r.id || r.layout_item_id || r.bookable_item_id || r.resource_id || ''; }
export function resourceSource(r: FloorResource){ return r.resource_source || r.resource_table || r.source || (r.layout_item_id || r.id ? 'layout_items' : r.bookable_item_id ? 'location_bookable_items' : ''); }
export function resourceName(r: FloorResource){ return cleanString(r.item_name) || cleanString(r.name) || cleanString(r.label) || cleanString((r as any).resource_label) || cleanString((r as any).title) || 'Resource'; }
export function resourceType(r: FloorResource){ return r.item_type || r.type || null; }
export function resourceCapacity(r: FloorResource){ return Number(r.capacity || r.capacity_max || r.capacity_min || 0); }
export function resourceAssignmentPayload(r: FloorResource){
  const source = resourceSource(r) || undefined;
  const id = resourceId(r);
  return {
    ...(id ? { resource_id: id } : {}),
    ...(source ? { resource_source: source, resource_table: source } : {}),
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
function resourceLabels(resource: FloorResource) { return [resource.item_name, resource.label, resource.name].map(normalizedLabel).filter(Boolean); }
function reservationLabels(reservation: FloorReservation) { return [reservation.bookable_item_name].map(normalizedLabel).filter(Boolean); }
const reservationStatusPriority: Record<string, number> = { seated: 1, checked_in: 2, waiting: 2, arrived: 3, confirmed: 4, pending: 5 };
function statusPriority(reservation: FloorReservation) { return reservationStatusPriority[String(reservation.status || '').toLowerCase()] || 99; }
function dateDistance(reservation: FloorReservation, now = Date.now()) {
  const date = cleanString((reservation as any).reservation_date);
  const time = cleanString(reservation.reservation_time);
  const timestamp = Date.parse(`${date || new Date(now).toISOString().split('T')[0]}T${time || '00:00'}`);
  return Number.isFinite(timestamp) ? Math.abs(timestamp - now) : Number.MAX_SAFE_INTEGER;
}
function updatedTimestamp(reservation: FloorReservation) {
  const timestamp = Date.parse(cleanString(reservation.updated_at));
  return Number.isFinite(timestamp) ? timestamp : 0;
}
export function getFloorResourceReservation(resource: FloorResource, reservations: FloorReservation[]){
  const currentLabels = resourceLabels(resource);
  const matches = activeFloorReservations(reservations).filter((reservation) => {
    const reservationBookableId = cleanString(reservation.bookable_item_id);
    if (isUuid(reservationBookableId) && cleanString(resource.id) && reservationBookableId === cleanString(resource.id)) return true;
    if (isUuid(reservationBookableId) && cleanString(resource.bookable_item_id) && reservationBookableId === cleanString(resource.bookable_item_id)) return true;
    const assignedLabels = reservationLabels(reservation);
    return assignedLabels.length > 0 && currentLabels.length > 0 && assignedLabels.some((label) => currentLabels.includes(label));
  });
  return matches.sort((a, b) => statusPriority(a) - statusPriority(b) || dateDistance(a) - dateDistance(b) || updatedTimestamp(b) - updatedTimestamp(a))[0];
}
export function getFloorSnapshotState(resource: FloorResource, reservations: FloorReservation[]): FloorSnapshotState{
  const base = String(resource.status || '').toLowerCase();
  if (base === 'blocked' || base === 'maintenance') return { status:'Blocked', available:false };
  if (base === 'closed' || resource.is_active === false) return { status:'Closed', available:false };
  const reservation = getFloorResourceReservation(resource,reservations);
  if (!reservation) return { status:'Open', available:true };
  if (reservation.status === 'seated') return { status:'Seated', available:false, reservation };
  if ((reservation.status === 'checked_in' || reservation.status === 'waiting' || reservation.status === 'arrived') && (reservation as any).table_ready_sms_sent) return { status:'Ready sent', available:false, reservation };
  if (reservation.status === 'checked_in' || reservation.status === 'waiting' || reservation.status === 'arrived') return { status:'Waiting', available:false, reservation };
  if (reservation.status === 'confirmed') return { status:'Confirmed', available:false, reservation };
  if (reservation.status === 'pending') return { status:'Pending', available:false, reservation };
  return { status:'Confirmed', available:false, reservation };
}
export function getFloorSnapshotStatus(resource: FloorResource, reservations: FloorReservation[]){ return getFloorSnapshotState(resource,reservations).status; }
export function dedupeFloorResources<T extends FloorResource>(resources: T[]) { const seen = new Set<string>(); const output: T[] = []; for (const resource of resources) { const name = resourceName(resource).trim().toLowerCase(); const semanticKey = name !== 'resource' ? `${name}-${resourceCapacity(resource)}-${resource.item_type || resource.type || ''}` : ''; const key = semanticKey || String(resourceId(resource)); if (seen.has(key)) continue; seen.add(key); output.push(resource); } return output; }
