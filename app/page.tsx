import type { Metadata } from "next";
import Link from "next/link";

import LiveOutingSearch from "@/components/LiveOutingSearch";
import RecoveryRedirect from "@/components/RecoveryRedirect";
import TheOutHavenFooter from "@/components/TheOutHavenFooter";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";
import { buildMetadata } from "@/lib/seo";

export const revalidate = 300;

export const metadata: Metadata = buildMetadata({
  title: "Plan better outings across NYC + Long Island",
  description:
    "Use TheOutHaven to plan restaurants, activities, nightlife, and nearby experiences in one outing across NYC and Long Island.",
  path: "/",
});

const occasions = [
  "Date night",
  "Girls’ night",
  "Birthday",
  "Family outing",
  "Last-minute plans",
  "Group night out",
];

const areas = [
  "Queens",
  "Brooklyn",
  "Manhattan",
  "Bronx",
  "Staten Island",
  "Long Island",
];

export default function HomePage() {
  return (
    <main className="min-h-dvh overflow-x-hidden bg-[#050505] text-white">
      <RecoveryRedirect />
      <TheOutHavenHeader />

      <section className="relative border-b border-white/5 bg-[radial-gradient(circle_at_top,rgba(225,6,42,0.14),transparent_34%),linear-gradient(180deg,#050505_0%,#080606_100%)] pt-20">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-5 pb-14 pt-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(340px,.88fr)] lg:px-8 lg:py-16">
          <div className="min-w-0">
            <p className="inline-flex rounded-full border border-[#e1062a]/50 bg-[#e1062a]/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-red-100">
              AI-powered outing planning · NYC + Long Island
            </p>

            <h1 className="mt-7 max-w-3xl text-5xl font-black leading-[.92] tracking-[-.055em] sm:text-6xl lg:text-7xl">
              Stop searching 10 tabs.
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/68">
              Tell TheOutHaven the kind of outing you want. We’ll help match
              restaurants, activities, nightlife, and nearby experiences into
              one plan you can actually use.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href="#live-product"
                data-analytics="homepage_plan_outing_click"
                className="inline-flex min-h-12 items-center justify-center whitespace-nowrap rounded-full bg-[#e1062a] px-7 text-sm font-black text-white shadow-lg shadow-red-950/30 transition hover:bg-[#ff1744] focus:outline-none focus:ring-2 focus:ring-[#e1062a]/60 focus:ring-offset-2 focus:ring-offset-black"
              >
                Plan an Outing
              </a>

              <Link
                href="/explore"
                className="inline-flex min-h-12 items-center justify-center whitespace-nowrap rounded-full border border-white/15 bg-white/[.06] px-7 text-sm font-black text-white/80 transition hover:bg-white hover:text-black focus:outline-none focus:ring-2 focus:ring-white/40 focus:ring-offset-2 focus:ring-offset-black"
              >
                Explore Places
              </Link>
            </div>
          </div>

          <ProductProof />

          <div className="min-w-0 lg:col-span-2">
            <LiveOutingSearch />
          </div>
        </div>
      </section>

      <section id="how-it-works" className="mx-auto w-full max-w-7xl px-5 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ["Describe your outing", "Tell us the food, activity, neighborhood, vibe, budget, or timing you have in mind."],
            ["Review live matches", "See real restaurants and activities ranked around the outing you described."],
            ["Build your plan", "Open location profiles, compare options, choose a plan, and continue to the next action."],
          ].map(([step, text], index) => (
            <article
              key={step}
              className="rounded-[1.5rem] border border-white/10 bg-white/[.04] p-6"
            >
              <span className="text-sm font-black text-[#ff8a9b]">
                0{index + 1}
              </span>
              <h2 className="mt-4 text-xl font-black">{step}</h2>
              <p className="mt-3 text-sm leading-6 text-white/55">{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-10 sm:px-6 lg:grid-cols-2 lg:px-8">
        <ChipSection title="Plan by occasion" items={occasions} />
        <ChipSection title="Explore by area" items={areas} />
      </section>

      <section className="mx-auto w-full max-w-7xl px-5 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-5 rounded-[2rem] border border-white/10 bg-[#0b0b0b] p-7 md:grid-cols-[1.25fr_.75fr] md:items-center md:p-9">
          <div>
            <p className="text-xs font-black uppercase tracking-[.22em] text-[#e1062a]">
              Explore the live directory
            </p>
            <h2 className="mt-3 text-3xl font-black">
              Browse real places before you plan.
            </h2>
            <p className="mt-4 max-w-2xl text-white/60">
              Explore restaurants, activities, nightlife, and experiences across
              the current TheOutHaven coverage area. No account is required to
              browse public listings.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row md:justify-end">
            <Link
              href="/explore"
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-white px-6 text-sm font-black text-black transition hover:bg-white/85"
            >
              Explore TheOutHaven
            </Link>
            <Link
              href="/about"
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/15 px-6 text-sm font-black text-white transition hover:bg-white hover:text-black"
            >
              About Us
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-5 pb-16 sm:px-6 lg:px-8">
        <div className="rounded-[1.75rem] border border-white/10 bg-[#120606] p-8">
          <h2 className="text-2xl font-black">
            For restaurants, activities, nightlife, and experience businesses
          </h2>

          <p className="mt-3 max-w-2xl text-white/62">
            Claim your listing so planners can find accurate details, photos,
            menus, reservations, and ways to plan around your location.
          </p>

          <Link
            href="/business"
            className="mt-6 inline-flex rounded-full border border-white/15 px-6 py-3 text-sm font-black transition hover:border-[#e1062a]/50 hover:bg-[#e1062a]/10"
          >
            For Businesses
          </Link>
        </div>
      </section>

      <TheOutHavenFooter />
    </main>
  );
}

function ProductProof() {
  return (
    <aside className="min-w-0 rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(225,6,42,.22),transparent_36%),rgba(255,255,255,.045)] p-5 shadow-2xl shadow-black/40">
      <p className="text-xs font-black uppercase tracking-[.22em] text-[#ff8a9b]">
        What you can do now
      </p>

      <div className="mt-5 space-y-3">
        {[
          ["Search", "Describe a complete outing in plain English."],
          ["Explore", "Browse public restaurant and activity profiles."],
          ["Plan", "Compare matches and choose the stops that fit."],
        ].map(([title, text]) => (
          <div key={title} className="rounded-[1.25rem] bg-black/35 p-4">
            <p className="text-sm font-black text-white">{title}</p>
            <p className="mt-1 text-sm leading-6 text-white/55">{text}</p>
          </div>
        ))}
      </div>

      <p className="mt-5 text-sm leading-6 text-white/62">
        The public planner and directory are live and can be used without a
        reviewer signing into a private dashboard.
      </p>
    </aside>
  );
}

function ChipSection({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-white/[.035] p-6">
      <h2 className="text-xl font-black">{title}</h2>

      <div className="mt-4 flex flex-wrap gap-2">
        {items.map((item) => (
          <Link
            key={item}
            href={`/create?prompt=${encodeURIComponent(item)}`}
            className="rounded-full border border-white/12 px-4 py-2 text-sm font-bold text-white/70 transition hover:border-[#e1062a] hover:text-white"
          >
            {item}
          </Link>
        ))}
      </div>
    </section>
  );
}
