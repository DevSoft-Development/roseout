export type FloorReservation = { id:string; status?:string|null; assigned_resource_id?:string|null; assigned_layout_item_id?:string|null; assigned_resource_label?:string|null; reservable_item_name?:string|null; customer_name?:string|null; party_size?:number|null; reservation_time?:string|null };
export type FloorResource = { id:string; label?:string|null; item_name?:string|null; item_type?:string|null; capacity?:number|null; capacity_min?:number|null; capacity_max?:number|null; status?:string|null; is_active?:boolean|null };
export type FloorSnapshotState = { status:'Open'|'Reserved'|'Arrived'|'Seated'|'Blocked'|'Closed'; available:boolean; reservation?:FloorReservation };
export function resourceName(r: FloorResource){ return r.label || r.item_name || 'Resource'; }
export function resourceCapacity(r: FloorResource){ return Number(r.capacity || r.capacity_max || r.capacity_min || 0); }
export function reservationResourceId(reservation: FloorReservation){ return reservation.assigned_resource_id || reservation.assigned_layout_item_id || ''; }
export function activeFloorReservations(reservations: FloorReservation[]){ return reservations.filter((r)=>!['completed','cancelled','declined','no_show'].includes(String(r.status||''))); }
export function getFloorResourceReservation(resource: FloorResource, reservations: FloorReservation[]){
  const matches = activeFloorReservations(reservations).filter((reservation) => {
    const resourceId = reservationResourceId(reservation);
    return resourceId ? resourceId === resource.id : reservation.assigned_resource_label === resourceName(resource) || reservation.reservable_item_name === resourceName(resource);
  });
  return matches.find((r)=>r.status === 'seated') || matches.find((r)=>r.status === 'checked_in' || r.status === 'arrived') || matches.find((r)=>r.status === 'confirmed' || r.status === 'pending') || matches[0];
}
export function getFloorSnapshotState(resource: FloorResource, reservations: FloorReservation[]): FloorSnapshotState{
  const base = String(resource.status || '').toLowerCase();
  if (base === 'blocked') return { status:'Blocked', available:false };
  if (base === 'closed' || resource.is_active === false) return { status:'Closed', available:false };
  const reservation = getFloorResourceReservation(resource,reservations);
  if (!reservation) return { status:'Open', available:true };
  if (reservation.status === 'seated') return { status:'Seated', available:false, reservation };
  if (reservation.status === 'checked_in' || reservation.status === 'arrived') return { status:'Arrived', available:false, reservation };
  return { status:'Reserved', available:false, reservation };
}
export function getFloorSnapshotStatus(resource: FloorResource, reservations: FloorReservation[]){ return getFloorSnapshotState(resource,reservations).status; }
export function dedupeFloorResources<T extends FloorResource>(resources: T[]) { const seen = new Set<string>(); const output: T[] = []; for (const resource of resources) { const key = String(resource.id || `${resourceName(resource).toLowerCase()}-${resourceCapacity(resource)}-${resource.item_type || ""}`); if (seen.has(key)) continue; seen.add(key); output.push(resource); } return output; }
