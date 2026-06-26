import type { ReactNode } from "react";

export function MobilePageShell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <main className={`rose-mobile-page min-h-screen w-full overflow-x-hidden bg-black text-white ${className}`}>{children}</main>;
}

export function MobileStickyActionBar({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rose-mobile-sticky fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-black/90 shadow-[0_-18px_45px_rgba(0,0,0,0.45)] backdrop-blur-xl ${className}`}>
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-6">{children}</div>
    </div>
  );
}

export function CompactStatusBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "warning" | "danger" | "info" }) {
  const tones = {
    neutral: "border-white/10 bg-white/[0.06] text-white/70",
    success: "border-emerald-400/25 bg-emerald-400/10 text-emerald-100",
    warning: "border-amber-300/25 bg-amber-400/10 text-amber-100",
    danger: "border-rose-300/25 bg-rose-500/10 text-rose-100",
    info: "border-sky-300/25 bg-sky-500/10 text-sky-100",
  };
  return <span className={`inline-flex min-h-7 items-center rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${tones[tone]}`}>{children}</span>;
}

export function EmptyState({ title, message, action }: { title: string; message: string; action?: ReactNode }) {
  return <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5 text-center shadow-xl shadow-black/20 sm:p-8"><h2 className="text-2xl font-black tracking-[-0.03em] text-white">{title}</h2><p className="mx-auto mt-2 max-w-xl text-sm font-semibold leading-6 text-white/58">{message}</p>{action ? <div className="mt-5">{action}</div> : null}</section>;
}
