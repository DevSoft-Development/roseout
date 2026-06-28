export default function ReserveMetricCard({ label, value, hint, active, onClick }: { label: string; value: string | number; hint?: string; active?: boolean; onClick?: () => void }) {
  const Comp = onClick ? "button" : "div";
  return <Comp type={onClick ? "button" : undefined} onClick={onClick} className={`reserve-metric-card w-full rounded-[1.5rem] border p-4 text-left shadow-xl transition ${active ? "reserve-metric-active" : ""}`}><p className="text-xs font-black uppercase tracking-[0.22em] reserve-muted">{label}</p><p className="mt-2 text-3xl font-black">{value}</p>{hint ? <p className="mt-1 text-xs reserve-muted">{hint}</p> : null}</Comp>;
}
