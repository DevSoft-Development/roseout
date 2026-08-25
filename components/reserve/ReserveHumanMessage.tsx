export default function ReserveHumanMessage({
  tone = "info",
  children,
}: {
  tone?: "info" | "success" | "error" | "warning";
  children: React.ReactNode;
}) {
  const cls =
    tone === "error"
      ? "border-red-500/30 bg-red-500/10 text-red-200"
      : tone === "success"
        ? "border-green-500/30 bg-green-500/10 text-green-200"
        : tone === "warning"
          ? "border-[var(--reserve-primary)]/30 bg-[var(--reserve-primary-soft)] text-white/85"
          : "border-[var(--reserve-border)] bg-white/[0.035] text-[var(--reserve-muted-strong)]";

  return (
    <div className={`rounded-2xl border p-4 text-sm font-bold leading-6 ${cls}`}>
      {children}
    </div>
  );
}
