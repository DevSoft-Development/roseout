export default function AnalyticsKpiCard({
  label,
  value,
  detail,
  locked = false,
}: {
  label: string;
  value: string | number;
  detail?: string;
  locked?: boolean;
}) {
  return (
    <div className={`rounded-[1.75rem] border border-white/10 bg-white/[0.06] p-5 shadow-xl shadow-black/20 ${locked ? "blur-[1px]" : ""}`}>
      <p className="text-xs font-black uppercase tracking-[0.2em] text-white/45">{label}</p>
      <p className="mt-3 text-3xl font-black tracking-tight text-white">{value}</p>
      {detail ? <p className="mt-2 text-sm font-bold text-white/45">{detail}</p> : null}
    </div>
  );
}
