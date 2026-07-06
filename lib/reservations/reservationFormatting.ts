export function formatReservationDuration(minutes?: number | null) { const value = Number(minutes || 90); const h = Math.floor(value/60); const m=value%60; if (!h) return `${value} min`; return m ? `${h}h ${m}m` : `${h}h`; }
export function guestInitials(name?: string | null) { return String(name || 'Guest').split(/\s+/).filter(Boolean).slice(0,2).map((p)=>p[0]?.toUpperCase()).join('') || 'G'; }
export function formatShortDate(date: Date) { return date.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' }); }
export function formatReservationDateTime(value?: string | null, timezone = "America/New_York") {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  const now = new Date();
  const sameDay = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date) === new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);

  if (sameDay) return `Today at ${time}`;

  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
