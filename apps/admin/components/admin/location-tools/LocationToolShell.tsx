import Link from "next/link";
import type { ReactNode } from "react";

type Stat = { label: string; value: string | number; tone?: "rose" | "emerald" | "amber" | "white" };

export function LocationToolShell({ title, eyebrow = "Location Tools", description, stats = [], children }: { title: string; eyebrow?: string; description: string; stats?: Stat[]; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-[#080407] px-4 pb-12 pt-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <Link href="/admin/dashboard/settings/location-tools" className="inline-flex rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-black text-rose-100 hover:bg-white/10">← Location Tools</Link>
        <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(236,11,91,.22),transparent_34%),#0d0d0f] p-6 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.32em] text-rose-200">{eyebrow}</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight">{title}</h1>
          <p className="mt-3 max-w-3xl text-sm font-bold leading-6 text-white/60">{description}</p>
          {stats.length ? <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{stats.map((stat) => <div key={stat.label} className="rounded-2xl border border-white/10 bg-black/30 p-4"><p className="text-xs font-black uppercase tracking-widest text-white/40">{stat.label}</p><p className={`mt-2 text-2xl font-black ${stat.tone === "emerald" ? "text-emerald-200" : stat.tone === "amber" ? "text-amber-200" : stat.tone === "rose" ? "text-rose-200" : "text-white"}`}>{stat.value}</p></div>)}</div> : null}
        </section>
        {children}
      </div>
    </main>
  );
}

export function ToolCard({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <section className="rounded-[2rem] border border-white/10 bg-[#111] p-5 shadow-xl"><h2 className="text-xl font-black">{title}</h2>{description ? <p className="mt-2 text-sm font-bold leading-6 text-white/55">{description}</p> : null}<div className="mt-5">{children}</div></section>;
}
