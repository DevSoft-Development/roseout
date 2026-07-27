import type { HealthStatus } from "@/lib/admin/search-explorer";
const tones: Record<HealthStatus, string> = {
  Healthy: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
  Issue: "border-amber-400/30 bg-amber-500/10 text-amber-100",
  Failed: "border-red-400/30 bg-red-500/10 text-red-100",
  Slow: "border-orange-400/30 bg-orange-500/10 text-orange-100",
  "Partial Results": "border-sky-400/30 bg-sky-500/10 text-sky-100",
  "Recovery Used": "border-violet-400/30 bg-violet-500/10 text-violet-100",
};
export default function StatusBadge({ status }: { status: HealthStatus }) {
  return (
    <span
      className={`inline-flex rounded-lg border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${tones[status]}`}
    >
      ● {status}
    </span>
  );
}
