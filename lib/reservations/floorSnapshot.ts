export type FloorReservation = { id:string; status?:string|null; assigned_resource_id?:string|null; assigned_layout_item_id?:string|null; assigned_resource_label?:string|null; reservable_item_name?:string|null };
export type FloorResource = { id:string; label?:string|null; item_name?:string|null; item_type?:string|null; capacity?:number|null; capacity_min?:number|null; capacity_max?:number|null; status?:string|null; is_active?:boolean|null };
export function resourceName(r: FloorResource){ return r.label || r.item_name || 'Resource'; }
export function resourceCapacity(r: FloorResource){ return Number(r.capacity || r.capacity_max || r.capacity_min || 0); }
export function getFloorSnapshotStatus(resource: FloorResource, reservations: FloorReservation[]){
  const base = String(resource.status || '').toLowerCase();
  if (base === 'blocked') return 'Blocked';
  if (base === 'closed' || resource.is_active === false) return 'Closed';
  const matches = reservations.filter((reservation) => {
    const resourceId = reservation.assigned_resource_id || reservation.assigned_layout_item_id;
    return resourceId ? resourceId === resource.id : reservation.assigned_resource_label === resourceName(resource);
  });
  if (matches.some((r) => r.status === 'seated')) return 'Seated';
  if (matches.some((r) => r.status === 'checked_in' || r.status === 'arrived')) return 'Arrived';
  if (matches.some((r) => r.status === 'confirmed' || r.status === 'pending')) return 'Reserved';
  return 'Open';
}
