import Link from "next/link";
import type { ReactNode } from "react";

type MobileTone = "neutral" | "success" | "warning" | "danger" | "info";
type MobileStatus = "Saved" | "Completed" | "In progress" | "Pending" | "Confirmed" | "Needs action" | "Available" | "Closed";

const statusTone: Record<MobileStatus, MobileTone> = {
  Saved: "success",
  Completed: "success",
  "In progress": "info",
  Pending: "warning",
  Confirmed: "success",
  "Needs action": "danger",
  Available: "info",
  Closed: "neutral",
};

export function MobilePageShell({
  children,
  className = "",
  title,
  subtitle,
  rightAction,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  rightAction?: ReactNode;
}) {
  return (
    <main className={`toh-mobile-page min-h-screen w-full overflow-x-hidden bg-[#050505] text-white ${className}`}>
      {(title || subtitle || rightAction) ? (
        <div className="mx-auto flex w-full max-w-7xl items-start justify-between gap-3 px-3 pt-4 sm:px-6 lg:px-8">
          <div className="min-w-0">
            {title ? <h1 className="text-xl font-black tracking-[-0.03em] text-white sm:text-2xl">{title}</h1> : null}
            {subtitle ? <p className="mt-1 text-sm font-semibold leading-5 text-white/58">{subtitle}</p> : null}
          </div>
          {rightAction ? <div className="shrink-0">{rightAction}</div> : null}
        </div>
      ) : null}
      {children}
    </main>
  );
}

export function MobileTopBar({ title, backHref, action, className = "" }: { title: string; backHref?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={`sticky top-0 z-40 border-b border-white/10 bg-[#050505]/88 px-3 py-2 backdrop-blur-xl sm:px-6 ${className}`}>
      <div className="mx-auto flex min-h-11 max-w-7xl items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {backHref ? <Link href={backHref} className="toh-touch-target inline-flex items-center rounded-full border border-white/10 px-3 text-sm font-black text-white/80">←</Link> : null}
          <p className="truncate text-sm font-black uppercase tracking-[0.12em] text-white/82">{title}</p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}

export function MobileStickyActionBar({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <MobileActionBar className={className}>{children}</MobileActionBar>;
}

export function MobileActionBar({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`toh-mobile-sticky fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-black/90 shadow-[0_-18px_45px_rgba(0,0,0,0.45)] backdrop-blur-xl ${className}`}>
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-6">{children}</div>
    </div>
  );
}

export function MobileStatusBadge({ status }: { status: MobileStatus }) {
  return <CompactStatusBadge tone={statusTone[status]}>{status}</CompactStatusBadge>;
}

export function CompactStatusBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: MobileTone }) {
  const tones = {
    neutral: "border-white/10 bg-white/[0.06] text-white/70",
    success: "border-emerald-400/25 bg-emerald-400/10 text-emerald-100",
    warning: "border-amber-300/25 bg-amber-400/10 text-amber-100",
    danger: "border-red-300/25 bg-red-500/10 text-red-100",
    info: "border-sky-300/25 bg-sky-500/10 text-sky-100",
  };
  return <span className={`inline-flex min-h-7 items-center rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${tones[tone]}`}>{children}</span>;
}

export function MobileMetricStrip({ metrics }: { metrics: Array<{ label: string; value: ReactNode; helper?: string }> }) {
  return <div className="toh-mobile-scroll-chips -mx-1 px-1 sm:grid sm:grid-cols-3 sm:overflow-visible">{metrics.map((m) => <div key={m.label} className="min-w-[132px] rounded-2xl border border-white/10 bg-white/[0.045] p-3"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40">{m.label}</p><div className="mt-1 text-lg font-black text-white">{m.value}</div>{m.helper ? <p className="mt-1 text-xs font-semibold text-white/45">{m.helper}</p> : null}</div>)}</div>;
}

export function MobileSectionCard({ title, description, badge, children, action, className = "" }: { title: string; description?: string; badge?: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  return <section className={`rounded-[1.35rem] border border-white/10 bg-white/[0.045] p-4 shadow-xl shadow-black/20 ${className}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="text-base font-black tracking-[-0.02em] text-white">{title}</h2>{description ? <p className="mt-1 text-sm font-semibold leading-5 text-white/55">{description}</p> : null}</div>{badge ? <div className="shrink-0">{badge}</div> : null}</div>{children ? <div className="mt-4">{children}</div> : null}{action ? <div className="mt-4">{action}</div> : null}</section>;
}

export function MobileResultCard({ title, meta, description, badge, action, thumbnail }: { title: string; meta?: string; description?: string; badge?: ReactNode; action?: ReactNode; thumbnail?: ReactNode }) {
  return <article className="flex min-w-0 gap-3 rounded-[1.25rem] border border-white/10 bg-white/[0.045] p-3"><div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-white/[0.06]">{thumbnail}</div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><h3 className="truncate text-sm font-black text-white">{title}</h3>{badge}</div>{meta ? <p className="mt-1 line-clamp-1 text-xs font-bold text-white/48">{meta}</p> : null}{description ? <p className="mt-2 line-clamp-2 text-xs font-semibold leading-5 text-white/62">{description}</p> : null}{action ? <div className="mt-3">{action}</div> : null}</div></article>;
}

export function MobileEmptyState({ title, message, action }: { title: string; message: string; action?: ReactNode }) {
  return <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5 text-center shadow-xl shadow-black/20 sm:p-8"><h2 className="text-2xl font-black tracking-[-0.03em] text-white">{title}</h2><p className="mx-auto mt-2 max-w-xl text-sm font-semibold leading-6 text-white/58">{message}</p>{action ? <div className="mt-5">{action}</div> : null}</section>;
}

export function MobileErrorState({ title = "Something went wrong", message, action }: { title?: string; message: string; action?: ReactNode }) {
  return <MobileSectionCard title={title} description={message} badge={<MobileStatusBadge status="Needs action" />} action={action} className="border-red-300/20 bg-red-500/10" />;
}

export const EmptyState = MobileEmptyState;
