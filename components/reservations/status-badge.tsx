import { normalizeReservationStatus } from "@/lib/reservations/status";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 ring-yellow-200",
  confirmed: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  checked_in: "bg-blue-100 text-blue-800 ring-blue-200",
  completed: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  cancelled: "bg-red-100 text-red-800 ring-red-200",
  no_show: "bg-red-950 text-red-50 ring-red-900",
  waitlisted: "bg-purple-100 text-purple-800 ring-purple-200",
};

function label(status: string) {
  return status.replace("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function ReservationStatusBadge({ status }: { status?: string | null }) {
  const normalized = normalizeReservationStatus(status);
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide ring-1 ${STATUS_STYLES[normalized] || STATUS_STYLES.pending}`}>
      {label(normalized)}
    </span>
  );
}
