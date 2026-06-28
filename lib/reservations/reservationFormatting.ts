export function formatReservationDuration(minutes?: number | null) { const value = Number(minutes || 90); const h = Math.floor(value/60); const m=value%60; if (!h) return `${value} min`; return m ? `${h}h ${m}m` : `${h}h`; }
export function guestInitials(name?: string | null) { return String(name || 'Guest').split(/\s+/).filter(Boolean).slice(0,2).map((p)=>p[0]?.toUpperCase()).join('') || 'G'; }
export function formatShortDate(date: Date) { return date.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' }); }
