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
  "Night out",
  "Brunch",
  "Something different",
];

const areas = [
  "Manhattan",
  "Brooklyn",
  "Queens",
  "Long Island",
  "Hoboken",
  "Jersey City",
];

export default function HomePage() {
  return (
    <main className="min-h-dvh overflow-x-hidden bg-[#050505] text-white">
      <RecoveryRedirect />
      <TheOutHavenHeader />

      <section className="relative overflow-hidden border-b border-white/5 pt-20">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_5%,rgba(225,6,42,.22),transparent_34%),radial-gradient(circle_at_8%_48%,rgba(225,6,42,.09),transparent_26%),linear-gradient(180deg,#050505_0%,#090606_62%,#050505_100%)]" />
        <div className="absolute inset-x-0 top-20 h-px bg-gradient-to-r from-transparent via-[#e1062a]/45 to-transparent" />

        <div className="relative mx-auto flex min-h-[calc(100svh-5rem)] w-full max-w-7xl flex-col items-center justify-center px-5 pb-16 pt-14 text-center sm:px-6 lg:px-8 lg:pb-20 lg:pt-16">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-[#ff8a9b]">
            New York City + Long Island
          </p>

          <h1 className="mt-5 max-w-5xl text-5xl font-black leading-[.94] tracking-[-.06em] sm:text-6xl lg:text-[5.75rem]">
            Plan better <span className="text-[#e1062a]">OUTings.</span>
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-white/62 sm:text-xl sm:leading-9">
            Tell us what you&apos;re in the mood for. We&apos;ll find the places and put the outing together.
          </p>

          <div className="mt-10 w-full">
            <LiveOutingSearch />
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-black uppercase tracking-[0.18em] text-white/28">
            <span>Restaurants</span>
            <span className="text-[#e1062a]">•</span>
            <span>Activities</span>
            <span className="text-[#e1062a]">•</span>
            <span>Nightlife</span>
            <span className="text-[#e1062a]">•</span>
            <span>Complete Outings</span>
          </div>
        </div>
      </section>

      <section className="bg-white px-5 py-20 text-black sm:px-6 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#e1062a]">How it works</p>
            <h2 className="mt-4 text-4xl font-black tracking-[-0.045em] sm:text-5xl">
              One search. Your whole outing.
            </h2>
            <p className="mt-5 text-lg leading-8 text-black/58">
              Most searches give you places. TheOutHaven helps put the night together.
            </p>
          </div>

          <div className="mt-14 grid gap-5 md:grid-cols-3">
            <LightFeature
              number="01"
              title="Tell us what you want"
              text="Try something natural like “Italian dinner and something fun afterward in Queens.”"
            />
            <LightFeature
              number="02"
              title="We find what fits"
              text="We bring together food, activities, distance, vibe, and timing around the kind of outing you described."
            />
            <LightFeature
              number="03"
              title="Pick your outing"
              text="Compare the places that work together, choose what feels right, and keep the night moving."
            />
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden border-y border-white/10 px-5 py-20 sm:px-6 lg:px-8 lg:py-24">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_10%,rgba(225,6,42,.14),transparent_34%)]" />
        <div className="relative mx-auto max-w-7xl">
          <div className="mx-auto max-w-4xl text-center">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#ff8a9b]">See it in action</p>
            <h2 className="mt-4 text-4xl font-black tracking-[-0.045em] sm:text-5xl">
              Search the way you actually think about going out.
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-white/58">
              You don&apos;t need to start with a category or know the exact place. Start with the night you want.
            </p>
          </div>

          <div className="mt-10 grid gap-5 lg:grid-cols-2 lg:items-stretch">
            <div className="flex h-full flex-col rounded-[2rem] border border-white/10 bg-white/[.035] p-6 sm:p-8">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-white/35">Try searching</p>
                <p className="mt-4 max-w-xl text-2xl font-black leading-snug text-white sm:text-3xl">
                  “Dinner and live music somewhere nice for date night.”
                </p>
              </div>
              <p className="mt-auto pt-8 text-sm font-semibold leading-6 text-white/42">
                Say what you want in one sentence. TheOutHaven turns it into a complete outing instead of making you search one stop at a time.
              </p>
            </div>

            <div className="flex h-full flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-[#0b0b0b] shadow-2xl shadow-black/50">
              <div className="border-b border-white/10 px-6 py-5 sm:px-8">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-[#ff8a9b]">Your outing</p>
                <p className="mt-2 text-lg font-black">A date night that keeps moving</p>
              </div>
              <div className="grid flex-1 gap-0 sm:grid-cols-[1fr_auto_1fr] sm:items-stretch">
                <DemoStop label="Dinner" title="Italian" detail="Romantic • Manhattan" />
                <div className="flex items-center justify-center border-y border-white/10 px-5 py-4 sm:border-x sm:border-y-0">
                  <div className="text-center">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-white/30">Next stop</p>
                    <p className="mt-1 text-sm font-black text-[#ff8a9b]">8 min walk</p>
                  </div>
                </div>
                <DemoStop label="Activity" title="Live music" detail="Jazz • Nearby" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#090909] px-5 py-20 sm:px-6 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#ff8a9b]">Built for the whole outing</p>
            <h2 className="mt-4 text-4xl font-black tracking-[-0.045em] sm:text-5xl">Eat. Do. Go.</h2>
          </div>
          <div className="mt-12 grid gap-px overflow-hidden rounded-[2rem] border border-white/10 bg-white/10 md:grid-cols-3">
            <DarkFeature title="Eat" text="Find restaurants, brunch, drinks, rooftops, and places worth building the night around." />
            <DarkFeature title="Do" text="Add activities, entertainment, nightlife, live music, games, and experiences." />
            <DarkFeature title="Go" text="Keep the stops connected so the outing makes sense geographically, not just individually." />
          </div>
        </div>
      </section>

      <section className="px-5 py-20 sm:px-6 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-[#ff8a9b]">Need inspiration?</p>
              <h2 className="mt-3 text-4xl font-black tracking-[-0.045em] sm:text-5xl">Plan by occasion.</h2>
            </div>
            <Link href="/explore" className="text-sm font-black text-white/55 transition hover:text-white">
              Explore more ideas →
            </Link>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {occasions.map((occasion, index) => (
              <Link
                key={occasion}
                href={`/create?prompt=${encodeURIComponent(occasion)}`}
                className="group relative min-h-44 overflow-hidden rounded-[1.75rem] border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(225,6,42,.18),transparent_38%),#0b0b0b] p-6 transition hover:-translate-y-1 hover:border-[#e1062a]/50"
              >
                <span className="text-xs font-black tracking-[0.2em] text-[#ff8a9b]">0{index + 1}</span>
                <div className="absolute inset-x-6 bottom-6 flex items-end justify-between gap-4">
                  <h3 className="text-2xl font-black tracking-[-0.03em]">{occasion}</h3>
                  <span className="text-xl text-white/35 transition group-hover:translate-x-1 group-hover:text-white">→</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-white px-5 py-18 text-black sm:px-6 lg:px-8 lg:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-black uppercase tracking-[0.28em] text-[#e1062a]">Popular areas</p>
              <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] sm:text-4xl">Start with where you want the night to happen.</h2>
            </div>
            <div className="flex max-w-2xl flex-wrap gap-2.5 lg:justify-end">
              {areas.map((area) => (
                <Link
                  key={area}
                  href={`/create?prompt=${encodeURIComponent(area)}`}
                  className="rounded-full border border-black/10 bg-[#f6f6f6] px-5 py-3 text-sm font-black text-black/65 transition hover:border-[#e1062a]/40 hover:bg-[#fff2f4] hover:text-black"
                >
                  {area}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-white/10 bg-[#120606] px-5 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-7 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.26em] text-[#ff8a9b]">For businesses</p>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.035em] sm:text-4xl">
              Your customers are already deciding where to go next.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-white/58">
              Bring your business to TheOutHaven and show up while people are deciding where to eat, what to do, and where to go next.
            </p>
          </div>
          <Link href="/business" className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-full bg-[#e1062a] px-8 text-sm font-black text-white transition hover:bg-[#ff1744]">
            TheOutHaven for Business
          </Link>
        </div>
      </section>

      <section className="relative overflow-hidden px-5 py-20 sm:px-6 lg:px-8 lg:py-24">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,rgba(225,6,42,.18),transparent_40%)]" />
        <div className="relative mx-auto max-w-4xl text-center">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-[#ff8a9b]">Ready?</p>
          <h2 className="mt-4 text-4xl font-black tracking-[-0.045em] sm:text-5xl">So, what are we doing?</h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-white/58">
            Start with the whole night. We&apos;ll help you find what fits.
          </p>
          <Link
            href="#plan-your-outing"
            className="mt-8 inline-flex min-h-14 items-center justify-center rounded-full bg-[#e1062a] px-8 text-sm font-black text-white transition hover:bg-[#ff1744]"
          >
            Plan My Outing
          </Link>
        </div>
      </section>

      <TheOutHavenFooter />
    </main>
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

function DarkFeature({ title, text }: { title: string; text: string }) {
  return (
    <article className="bg-[#090909] p-7 sm:p-8 lg:p-10">
      <h3 className="text-3xl font-black tracking-[-0.04em]">{title}</h3>
      <p className="mt-4 text-sm leading-7 text-white/52">{text}</p>
    </article>
  );
}

function DemoStop({ label, title, detail }: { label: string; title: string; detail: string }) {
  return (
    <div className="p-6 sm:p-8">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-white/35">{label}</p>
      <p className="mt-3 text-2xl font-black tracking-[-0.03em]">{title}</p>
      <p className="mt-2 text-sm font-bold text-white/50">{detail}</p>
    </div>
  );
}
