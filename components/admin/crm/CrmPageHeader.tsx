import Link from "next/link";

export default function CrmPageHeader({ eyebrow, title, description, actionHref, actionLabel }: { eyebrow?: string; title: string; description?: string; actionHref?: string; actionLabel?: string }) {
  return (
    <header className="rounded-2xl border border-white/10 bg-[#121216] p-4 shadow-xl shadow-black/20 sm:p-5">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          {eyebrow ? <p className="text-xs font-bold uppercase tracking-wide text-[#ec0b5b]">{eyebrow}</p> : null}
          <h1 className="mt-1 truncate text-2xl font-black tracking-tight text-white sm:text-3xl">{title}</h1>
          {description ? <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-400">{description}</p> : null}
        </div>
        {actionHref && actionLabel ? <Link href={actionHref} className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl bg-[#ec0b5b] px-4 text-sm font-bold text-white hover:bg-[#ff206e]">{actionLabel}</Link> : null}
      </div>
    </header>
  );
}
