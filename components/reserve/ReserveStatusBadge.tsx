import { getReservationStatusLabel } from "@/lib/reservations/ui";

const tone: Record<string, string> = {
  pending: "border-amber-300/30 bg-amber-400/15 text-amber-100",
  confirmed: "border-emerald-300/30 bg-emerald-400/15 text-emerald-100",
  checked_in: "border-blue-300/30 bg-blue-400/15 text-blue-100",
  arrived: "border-blue-300/30 bg-blue-400/15 text-blue-100",
  seated: "border-purple-300/30 bg-purple-400/15 text-purple-100",
  completed: "border-white/15 bg-white/10 text-white/70",
  cancelled: "border-red-300/25 bg-red-500/15 text-red-100",
  declined: "border-red-300/25 bg-red-500/15 text-red-100",
  no_show: "border-zinc-300/20 bg-zinc-800 text-zinc-100",
  waitlisted: "border-fuchsia-300/30 bg-fuchsia-400/15 text-fuchsia-100",
};

export default function ReserveStatusBadge({ status }: { status?: string | null }) {
  const value = String(status || "pending");
  return <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black uppercase tracking-wide ${tone[value] || tone.pending}`}>{getReservationStatusLabel(status)}</span>;
}
