import Link from "next/link";

export function GrowthProShell({ title, eyebrow = "TheOutHaven Growth Pro", children, demoMode = false, returnHref }: { title: string; eyebrow?: string; children: React.ReactNode; demoMode?: boolean; locationId?: string; locationType?: string; fromDemoCenter?: boolean; returnHref?: string; navHrefBuilder?: (href: string) => string }) {
  return (
    <main className="min-h-screen bg-[#090607] px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-rose-200">{eyebrow}</p>
            <h1 className="mt-3 text-4xl font-black">{title}</h1>
          </div>
          {returnHref ? (
            <Link href={returnHref} className="rounded-full border border-white/10 px-4 py-2 text-xs font-black text-white/70 hover:border-rose-300/50">
              Back to Demo Center
            </Link>
          ) : null}
        </div>
        <p className="mt-2 max-w-3xl text-white/60">Get discovered. Capture customers. Promote smarter. Respond faster. Track results.</p>
        {demoMode ? (
          <div className="mt-5 rounded-3xl border border-rose-300/25 bg-rose-500/10 p-4 text-sm font-bold text-rose-50">
            Demo Mode — acting as the demo location. Admin-only context is isolated from production owner accounts and billing actions are disabled.
          </div>
        ) : null}
        <section className="mt-6">{children}</section>
      </div>
    </main>
  );
}
