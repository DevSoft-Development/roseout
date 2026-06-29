export default function ReserveStatusBadge({ status, label }: { status?: string | null; label?: string | null }) {
  const s = String(status || "pending");
  const cls =
    s === "confirmed"
      ? "text-blue-400 bg-blue-500/10"
      : s === "checked_in" || s === "arrived"
        ? "text-amber-400 bg-amber-500/10"
        : s === "seated"
          ? "text-green-400 bg-green-500/10"
          : s === "completed"
            ? "text-emerald-400 bg-emerald-500/10"
            : s === "cancelled" || s === "declined" || s === "no_show"
              ? "text-red-400 bg-red-500/10"
              : "text-rose-400 bg-rose-500/10";

  return (
    <span className={`reserve-status-badge inline-flex max-w-full shrink-0 items-center whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-black leading-none ${cls}`}>
      <span className="truncate">{label || s}</span>
    </span>
  );
}
