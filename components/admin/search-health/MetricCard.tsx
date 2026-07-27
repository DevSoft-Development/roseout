import { formatUnknown } from "@/lib/admin/search-explorer";

export default function MetricCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: unknown;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${highlight ? "border-rose-400/25 bg-rose-500/[0.07]" : "border-white/10 bg-white/[0.025]"}`}
    >
      <dt className="text-[10px] font-black uppercase tracking-[0.15em] text-white/40">
        {label}
      </dt>
      <dd className="mt-2 break-words text-sm font-bold text-white/85">
        {formatUnknown(value)}
      </dd>
    </div>
  );
}
