import Link from "next/link";

import TheOutHavenFooter from "@/components/TheOutHavenFooter";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "About TheOutHaven",
  description:
    "TheOutHaven LLC is a live early-stage technology company connecting AI-powered outing discovery with software for local businesses.",
  path: "/about",
});

const founderLinkedIn = "https://www.linkedin.com/in/nicholas-endeavour-91b65a431/";

const businessCapabilities = [
  ["Reservations & guests", "Manage reservations, tables, spaces, waitlists, guest details, reminders, and the day-of hosting experience."],
  ["Events & experiences", "Publish bookable events and experiences with availability, ticketing, bookings, and check-in workflows."],
  ["CRM & customer relationships", "Keep up with leads, guests, VIP customers, messages, reviews, and follow-up from one workspace."],
  ["Marketing & social", "Plan promotions, create content, connect social accounts, and manage marketing operations."],
  ["Website & domain", "Create and manage a business website and connect a domain from the same platform."],
  ["Analytics & performance", "Track discovery, reservations, customer activity, events, and other operating outcomes."],
];

const proofCards = [
  {
    href: "/#plan-your-outing",
    label: "Consumer product",
    title: "AI outing planning",
    text: "Describe the kind of outing you want and search across restaurants, activities, nightlife, and local experiences.",
  },
  {
    href: "/explore",
    label: "Consumer product",
    title: "Live discovery",
    text: "Browse searchable places across New York City and Long Island and open public location profiles.",
  },
  {
    href: "/business",
    label: "Business platform",
    title: "Business operations",
    text: "See the platform for discovery, reservations, CRM, marketing, websites, events, experiences, and analytics.",
  },
  {
    href: "/business/plans",
    label: "Commercial model",
    title: "Business plans",
    text: "Review how local businesses can use TheOutHaven commercially and choose the plan that fits their operation.",
  },
];

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <TheOutHavenHeader />

      <section className="relative overflow-hidden px-6 pb-24 pt-36">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_8%,rgba(225,6,42,0.22),transparent_30%),radial-gradient(circle_at_88%_42%,rgba(225,6,42,0.1),transparent_24%),linear-gradient(180deg,#050505,#090606_72%,#000)]" />
        <div className="relative mx-auto max-w-7xl">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-[#ff8a9b]">About TheOutHaven</p>
          <div className="mt-6 grid gap-10 lg:grid-cols-[1.08fr_.72fr] lg:items-end">
            <h1 className="max-w-5xl text-5xl font-black leading-[.95] tracking-[-.055em] md:text-7xl lg:text-[5.2rem]">
              One company connecting better outings
              <span className="block text-[#e1062a]">with better local business.</span>
            </h1>
            <p className="max-w-xl text-lg leading-8 text-white/62 lg:justify-self-end">
              TheOutHaven brings people and local businesses together around where to eat, what to do, where to celebrate, and how to turn an idea into a complete outing.
            </p>
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-[#080808] px-6 py-20 lg:py-24">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[.72fr_1.28fr]">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#e1062a]">Our company</p>
            <h2 className="mt-4 text-4xl font-black tracking-[-0.04em] md:text-5xl">TheOutHaven LLC</h2>
          </div>
          <div className="space-y-6 text-lg leading-8 text-white/62">
            <p>
              TheOutHaven is a live early-stage technology platform currently serving New York City and Long Island. It combines AI-powered outing discovery with software for restaurants, nightlife venues, activity businesses, and experience operators.
            </p>
            <p>
              For consumers, TheOutHaven helps turn an occasion, neighborhood, preference, or idea into a complete plan. For businesses, it provides tools to be discovered, manage the customer experience, and build stronger customer relationships.
            </p>
            <p>
              The current product is live while the company continues expanding its capabilities and preparing for broader commercial growth. New York City and Long Island are the first markets, with a model designed to expand over time.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-white px-6 py-20 text-black lg:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-10 lg:grid-cols-[.9fr_1.1fr] lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-[#e1062a]">Why we exist</p>
              <h2 className="mt-4 text-4xl font-black tracking-[-0.045em] md:text-5xl">Discovery should end with a decision—not another search.</h2>
            </div>
            <p className="max-w-2xl text-lg leading-8 text-black/58 lg:justify-self-end">
              People often know the kind of experience they want before they know the exact places. TheOutHaven helps turn that intent into a plan while giving strong local businesses a better opportunity to become part of it.
            </p>
          </div>
        </div>
      </section>

      <section className="px-6 py-20 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-10 lg:grid-cols-[.8fr_1.2fr] lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-[#e1062a]">Live product</p>
              <h2 className="mt-4 text-4xl font-black tracking-[-0.045em] md:text-5xl">See what TheOutHaven does today.</h2>
            </div>
            <p className="max-w-2xl text-lg leading-8 text-white/60 lg:justify-self-end">
              The public product is available now for outing discovery, and the business platform provides operating tools for local businesses.
            </p>
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {proofCards.map((card) => (
              <Link key={card.title} href={card.href} className="group rounded-[1.6rem] border border-white/10 bg-white/[.035] p-6 transition hover:border-[#e1062a]/45 hover:bg-white/[.06]">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ff8a9b]">{card.label}</p>
                <h3 className="mt-4 text-xl font-black tracking-[-0.025em]">{card.title}</h3>
                <p className="mt-3 text-sm leading-7 text-white/52">{card.text}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-[#120606] px-6 py-20 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-4xl">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#ff8a9b]">Business platform</p>
            <h2 className="mt-4 text-4xl font-black tracking-[-0.045em] md:text-5xl">More than a listing. A place to run and grow the customer experience.</h2>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-white/62">
              TheOutHaven gives local businesses a dedicated workspace built around the customer journey—from discovery through the visit and the next relationship.
            </p>
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {businessCapabilities.map(([title, text]) => (
              <article key={title} className="rounded-[1.6rem] border border-white/10 bg-black/35 p-6">
                <h3 className="text-xl font-black">{title}</h3>
                <p className="mt-3 text-sm leading-7 text-white/52">{text}</p>
              </article>
            ))}
          </div>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Link href="/business" className="inline-flex justify-center rounded-full bg-white px-7 py-3.5 text-sm font-black text-black transition hover:bg-white/90">Explore Business Tools</Link>
            <Link href="/business/claim" className="inline-flex justify-center rounded-full border border-white/20 px-7 py-3.5 text-sm font-black transition hover:bg-white hover:text-black">Claim Your Location</Link>
          </div>
        </div>
      </section>

      <section className="bg-white px-6 py-20 text-black lg:py-24">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#e1062a]">Where we are starting</p>
            <h2 className="mt-4 text-4xl font-black tracking-[-0.045em] md:text-5xl">New York first. Built for what comes next.</h2>
          </div>
          <p className="text-lg leading-8 text-black/58">
            The product is live in New York City and Long Island today. TheOutHaven is using this market to build a scalable model for more regions while continuing to expand the consumer and business platform.
          </p>
        </div>
      </section>

      <section className="border-t border-white/10 px-6 py-16">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-[#e1062a]">Founder & CEO</p>
            <h2 className="mt-2 text-2xl font-black">Nicholas Endeavour</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/48">Nicholas Endeavour founded TheOutHaven and leads the company’s direction and development.</p>
          </div>
          <a href={founderLinkedIn} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 rounded-full border border-white/15 px-6 py-3 text-sm font-black transition hover:bg-white hover:text-black">LinkedIn ↗</a>
        </div>
      </section>

      <section className="relative overflow-hidden px-6 py-24 text-center">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(225,6,42,0.18),transparent_38%)]" />
        <div className="relative mx-auto max-w-4xl">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-[#ff8a9b]">TheOutHaven</p>
          <h2 className="mt-4 text-5xl font-black tracking-[-0.05em] md:text-6xl">Better plans. Stronger local businesses.</h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-white/55">Discover your next outing or bring your business into the experience.</p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/#plan-your-outing" className="inline-flex rounded-full bg-[#e1062a] px-9 py-4 text-sm font-black transition hover:bg-[#ff1744]">Plan an Outing</Link>
            <Link href="/business" className="inline-flex rounded-full border border-white/15 px-9 py-4 text-sm font-black transition hover:bg-white hover:text-black">Explore Business Tools</Link>
          </div>
        </div>
      </section>

      <TheOutHavenFooter />
    </main>
  );
}
