import type { Metadata } from "next";
import Link from "next/link";
import PrelaunchSearchPreview from "@/components/launch/PrelaunchSearchPreview";
import BetaLaunchHeader from "@/components/BetaLaunchHeader";
import RecoveryRedirect from "@/components/RecoveryRedirect";
import PrelaunchAccessForm from "@/components/launch/PrelaunchAccessForm";
import { buildMetadata } from "@/lib/seo";

export const revalidate = 300;

export const metadata: Metadata = buildMetadata({
  title: "Stop searching 10 tabs.",
  description: "Plan dinner, activities, nightlife, and nearby experiences in one TheOutHaven outing across NYC and Long Island.",
  path: "/",
});

const occasions = ["Date night", "Girls’ night", "Birthday", "Family outing", "Last-minute plans", "Group night out"];
const areas = ["Queens", "Brooklyn", "Manhattan", "Bronx", "Staten Island", "Long Island"];

export default function HomePage() {
  return (
    <main className="min-h-dvh bg-[#050505] text-white">
      <RecoveryRedirect />
      <BetaLaunchHeader />
      <section className="mx-auto grid max-w-7xl gap-10 px-5 pb-14 pt-10 sm:px-6 lg:grid-cols-[1fr_.88fr] lg:px-8 lg:py-16">
        <div>
          <p className="inline-flex rounded-full border border-[#e1062a]/50 bg-[#e1062a]/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-red-100">NYC + Long Island prelaunch</p>
          <h1 className="mt-7 max-w-3xl text-5xl font-black leading-[.92] tracking-[-.055em] sm:text-6xl lg:text-7xl">Stop searching 10 tabs.</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-white/68">Tell TheOutHaven the kind of night you want. We’ll help match dinner, activities, nightlife, and nearby experiences into one plan.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a href="#homepage-preview" data-analytics="homepage_plan_outing_click" className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#e1062a] px-7 text-sm font-black text-white hover:bg-red-500 whitespace-nowrap">Try TheOutHaven</a>
            <a href="#prelaunch" data-analytics="homepage_prelaunch_click" className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/15 bg-white/[.06] px-7 text-sm font-black text-white/80 hover:bg-white hover:text-black">Get prelaunch access</a>
          </div>
          <PrelaunchSearchPreview />
        </div>
        <ExamplePair />
      </section>
      <section className="mx-auto max-w-7xl px-5 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-4 md:grid-cols-3">
          {["Describe your outing", "Review your matches", "Build your plan"].map((step, i) => <article key={step} className="rounded-[1.5rem] border border-white/10 bg-white/[.04] p-6"><span className="text-sm font-black text-[#ff8a9b]">0{i+1}</span><h2 className="mt-4 text-xl font-black">{step}</h2></article>)}
        </div>
      </section>
      <section className="mx-auto grid max-w-7xl gap-8 px-5 py-10 sm:px-6 lg:grid-cols-2 lg:px-8">
        <ChipSection title="Occasion shortcuts" items={occasions} />
        <ChipSection title="Launch areas" items={areas} />
      </section>
      <section id="prelaunch" className="mx-auto grid max-w-7xl gap-8 px-5 py-12 sm:px-6 lg:grid-cols-2 lg:px-8">
        <div><p className="text-xs font-black uppercase tracking-[.22em] text-[#e1062a]">Prelaunch access</p><h2 className="mt-3 text-3xl font-black">TheOutHaven is preparing for launch.</h2><p className="mt-4 text-white/62">Request early access. Launch coverage begins in NYC and Long Island.</p></div>
        <PrelaunchAccessForm />
      </section>
      <section className="mx-auto max-w-7xl px-5 pb-16 sm:px-6 lg:px-8"><div className="rounded-[1.75rem] border border-white/10 bg-[#120606] p-8"><h2 className="text-2xl font-black">For restaurants, activities, nightlife, and experience businesses</h2><p className="mt-3 max-w-2xl text-white/62">Claim your listing so planners can find accurate details, photos, menus, reservations, and ways to plan around your location.</p><Link href="/business" className="mt-6 inline-flex rounded-full border border-white/15 px-6 py-3 text-sm font-black">For Businesses</Link></div></section>
    </main>
  );
}

function ExamplePair() { return <aside className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(225,6,42,.22),transparent_36%),rgba(255,255,255,.045)] p-5 shadow-2xl shadow-black/40"><p className="text-xs font-black uppercase tracking-[.22em] text-[#ff8a9b]">Example result</p><div className="mt-5 space-y-3"><div className="rounded-[1.25rem] bg-black/35 p-4"><p className="text-sm text-white/50">Restaurant · Astoria</p><h2 className="mt-1 text-xl font-black">Seafood dinner</h2></div><div className="rounded-[1.25rem] bg-black/35 p-4"><p className="text-sm text-white/50">Nightlife · Astoria</p><h2 className="mt-1 text-xl font-black">Rooftop drinks</h2></div></div><p className="mt-5 text-sm leading-6 text-white/62">About a 12-minute walk. Matches because both stops fit a relaxed dinner-plus-drinks plan in the same neighborhood.</p></aside>; }
function ChipSection({ title, items }: { title: string; items: string[] }) { return <section className="rounded-[1.5rem] border border-white/10 bg-white/[.035] p-6"><h2 className="text-xl font-black">{title}</h2><div className="mt-4 flex flex-wrap gap-2">{items.map((item) => <a key={item} href="#homepage-preview" className="rounded-full border border-white/12 px-4 py-2 text-sm font-bold text-white/70 hover:border-[#e1062a]">{item}</a>)}</div></section>; }
