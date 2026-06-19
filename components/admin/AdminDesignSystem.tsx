import Link from "next/link";
import { Search } from "lucide-react";
import type { ComponentType, InputHTMLAttributes, ReactNode } from "react";

type IconType = ComponentType<{ className?: string }>;

export function formatAdminNumber(value: number | string | null | undefined) {
  if (typeof value === "string") return value;
  return Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(
    Number(value || 0),
  );
}

export function formatAdminDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function getReadinessLabel(score: number | null | undefined) {
  if (score == null) return "Unknown";
  if (score >= 95) return "Excellent";
  if (score >= 80) return "High";
  if (score >= 60) return "Medium";
  return "Needs work";
}

export function getReadinessTone(score: number | null | undefined) {
  if (score == null) return "muted";
  if (score >= 80) return "green";
  if (score >= 60) return "amber";
  return "red";
}

export function AdminPageShell({ children }: { children: ReactNode }) {
  return (
    <main className="admin-page-shell min-h-screen max-w-full overflow-x-hidden bg-[radial-gradient(circle_at_top_right,rgba(236,11,91,0.08),transparent_26%),#050505] px-4 pb-12 pt-6 text-white sm:px-6 lg:px-8 xl:px-10">
      <div className="mx-auto w-full max-w-[1600px] min-w-0 space-y-5">
        {children}
      </div>
    </main>
  );
}

export function AdminPageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  badge,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <section className="rounded-[1.25rem] border-b border-white/10 bg-transparent py-2">
      <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-200">
              {eyebrow}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="truncate text-2xl font-black tracking-tight text-white sm:text-3xl">
              {title}
            </h1>
            {badge}
          </div>
          {subtitle ? (
            <p className="mt-1 max-w-3xl text-sm leading-6 text-white/58">
              {subtitle}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex min-w-0 flex-wrap justify-start gap-2 lg:justify-end">{actions}</div>
        ) : null}
      </div>
    </section>
  );
}

export function AdminActionButton({
  href,
  children,
  variant = "secondary",
  type = "button",
}: {
  href?: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  type?: "button" | "submit";
}) {
  const className =
    variant === "primary"
      ? "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#ec0b5b] px-4 py-2 text-sm font-black text-white shadow-lg shadow-rose-950/30 hover:bg-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-300/60"
      : variant === "ghost"
        ? "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-black text-white/70 hover:bg-white/[0.06] hover:text-white focus:outline-none focus:ring-2 focus:ring-rose-300/50"
        : "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.055] px-4 py-2 text-sm font-black text-white/80 hover:border-rose-200/30 hover:text-white focus:outline-none focus:ring-2 focus:ring-rose-300/50";
  return href ? (
    <Link href={href} className={className}>
      {children}
    </Link>
  ) : (
    <button type={type} className={className}>
      {children}
    </button>
  );
}

export function AdminKpiGrid({ children }: { children: ReactNode }) {
  return (
    <section className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
      {children}
    </section>
  );
}

export function AdminKpiCard({
  label,
  value,
  helper,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  helper?: string;
  icon?: IconType;
}) {
  return (
    <div className="min-w-0 rounded-[18px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(236,11,91,0.10),transparent_35%),linear-gradient(145deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] p-4 shadow-xl shadow-black/20">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/45">
          {label}
        </p>
        {Icon ? (
          <span className="rounded-2xl border border-rose-200/20 bg-rose-500/10 p-2 text-rose-100">
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
      </div>
      <p className="mt-3 truncate text-3xl font-black text-white">
        {formatAdminNumber(value)}
      </p>
      {helper ? (
        <p className="mt-1 text-xs font-semibold text-white/45">{helper}</p>
      ) : null}
    </div>
  );
}

export function AdminSectionCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`min-w-0 overflow-hidden rounded-[1.35rem] border border-white/10 bg-[#101012]/90 shadow-xl shadow-black/20 ${className}`}
    >
      {children}
    </section>
  );
}

export function AdminStatusBadge({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "rose" | "green" | "amber" | "red" | "blue" | "muted";
}) {
  const tones = {
    rose: "border-rose-300/35 bg-rose-500/15 text-rose-100",
    green: "border-emerald-300/30 bg-emerald-500/10 text-emerald-100",
    amber: "border-amber-300/30 bg-amber-500/10 text-amber-100",
    red: "border-red-300/30 bg-red-500/10 text-red-100",
    blue: "border-blue-300/30 bg-blue-500/10 text-blue-100",
    muted: "border-white/10 bg-white/[0.06] text-white/70",
  };
  return (
    <span
      className={`inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-xs font-black capitalize ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function AdminEmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[1.35rem] border border-dashed border-white/15 bg-black/20 p-10 text-center">
      <h2 className="text-2xl font-black text-white">{title}</h2>
      <p className="mx-auto mt-2 max-w-2xl text-sm text-white/55">{body}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}


export function AdminFilterPanel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <AdminSectionCard className={`p-4 ${className}`}>{children}</AdminSectionCard>;
}

export function AdminFilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0 space-y-2"><p className="text-xs font-black uppercase tracking-[0.22em] text-white/45">{label}</p><div className="flex max-w-full gap-2 overflow-x-auto pb-1 lg:flex-wrap lg:overflow-visible">{children}</div></div>;
}

export function AdminFilterChip({ active, children, href }: { active?: boolean; children: ReactNode; href?: string }) {
  const className = `shrink-0 rounded-xl border px-3 py-2 text-xs font-black transition ${active ? "border-rose-300/60 bg-[#ec0b5b] text-white shadow-lg shadow-rose-950/25" : "border-white/10 bg-white/[0.05] text-white/65 hover:border-white/20 hover:text-white"}`;
  return href ? <Link href={href} className={className}>{children}</Link> : <span className={className}>{children}</span>;
}

export function AdminSearchInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <label className="flex min-h-10 min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-[#0b0b0d] px-3 text-sm text-white focus-within:border-rose-300/50 focus-within:ring-4 focus-within:ring-rose-300/10"><Search className="h-4 w-4 shrink-0 text-white/35" /><input {...props} className={`min-w-0 flex-1 bg-transparent py-2 font-semibold outline-none placeholder:text-white/35 ${props.className || ""}`} /></label>;
}

export function AdminToolbar({ children }: { children: ReactNode }) { return <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">{children}</div>; }
export function AdminDataCard({ children, active }: { children: ReactNode; active?: boolean }) { return <div className={`rounded-2xl border p-4 transition ${active ? "border-[#ec0b5b]/70 bg-rose-500/[0.045]" : "border-white/10 bg-white/[0.025] hover:bg-white/[0.045]"}`}>{children}</div>; }
export function AdminDataTableShell({ children }: { children: ReactNode }) { return <AdminSectionCard className="max-w-full p-3 sm:p-4"><div className="max-w-full overflow-x-auto">{children}</div></AdminSectionCard>; }
export function AdminDetailPanel({ children, className = "" }: { children: ReactNode; className?: string }) { return <aside className={`min-w-0 rounded-[1.35rem] border border-white/10 bg-[#101012] p-5 shadow-2xl shadow-black/30 xl:sticky xl:top-6 xl:h-fit ${className}`}>{children}</aside>; }
export function AdminDetailSection({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) { return <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="flex items-center justify-between gap-3"><h3 className="font-black text-white">{title}</h3>{action}</div><div className="mt-3">{children}</div></section>; }
export function AdminPagination({ children }: { children: ReactNode }) { return <div className="flex flex-wrap items-center gap-2">{children}</div>; }
export function AdminReadinessIndicator({ score }: { score: number }) { const tone=getReadinessTone(score); return <div className="w-28"><div className="flex items-baseline gap-2"><span className="text-2xl font-black">{score}%</span><span className={`text-xs font-black ${tone === "green" ? "text-emerald-200" : tone === "amber" ? "text-amber-200" : "text-red-200"}`}>{getReadinessLabel(score)}</span></div><div className="mt-2 h-2 rounded-full bg-white/10"><div className={`h-2 rounded-full ${tone === "green" ? "bg-emerald-400" : tone === "amber" ? "bg-amber-400" : "bg-red-400"}`} style={{ width: `${Math.max(5, Math.min(100, score))}%` }} /></div></div>; }
export function AdminIconButton({ children, label }: { children: ReactNode; label: string }) { return <button type="button" aria-label={label} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-white/70 hover:border-rose-300/40 hover:text-white focus:outline-none focus:ring-2 focus:ring-rose-300/50">{children}</button>; }
export function AdminSkeletonCard() { return <div className="h-32 animate-pulse rounded-[1.35rem] border border-white/10 bg-white/[0.04]" />; }
export function AdminErrorCard({ title = "Something went wrong", body = "We could not load this admin data. Please try again." }: { title?: string; body?: string }) { return <div className="rounded-[1.35rem] border border-red-300/20 bg-red-500/10 p-5"><h2 className="font-black text-red-100">{title}</h2><p className="mt-1 text-sm text-red-100/70">{body}</p></div>; }
