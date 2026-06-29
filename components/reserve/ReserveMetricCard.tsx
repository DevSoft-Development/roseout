import type { ComponentType } from "react";
import { AlertCircle, CheckCircle2, CircleDot, Clock3, DoorOpen, ListChecks, XCircle } from "lucide-react";
const iconMap:Record<string,ComponentType<{size?:number}>>={"Needs action":AlertCircle,"Ready for arrival":Clock3,"Guest arrived":DoorOpen,"Seated now":CircleDot,"Finished":CheckCircle2,"Waitlist":ListChecks,"No-shows":XCircle};
export default function ReserveMetricCard({ label, value, hint, active, onClick }: { label: string; value: string | number; hint?: string; active?: boolean; onClick?: () => void }) {
  const Comp = onClick ? "button" : "div"; const Icon=iconMap[label]||CircleDot;
  return <Comp type={onClick ? "button" : undefined} onClick={onClick} className={`reserve-metric-card flex min-h-[86px] w-full items-center gap-3 rounded-2xl border p-4 text-left transition hover:border-[var(--reserve-border-strong)] ${active ? "reserve-metric-active" : ""}`}><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--reserve-primary-soft)] text-[var(--reserve-primary)]"><Icon size={18}/></span><span className="min-w-0"><span className="block text-2xl font-black leading-none">{value}</span><span className="mt-1 block text-xs font-black uppercase tracking-[0.12em] reserve-muted">{label}</span>{hint ? <span className="mt-0.5 block text-xs reserve-muted">{hint}</span> : null}</span></Comp>;
}
