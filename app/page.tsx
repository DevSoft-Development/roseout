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
    "Plan restaurants, activities, nightlife, and memorable outings across New York City and Long Island with TheOutHaven.",
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

const experiences = [
  ["Dinner worth leaving home for", "From neighborhood favorites to special-occasion tables."],
  ["Something to do next", "Comedy, karaoke, bowling, museums, games, nightlife, and more."],
  ["Plans that fit the moment", "Shape the outing around the occasion, area, timing, and mood."],
];

export default function HomePage() {
  return (
    <main className="min-h-dvh overflow-x-hidden bg-[#050505] text-white">
      <RecoveryRedirect />
      <TheOutHavenHeader />

      <section className="relative overflow-hidden border-b border-white/5 pt-20">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(225,6,42,0.2),transparent_30%),radial-gradient(circle_at_85%_35%,rgba(225,6,42,0.1),transparent_25%),linear-gradient(180deg,#050505_0%,#090606_70%,#050505_100%)]" />
        <div className="absolute inset-x-0 top-20 h-px bg-gradient-to-r from-transparent via-[#e1062a]/45 to-transparent" />

        <div className="relative mx-auto grid w-full max-w-7xl gap-12 px-5 pb-16 pt-14 sm:px-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,.75fr)] lg:items-center lg:px-8 lg:pb-20 lg:pt-20">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#ff8a9b]">
              New York City + Long Island
            </p>

            <h1 className="mt-6 max-w-4xl text-5xl font-black leading-[.94] tracking-[-.06em] sm:text-6xl lg:text-[5.4rem]">
              Plan the whole outing.
              <span className="block text-[#e1062a]">In one place.</span>
            </h1>

            <p className="mt-7 max-w-2xl text-lg leading-8 text-white/66 sm:text-xl sm:leading-9">
              TheOutHaven brings restaurants, activities, nightlife, and local experiences together around the kind of day or night you actually want.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <a
                href="#plan-your-outing"
                data-analytics="homepage_plan_outing_click"
                className="inline-flex min-h-13 items-center justify-center whitespace-nowrap rounded-full bg-[#e1062a] px-8 py-4 text-sm font-black text-white shadow-2xl shadow-red-950/40 transition hover:bg-[#ff1744] focus:outline-none focus:ring-2 focus:ring-[#e1062a]/60 focus:ring-offset-2 focus:ring-offset-black"
              >
                Plan an Outing
              </a>

              <Link
                href="/explore"
                className="inline-flex min-h-13 items-center justify-center whitespace-nowrap rounded-full border border-white/15 bg-white/[.05] px-8 py-4 text-sm font-black text-white/85 transition hover:bg-white hover:text-black focus:outline-none focus:ring-2 focus:ring-white/40 focus:ring-offset-2 focus:ring-offset-black"
              >
                Explore Places
              </Link>
            </div>

            <div className="mt-10 grid max-w-2xl grid-cols-3 border-y border-white/10 py-5 text-sm">
              <div className="pr-4">
                <p className="font-black text-white">Eat</p>
                <p className="mt-1 text-white/40">Restaurants & drinks</p>
              </div>
              <div className="border-l border-white/10 px-4">
                <p className="font-black text-white">Do</p>
                <p className="mt-1 text-white/40">Activities & nightlife</p>
              </div>
              <div className="border-l border-white/10 pl-4">
                <p className="font-black text-white">Go</p>
                <p className="mt-1 text-white/40">Neighborhoods & areas</p>
              </div>
            </div>
          </div>

          <PremiumPreview />

          <div className="min-w-0 pt-4 lg:col-span-2 lg:pt-8">
            <LiveOutingSearch />
          </div>
        </div>
      </section>

      <section className="border-b border-white/10 bg-[#090909]">
        <div className="mx-auto grid w-full max-w-7xl gap-px bg-white/10 sm:grid-cols-3">
          {experiences.map(([title, text], index) => (
            <article key={title} className="bg-[#090909] px-6 py-8 sm:px-8">
              <p className="text-xs font-black tracking-[0.2em] text-[#e1062a]">0{index + 1}</p>
              <h2 className="mt-4 text-xl font-black tracking-[-0.02em]">{title}</h2>
              <p className="mt-3 text-sm leading-6 text-white/50">{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-white px-5 py-20 text-black sm:px-6 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-10 lg:grid-cols-[.8fr_1.2fr] lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-[#e1062a]">
                Made for real plans
              </p>
              <h2 className="mt-4 text-4xl font-black tracking-[-0.045em] sm:text-5xl">
                Less searching. More deciding.
              </h2>
            </div>
            <p className="max-w-2xl text-lg leading-8 text-black/58 lg:justify-self-end">
              TheOutHaven is built around the full outing, not a single stop. Start with the occasion, choose what fits, and keep the night moving without piecing everything together yourself.
            </p>
          </div>

          <div className="mt-14 grid gap-5 md:grid-cols-3">
            <LightFeature number="01" title="Say what you want" text="Dinner and comedy in Manhattan. A rooftop birthday in Queens. Brunch and something fun nearby." />
            <LightFeature number="02" title="See what fits together" text="Compare restaurants, activities, nightlife, and nearby options around the plan you described." />
            <LightFeature number="03" title="Make it yours" text="Choose the places that feel right, open their details, and build the outing around your people and your time." />
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden px-5 py-20 sm:px-6 lg:px-8 lg:py-24">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_20%,rgba(225,6,42,0.13),transparent_28%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-8 lg:grid-cols-2">
          <ChoiceSection eyebrow="Choose the occasion" title="Start with the reason you’re going out." items={occasions} />
          <ChoiceSection eyebrow="Choose the area" title="Find the right part of New York for the plan." items={areas} />
        </div>
      </section>

      <section className="px-5 pb-20 sm:px-6 lg:px-8 lg:pb-24">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-[2rem] border border-white/10 bg-[#0b0b0b]">
          <div className="grid gap-0 lg:grid-cols-[1.15fr_.85fr]">
            <div className="p-8 sm:p-10 lg:p-12">
              <p className="text-xs font-black uppercase tracking-[0.28em] text-[#ff8a9b]">
                Explore TheOutHaven
              </p>
              <h2 className="mt-4 max-w-2xl text-4xl font-black tracking-[-0.045em] sm:text-5xl">
                Find places worth building a plan around.
              </h2>
              <p className="mt-5 max-w-2xl text-base leading-7 text-white/58">
                Browse restaurants, activities, nightlife, and experiences across New York City and Long Island, then turn the places you like into a complete outing.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/explore" className="inline-flex min-h-12 items-center justify-center rounded-full bg-white px-7 text-sm font-black text-black transition hover:bg-white/85">
                  Explore Places
                </Link>
                <Link href="/about" className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/15 px-7 text-sm font-black text-white transition hover:bg-white hover:text-black">
                  About TheOutHaven
                </Link>
              </div>
            </div>
            <div className="border-t border-white/10 bg-[radial-gradient(circle_at_center,rgba(225,6,42,.26),transparent_52%),#120506] p-8 lg:border-l lg:border-t-0 lg:p-12">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-[#ff8a9b]">One city. Countless possibilities.</p>
              <div className="mt-8 space-y-5">
                {["Dinner that matches the mood", "An activity that keeps the night going", "A neighborhood that brings it all together"].map((item) => (
                  <div key={item} className="border-b border-white/10 pb-5 last:border-0 last:pb-0">
                    <p className="text-lg font-black leading-7">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-[#120606] px-5 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-7 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.26em] text-[#ff8a9b]">For businesses</p>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.035em] sm:text-4xl">
              Be part of where people decide to go next.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-white/58">
              Keep your presence accurate, show what makes your business worth choosing, and give people a clearer path from discovery to a night out.
            </p>
          </div>
          <Link href="/business" className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-full bg-[#e1062a] px-8 text-sm font-black text-white transition hover:bg-[#ff1744]">
            For Businesses
          </Link>
        </div>
      </section>

      <TheOutHavenFooter />
    </main>
  );
}

function PremiumPreview() {
  return (
    <aside className="relative min-w-0 overflow-hidden rounded-[2rem] border border-white/10 bg-[#0b0b0b] p-6 shadow-2xl shadow-black/50 sm:p-7">
      <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-[#e1062a]/15 blur-3xl" />
      <div className="relative">
        <div className="flex items-center justify-between border-b border-white/10 pb-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#ff8a9b]">Your night, considered</p>
            <p className="mt-2 text-lg font-black">Build around the whole experience</p>
          </div>
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[#e1062a]/30 bg-[#e1062a]/10 text-[#ff8a9b]">✦</span>
        </div>

        <div className="mt-5 space-y-3">
          {[
            ["01", "Start with the table", "Dinner, brunch, drinks, or something special."],
            ["02", "Add the experience", "A show, activity, nightlife, or something unexpected."],
            ["03", "Keep it close", "Bring the stops together around the area that works."],
          ].map(([number, title, text]) => (
            <div key={number} className="grid grid-cols-[44px_1fr] gap-4 rounded-2xl border border-white/8 bg-white/[.035] p-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/[.06] text-xs font-black text-[#ff8a9b]">{number}</span>
              <div>
                <p className="text-sm font-black text-white">{title}</p>
                <p className="mt-1 text-sm leading-6 text-white/45">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

function LightFeature({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <article className="rounded-[1.75rem] border border-black/10 bg-[#f7f7f7] p-7 sm:p-8">
      <p className="text-xs font-black tracking-[0.2em] text-[#e1062a]">{number}</p>
      <h3 className="mt-5 text-2xl font-black tracking-[-0.03em]">{title}</h3>
      <p className="mt-4 text-sm leading-7 text-black/58">{text}</p>
    </article>
  );
}

function ChoiceSection({ eyebrow, title, items }: { eyebrow: string; title: string; items: string[] }) {
  return (
    <section className="rounded-[1.75rem] border border-white/10 bg-white/[.035] p-7 sm:p-8">
      <p className="text-xs font-black uppercase tracking-[0.24em] text-[#ff8a9b]">{eyebrow}</p>
      <h2 className="mt-3 max-w-xl text-2xl font-black tracking-[-0.03em] sm:text-3xl">{title}</h2>
      <div className="mt-6 flex flex-wrap gap-2">
        {items.map((item) => (
          <Link
            key={item}
            href={`/create?prompt=${encodeURIComponent(item)}`}
            className="rounded-full border border-white/12 bg-white/[.025] px-4 py-2.5 text-sm font-bold text-white/72 transition hover:border-[#e1062a] hover:bg-[#e1062a]/10 hover:text-white"
          >
            {item}
          </Link>
        ))}
      </div>
    </section>
  );
}
