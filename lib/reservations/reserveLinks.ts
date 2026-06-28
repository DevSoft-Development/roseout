export function reserveQuery(params: Record<string,string|undefined>) { const q = new URLSearchParams(); Object.entries(params).forEach(([k,v])=>{ if(v) q.set(k,v); }); const s=q.toString(); return s ? `?${s}` : ''; }
export function getEmbedLink(locationId?: string) { return locationId ? `/embed/reservations/${locationId}` : ''; }
export function getQrLink(locationId?: string) { return locationId ? `/business/dashboard/qr-codes?locationId=${encodeURIComponent(locationId)}&mode=reservations` : ''; }
export function getBookingLink(locationId?: string, type='restaurant') { return locationId ? `/reserve/${type}/${locationId}` : ''; }
