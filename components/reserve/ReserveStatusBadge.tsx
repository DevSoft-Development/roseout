export default function ReserveStatusBadge({
  status,
  label,
}: {
  status?: string | null;
  label?: string | null;
}) {
  const s = String(status || "pending");
  const cls =
    s === "seated" || s === "completed"
      ? "border border-emerald-400/20 bg-emerald-500/10 text-emerald-300"
      : s === "cancelled" || s === "declined" || s === "no_show"
        ? "border border-red-400/20 bg-red-500/10 text-red-300"
        : s === "confirmed"
          ? "border border-white/15 bg-white/[0.05] text-white/75"
          : "border border-[var(--reserve-primary)]/25 bg-[var(--reserve-primary-soft)] text-[#ff8aa0]";

  return (
    <span
      className={`reserve-status-badge inline-flex max-w-full shrink-0 items-center whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-black leading-none ${cls}`}
    >
      <span className="truncate">{label || s}</span>
    </span>
  );
}
