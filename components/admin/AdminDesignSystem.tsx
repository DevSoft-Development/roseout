import Link from "next/link";
import type { ComponentType, ReactNode } from "react";

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
    <main className="admin-page-shell min-h-screen max-w-full overflow-x-hidden bg-[#050505] px-4 pb-12 pt-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1600px] min-w-0 space-y-6">
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
    <section className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(236,11,91,0.22),transparent_32%),linear-gradient(135deg,#151013,#08080a_58%,#101012)] p-5 shadow-2xl shadow-black/30 sm:p-6">
      <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-200">
              {eyebrow}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="truncate text-3xl font-black tracking-tight text-white sm:text-4xl">
              {title}
            </h1>
            {badge}
          </div>
          {subtitle ? (
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
              {subtitle}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex min-w-0 flex-wrap gap-2">{actions}</div>
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
      ? "inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#ec0b5b] px-4 py-2 text-sm font-black text-white shadow-lg shadow-rose-950/30 hover:bg-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-300/60"
      : variant === "ghost"
        ? "inline-flex min-h-11 items-center justify-center rounded-2xl px-4 py-2 text-sm font-black text-white/70 hover:bg-white/[0.06] hover:text-white focus:outline-none focus:ring-2 focus:ring-rose-300/50"
        : "inline-flex min-h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-2 text-sm font-black text-white/80 hover:border-rose-200/30 hover:text-white focus:outline-none focus:ring-2 focus:ring-rose-300/50";
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
    <div className="min-w-0 rounded-[1.35rem] border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.065),rgba(255,255,255,0.025))] p-4 shadow-xl shadow-black/20">
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
      className={`min-w-0 overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.04] shadow-xl shadow-black/20 ${className}`}
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
