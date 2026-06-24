import Link from "next/link";
import { AdminSectionCard } from "@/components/admin/AdminDesignSystem";

export type CrmView = readonly [key: string, label: string, description: string];

export default function CrmViewCard({
  eyebrow,
  active,
  views,
  baseHref,
  children,
}: {
  eyebrow: string;
  active: CrmView;
  views: readonly CrmView[];
  baseHref: string;
  children?: React.ReactNode;
}) {
  return (
    <AdminSectionCard className="p-5 sm:p-6">
      <div className="flex min-w-0 flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-200">{eyebrow}</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">{active[1]}</h2>
          <p className="mt-3 max-w-3xl text-sm font-bold leading-6 text-white/58">{active[2]}</p>
        </div>
        <Link href="/admin/dashboard/crm" className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-4 text-sm font-black text-white/70 hover:border-rose-300/35 hover:text-white">All CRM</Link>
      </div>
      <div className="mt-6 flex max-w-full gap-2 overflow-x-auto pb-1 lg:flex-wrap lg:overflow-visible">
        {views.map(([key, label]) => (
          <Link key={key} href={`${baseHref}?view=${key}`} className={`shrink-0 rounded-xl border px-4 py-2 text-xs font-black transition ${active[0] === key ? "border-rose-300/50 bg-[#ec0b5b] text-white shadow-lg shadow-rose-950/25" : "border-white/10 bg-white/[0.045] text-white/65 hover:border-white/20 hover:text-white"}`}>{label}</Link>
        ))}
      </div>
      {children ? <div className="mt-6">{children}</div> : null}
    </AdminSectionCard>
  );
}
