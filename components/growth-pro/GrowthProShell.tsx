import Link from "next/link";

export function GrowthProShell({ title, eyebrow = "TheOutHaven Essentials+", children, demoMode = false, returnHref }: { title: string; eyebrow?: string; children: React.ReactNode; demoMode?: boolean; locationId?: string; locationType?: string; fromDemoCenter?: boolean; returnHref?: string; navHrefBuilder?: (href: string) => string }) {
  return (
    <main className="business-growth-shell min-h-screen bg-[var(--business-bg)] px-4 py-6 text-[var(--business-text)] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1440px]">
        <div className="flex flex-col gap-3 border-b border-[var(--business-border)] pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#e1062a]">{eyebrow}</p>
            <h1 className="mt-2 text-3xl font-bold tracking-[-0.025em]">{title}</h1>
          </div>
          {returnHref ? (
            <Link href={returnHref} className="rounded-lg border border-[var(--business-border)] bg-[var(--business-panel)] px-3 py-2 text-xs font-bold text-[var(--business-soft)] hover:border-[var(--toh-brand-border)]">
              Back to Demo Center
            </Link>
          ) : null}
        </div>
        <p className="mt-2 max-w-3xl text-[var(--business-muted)]">Get discovered. Capture customers. Promote smarter. Respond faster. Track results.</p>
        {demoMode ? (
          <div className="business-ui-alert is-warning mt-5 text-sm font-semibold">
            Demo Mode — acting as the demo location. Admin-only context is isolated from production owner accounts and billing actions are disabled.
          </div>
        ) : null}
        <section className="mt-5">{children}</section>
      </div>
    </main>
  );
}
