import Link from "next/link";
import BetaLaunchHeader from "@/components/BetaLaunchHeader";
export const metadata = { title: "TheOutHaven Beta" };
const groups = ["User beta testers", "Business/location beta testers", "Ambassador beta testers", "Experience team testers"];
const tests = ["Search quality", "Search speed", "Real user prompts", "Missing photos", "Location accuracy", "Plan creation", "Reservations", "Business claims", "QR codes", "Mobile experience"];
export default function BetaPage() {
  return <main className="min-h-screen bg-[#090706] text-white"><BetaLaunchHeader /><div className="mx-auto max-w-6xl space-y-8 px-4 py-10">
    <section id="launch-list" className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,.2),transparent_32%),linear-gradient(135deg,#170b0b,#090706_60%,#151010)] p-8 md:p-12">
      <p className="text-xs font-black uppercase tracking-[0.35em] text-rose-200">TheOutHaven Beta</p><h1 className="mt-4 max-w-3xl text-4xl font-black tracking-tight md:text-6xl">Help shape TheOutHaven before launch</h1>
      <p className="mt-5 max-w-3xl text-lg leading-8 text-white/70">Beta testers help test curated restaurants, activities, planning, reservations, claims, location pages, search quality, search speed, and real user prompts.</p>
      <Link href="/beta/apply" className="mt-8 inline-flex rounded-full bg-rose-600 px-6 py-3 text-sm font-black text-white shadow-lg shadow-rose-950/30">Apply to become a beta tester</Link>
    </section>
    <section className="grid gap-4 md:grid-cols-2"><div className="rounded-3xl border border-white/10 bg-white/[.04] p-6"><h2 className="text-2xl font-black">Tester groups</h2><div className="mt-4 grid gap-3">{groups.map(g=><div key={g} className="rounded-2xl border border-white/10 bg-black/20 p-4 text-white/75">{g}</div>)}</div></div><div className="rounded-3xl border border-white/10 bg-white/[.04] p-6"><h2 className="text-2xl font-black">What we test</h2><div className="mt-4 flex flex-wrap gap-2">{tests.map(t=><span key={t} className="rounded-full border border-rose-300/20 bg-rose-500/10 px-3 py-1 text-sm text-rose-100">{t}</span>)}</div></div></section>
  </div></main>;
}
