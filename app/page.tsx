import type { Metadata } from "next";
import Link from "next/link";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";
import RecoveryRedirect from "@/components/RecoveryRedirect";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "TheOutHaven | Plan Better OUTings",
  description: "Discover restaurants, nightlife, experiences, and curated outing ideas personalized around your vibe, budget, and location.",
  alternates: { canonical: "https://www.theouthaven.com" },
  openGraph: {
    title: "TheOutHaven | Plan Better OUTings",
    description: "Discover restaurants, nightlife, experiences, and curated outing ideas personalized around your vibe, budget, and location.",
    url: "https://www.theouthaven.com",
    siteName: "TheOutHaven",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "TheOutHaven | Plan Better OUTings",
    description: "Discover restaurants, nightlife, experiences, and curated outing ideas personalized around your vibe, budget, and location.",
  },
};

const cards = ["Date Night", "Rooftops", "Brunch", "Luxury", "Group Outings"];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#070303] text-white">
      <RecoveryRedirect />
      <TheOutHavenHeader />

      <section className="relative overflow-hidden px-5 pb-20 pt-32 sm:px-6 lg:pt-40">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_20%,rgba(225,6,42,0.28),transparent_36%),radial-gradient(circle_at_85%_0%,rgba(255,255,255,.1),transparent_24%),linear-gradient(150deg,#080303_0%,#160807_50%,#080303_100%)]" />
        <div className="mx-auto max-w-7xl space-y-8">
          <h1 className="max-w-4xl text-5xl font-black tracking-tight sm:text-7xl">Plan better OUTings.</h1>
          <p className="max-w-3xl text-lg text-white/70">Discover restaurants, nightlife, experiences, and curated outing ideas personalized around your vibe, budget, and location.</p>
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-3 shadow-2xl backdrop-blur">
            <input className="w-full rounded-2xl bg-black/40 px-5 py-4 text-sm outline-none placeholder:text-white/45" placeholder="Search restaurants, date nights, rooftops, brunch spots, activities..." />
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/create" className="rounded-full bg-[#e1062a] px-7 py-3 text-sm font-black hover:bg-red-500">Create an Outing</Link>
            <Link href="/explore" className="rounded-full border border-white/15 bg-white/[0.04] px-7 py-3 text-sm font-black">Explore Places</Link>
          </div>
        </div>
      </section>

      <Section title="Trending Right Now" subtitle="Trending Restaurants · Trending Activities">
        <CardGrid />
      </Section>

      {cards.map((section) => (
        <Section key={section} title={section} subtitle="Hand-picked experiences curated for your vibe.">
          <div className="grid gap-4 md:grid-cols-3">
            {[1, 2, 3].map((i) => <PlaceCard key={`${section}-${i}`} name={`${section} Pick ${i}`} />)}
          </div>
          <Link href="/explore" className="mt-4 inline-block text-sm font-bold text-red-200 hover:text-white">View More →</Link>
        </Section>
      ))}

      <section className="px-5 py-10 sm:px-6"><div className="mx-auto max-w-7xl rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_20%_20%,rgba(225,6,42,.26),transparent_38%),#120907] p-8"><h2 className="text-3xl font-black">Let AI plan your next outing.</h2><p className="mt-3 max-w-3xl text-white/70">Tell TheOutHaven what kind of experience you want and get personalized restaurant and activity recommendations.</p><div className="mt-5 flex flex-wrap gap-3"><Link href="/create" className="rounded-full bg-[#e1062a] px-6 py-3 text-sm font-black">Start Planning</Link><Link href="/explore" className="rounded-full border border-white/15 bg-white/[0.04] px-6 py-3 text-sm font-black">Explore Experiences</Link></div></div></section>

      <section className="px-5 py-10 sm:px-6"><div className="mx-auto max-w-7xl rounded-[2rem] border border-white/10 bg-white/[0.03] p-8 shadow-2xl"><h2 className="text-3xl font-black">Own or manage a location?</h2><p className="mt-3 max-w-3xl text-white/70">Claim your business, manage reservations, grow visibility, and connect with more customers through TheOutHaven.</p><div className="mt-5 flex flex-wrap gap-3"><Link href="/location/apply" className="rounded-full bg-[#e1062a] px-6 py-3 text-sm font-black">Claim Your Business</Link><Link href="/business" className="rounded-full border border-white/15 bg-white/[0.04] px-6 py-3 text-sm font-black">Learn More</Link></div></div></section>

      <PublicFooter />
    </main>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <section className="px-5 py-10 sm:px-6"><div className="mx-auto max-w-7xl"><h2 className="text-3xl font-black">{title}</h2><p className="mt-2 text-sm text-white/65">{subtitle}</p><div className="mt-6">{children}</div></div></section>;
}

function CardGrid() { return <div className="grid gap-4 md:grid-cols-2">{["Trending Restaurants", "Trending Activities"].map((s) => <div key={s}><h3 className="mb-3 text-sm font-black uppercase tracking-[0.2em] text-red-200">{s}</h3><div className="grid gap-4 sm:grid-cols-2">{[1,2,3,4].map((i)=><PlaceCard key={`${s}-${i}`} name={`${s.slice(9)} Spot ${i}`} />)}</div></div>)}</div>; }

function PlaceCard({ name }: { name: string }) { return <article className="group rounded-3xl border border-white/10 bg-white/[0.04] p-3 transition hover:-translate-y-1 hover:border-[#e1062a]/45"><div className="h-36 rounded-2xl bg-gradient-to-br from-white/10 to-[#e1062a]/20" /><h4 className="mt-3 font-black">{name}</h4><p className="text-sm text-white/65">New York · 4.7 ★</p><p className="mt-1 text-xs text-red-200">Rooftop · Romantic · Brunch</p><Link href="/explore" className="mt-3 inline-block text-xs font-black text-white/80 group-hover:text-white">Explore →</Link></article>; }

function PublicFooter() { const links = [["Home","/"],["Explore","/explore"],["Create Outing","/create"],["Business","/business"],["Sign In","/signup"],["Terms","/terms"],["Privacy","/privacy"],["SMS Terms","/sms-terms"],["Contact","/contact"]] as const; return <footer className="mt-12 border-t border-white/10 bg-black/50 px-5 py-10 sm:px-6"><div className="mx-auto max-w-7xl"><div className="flex flex-wrap gap-4 text-sm text-white/70">{links.map(([label,href])=><Link key={label} href={href} className="hover:text-white">{label}</Link>)}</div><div className="mt-5 flex gap-3 text-white/55"><span>◎</span><span>◉</span><span>◌</span></div><p className="mt-4 text-xs text-white/45">© {new Date().getFullYear()} TheOutHaven. All rights reserved.</p></div></footer>; }
