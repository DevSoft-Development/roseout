import Link from "next/link";

import TheOutHavenFooter from "@/components/TheOutHavenFooter";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";

export const metadata = {
  title: "About TheOutHaven – AI Outing Planner",
  description:
    "Meet the founder and learn how TheOutHaven LLC helps people plan restaurants, activities, nightlife, and complete outings across NYC and Long Island.",
};

const founderLinkedIn =
  "https://www.linkedin.com/in/nicholas-endeavour-91b65a431/";

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <TheOutHavenHeader />

      <section className="relative overflow-hidden px-6 pb-24 pt-32 text-center">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(225,6,42,0.22),transparent_42%),linear-gradient(180deg,#050505,#000)]" />
        <div className="relative mx-auto max-w-5xl">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-[#e1062a]">
            About TheOutHaven
          </p>
          <h1 className="mt-5 text-5xl font-black leading-tight tracking-tight md:text-7xl">
            Plan better outings.
            <br />
            <span className="text-[#e1062a]">Without endless scrolling.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-white/60">
            TheOutHaven is an AI-powered outing planner that helps people discover
            restaurants, activities, nightlife, and experiences that fit the
            place, timing, and kind of outing they have in mind.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/create"
              className="rounded-2xl bg-[#e1062a] px-8 py-4 text-sm font-black text-white shadow-2xl shadow-red-500/30 transition hover:bg-red-500"
            >
              Plan My Outing →
            </Link>
            <Link
              href="/explore"
              className="rounded-2xl border border-white/15 bg-white/5 px-8 py-4 text-sm font-black text-white/75 transition hover:bg-white hover:text-black"
            >
              Explore Places
            </Link>
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-[#070707] px-6 py-20">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[.85fr_1.15fr] lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-[#e1062a]">
              Founder
            </p>
            <h2 className="mt-4 text-4xl font-black tracking-tight md:text-5xl">
              Nicholas Endeavour
            </h2>
            <p className="mt-2 text-lg font-black text-white/75">
              Founder & CEO, TheOutHaven
            </p>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-black p-7 sm:p-8">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
              <div
                className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full border border-[#e1062a]/35 bg-[#e1062a]/10 text-3xl font-black text-white"
                aria-label="Nicholas Endeavour"
              >
                NE
              </div>
              <div>
                <p className="text-base leading-7 text-white/65">
                  Nicholas Endeavour founded TheOutHaven and leads the company’s
                  product and platform development. The mission is to make local
                  discovery more useful by turning a person’s outing idea into a
                  focused plan instead of another long list of places to search.
                </p>
                <a
                  href={founderLinkedIn}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-6 inline-flex rounded-full border border-white/15 bg-white/[.05] px-5 py-3 text-sm font-black text-white transition hover:bg-white hover:text-black"
                >
                  View Nicholas on LinkedIn ↗
                </a>
                <p className="mt-3 text-xs leading-5 text-white/35">
                  LinkedIn is an independent third-party public profile.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-20">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-[#e1062a]">
              Company
            </p>
            <h2 className="mt-4 text-4xl font-black tracking-tight md:text-5xl">
              TheOutHaven LLC
            </h2>
            <p className="mt-6 text-lg leading-8 text-white/60">
              TheOutHaven LLC is a New York-based technology company building an
              AI-powered discovery and outing-planning platform for consumers and
              local businesses.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FactCard title="Product" text="AI-assisted outing discovery and planning." />
            <FactCard title="Current coverage" text="New York City and Long Island." />
            <FactCard title="For consumers" text="Search, compare, explore, and build an outing." />
            <FactCard title="For businesses" text="Public profiles, discovery tools, claims, and business operations." />
          </div>
        </div>
      </section>

      <section className="bg-white px-6 py-20 text-black">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-[#e1062a]">
              What the product does
            </p>
            <h2 className="mt-4 text-4xl font-black tracking-tight md:text-5xl">
              One idea in. A more useful plan out.
            </h2>
            <p className="mt-6 text-lg leading-8 text-black/60">
              Instead of opening multiple search, map, review, and reservation
              tools, users can describe the outing they want in plain English and
              work from a focused set of restaurant and activity matches.
            </p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            <LightCard title="Restaurants" text="Find dinner, brunch, rooftops, lounges, casual spots, and upscale options." />
            <LightCard title="Activities" text="Pair a meal with karaoke, bowling, comedy, nightlife, museums, games, and more." />
            <LightCard title="Vibe matching" text="Search around the occasion, neighborhood, timing, budget, and preferences." />
            <LightCard title="Actionable results" text="Open public profiles and continue from discovery toward a real outing." />
          </div>
        </div>
      </section>

      <section className="px-6 py-20">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10 max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-[#e1062a]">
              How it works
            </p>
            <h2 className="mt-4 text-4xl font-black md:text-5xl">
              Search, compare, and build the outing.
            </h2>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            <Step number="01" title="Describe the outing" text="Type what you want naturally, such as “steak dinner and karaoke in Manhattan” or “romantic birthday dinner in Queens.”" />
            <Step number="02" title="Review live matches" text="TheOutHaven returns restaurants, activities, and paired outings that fit the request and location context." />
            <Step number="03" title="Choose and continue" text="View profiles, compare the options, choose a plan, and use available business or booking links when ready." />
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-[#070707] px-6 py-20">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1fr_1fr] lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-[#e1062a]">
              Designed for trust
            </p>
            <h2 className="mt-4 text-4xl font-black md:text-5xl">
              TheOutHaven helps people decide. Businesses remain the source of record.
            </h2>
            <p className="mt-6 text-lg leading-8 text-white/60">
              Business hours, prices, inventory, reservation availability, and
              policies can change. TheOutHaven helps users discover and compare
              options, while final details should be confirmed directly with the
              business or booking provider.
            </p>
          </div>
          <div className="rounded-[2rem] border border-white/10 bg-black p-7">
            <TrustPoint text="Public Explore and planning experiences can be viewed without signing into a private business dashboard." />
            <TrustPoint text="Reservation and booking links may lead to third-party services." />
            <TrustPoint text="Business owners and authorized representatives can claim and maintain their presence." />
            <TrustPoint text="Current consumer coverage focuses on NYC and Long Island." />
          </div>
        </div>
      </section>

      <section id="faq" className="px-6 py-20">
        <div className="mx-auto max-w-4xl">
          <div className="text-center">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-[#e1062a]">
              FAQ
            </p>
            <h2 className="mt-4 text-4xl font-black md:text-5xl">
              How TheOutHaven works
            </h2>
          </div>
          <div className="mt-12 space-y-4">
            <FAQ q="How do I use TheOutHaven?" a="Describe what you want in plain English. TheOutHaven returns matching restaurants, activities, or a combined outing when the request includes both." />
            <FAQ q="Do I need an account to try the product?" a="No. Public Explore pages and the outing-planning entry experience are available without requiring a reviewer to sign into a private dashboard." />
            <FAQ q="Do I book through TheOutHaven?" a="TheOutHaven may show reservation, website, or booking links when available. Final booking, availability, cancellation policies, and pricing are handled by the business or booking provider." />
            <FAQ q="Where is TheOutHaven available?" a="The current consumer discovery area focuses on New York City and Long Island, with expansion planned over time." />
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden px-6 py-24 text-center">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(225,6,42,0.18),transparent_38%)]" />
        <div className="relative mx-auto max-w-4xl">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-[#e1062a]">
            Start now
          </p>
          <h2 className="mt-4 text-5xl font-black tracking-tight md:text-6xl">
            Your next outing starts with one sentence.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-white/55">
            Use the live planner or browse public locations across the current coverage area.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/create" className="inline-flex rounded-2xl bg-[#e1062a] px-10 py-5 text-lg font-black text-white shadow-2xl shadow-red-500/30 transition hover:bg-red-500">
              Plan My Outing →
            </Link>
            <Link href="/explore" className="inline-flex rounded-2xl border border-white/15 px-10 py-5 text-lg font-black text-white transition hover:bg-white hover:text-black">
              Explore Places
            </Link>
          </div>
        </div>
      </section>

      <TheOutHavenFooter />
    </main>
  );
}

function FactCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-white/[.035] p-6">
      <h3 className="text-lg font-black">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-white/50">{text}</p>
    </div>
  );
}

function Step({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <div className="rounded-[2rem] border border-white/10 bg-[#0d0d0d] p-7">
      <p className="text-sm font-black text-[#e1062a]">{number}</p>
      <h3 className="mt-4 text-2xl font-black">{title}</h3>
      <p className="mt-3 text-sm leading-7 text-white/50">{text}</p>
    </div>
  );
}

function LightCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-lg shadow-black/5">
      <h3 className="text-xl font-black">{title}</h3>
      <p className="mt-3 text-sm leading-7 text-black/60">{text}</p>
    </div>
  );
}

function TrustPoint({ text }: { text: string }) {
  return (
    <div className="border-b border-white/10 py-4 last:border-b-0">
      <p className="text-sm font-semibold leading-7 text-white/60">✓ {text}</p>
    </div>
  );
}

function FAQ({ q, a }: { q: string; a: string }) {
  return (
    <details className="group rounded-[1.5rem] border border-white/10 bg-[#0d0d0d] p-6">
      <summary className="cursor-pointer list-none text-lg font-black marker:hidden">
        <span className="flex items-center justify-between gap-4">
          {q}
          <span className="text-[#e1062a] transition group-open:rotate-45">+</span>
        </span>
      </summary>
      <p className="mt-4 text-sm leading-7 text-white/55">{a}</p>
    </details>
  );
}
