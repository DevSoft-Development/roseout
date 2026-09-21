import Link from "next/link";
import type { ReactNode } from "react";

export function BusinessPageShell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <main className={`business-page-shell min-h-screen bg-[var(--business-bg)] text-[var(--business-text)] ${className}`}>
      <div className="mx-auto w-full max-w-[1500px] space-y-6 px-4 pb-12 pt-6 sm:px-6 lg:px-8">{children}</div>
    </main>
  );
}

export function BusinessPageHeader({
  eyebrow,
  title,
  subtitle,
  badge,
  actions,
}: {
  eyebrow: string;
  title: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="rounded-[2rem] border border-[var(--business-border)] bg-[var(--business-panel)] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.12)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0 max-w-4xl">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#ff6b86]">{eyebrow}</p>
            {badge}
          </div>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.035em] sm:text-4xl">{title}</h1>
          {subtitle ? <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-[var(--business-soft)]">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

export function BusinessKpiGrid({ children }: { children: ReactNode }) {
  return <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{children}</section>;
}

export function BusinessKpiCard({ label, value, helper }: { label: string; value: ReactNode; helper?: ReactNode }) {
  return (
    <article className="rounded-2xl border border-[var(--business-border)] bg-[var(--business-panel)] p-5">
      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--business-muted)]">{label}</p>
      <div className="mt-2 text-2xl font-black">{value}</div>
      {helper ? <p className="mt-1 text-xs font-semibold text-[var(--business-muted)]">{helper}</p> : null}
    </article>
  );
}

export function BusinessStatusBadge({ children, tone = "muted" }: { children: ReactNode; tone?: "green" | "amber" | "red" | "blue" | "muted" }) {
  const classes = {
    green: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
    amber: "border-amber-400/25 bg-amber-400/10 text-amber-300",
    red: "border-rose-400/25 bg-rose-400/10 text-rose-300",
    blue: "border-sky-400/25 bg-sky-400/10 text-sky-300",
    muted: "border-[var(--business-border)] bg-[var(--business-panel-strong)] text-[var(--business-soft)]",
  } as const;
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black ${classes[tone]}`}>{children}</span>;
}

export function BusinessActionButton({ href, children, variant = "secondary" }: { href: string; children: ReactNode; variant?: "primary" | "secondary" }) {
  return (
    <Link
      href={href}
      className={variant === "primary"
        ? "inline-flex min-h-10 items-center justify-center rounded-xl bg-[#e1062a] px-4 py-2 text-sm font-black text-white shadow-lg shadow-black/20 transition hover:bg-[#ff173d]"
        : "inline-flex min-h-10 items-center justify-center rounded-xl border border-[var(--business-border)] bg-[var(--business-panel-strong)] px-4 py-2 text-sm font-black text-[var(--business-text)] transition hover:border-[#ff2142]/35"}
    >
      {children}
    </Link>
  );
}
