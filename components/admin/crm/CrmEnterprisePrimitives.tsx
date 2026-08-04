import Link from "next/link";

export function CrmSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-white/10 bg-[#121216] p-4"><div className="mb-4"><h2 className="text-lg font-black text-white">{title}</h2>{description ? <p className="mt-1 text-sm text-zinc-400">{description}</p> : null}</div>{children}</section>;
}

export function CrmStatusBadge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "green" | "amber" | "red" | "blue" | "rose" }) {
  const tones = { neutral: "border-zinc-500/30 bg-zinc-500/10 text-zinc-200", green: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200", amber: "border-amber-400/30 bg-amber-500/10 text-amber-200", red: "border-red-400/30 bg-red-500/10 text-red-200", blue: "border-blue-400/30 bg-blue-500/10 text-blue-200", rose: "border-rose-400/30 bg-rose-500/10 text-rose-100" };
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${tones[tone]}`}>{children}</span>;
}

export function CrmEmptyState({ title, body, href, action }: { title: string; body: string; href?: string; action?: string }) {
  return <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.03] p-6 text-center"><h3 className="font-black text-white">{title}</h3><p className="mx-auto mt-2 max-w-xl text-sm text-zinc-400">{body}</p>{href && action ? <Link href={href} className="mt-4 inline-flex rounded-xl bg-[#ec0b5b] px-4 py-2 text-sm font-bold text-white">{action}</Link> : null}</div>;
}
