"use client";

import { useState } from "react";
import Link from "next/link";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";

export default function BusinessPage() {
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const isYearly = billing === "yearly";

  return (
    <main className="min-h-screen bg-black text-white">
      <TheOutHavenHeader />

      <section className="relative overflow-hidden px-6 pt-32 pb-24 text-center">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(225,6,42,0.22),transparent_42%),linear-gradient(180deg,#050505,#000)]" />

        <div className="relative mx-auto max-w-5xl">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-[#e1062a]">
            For Businesses
          </p>

          <h1 className="mt-5 text-5xl font-black leading-tight tracking-tight md:text-7xl">
            Get discovered when people are ready to go out.
          </h1>

          <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-white/60">
            TheOutHaven helps restaurants, activities, lounges, venues, and
            experience-based locations connect with users actively planning date
            nights, birthdays, dinners, and outings.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="#packages"
              className="rounded-2xl bg-[#e1062a] px-8 py-4 text-sm font-black text-white shadow-2xl shadow-red-500/30 transition hover:bg-red-500"
            >
              View Packages →
            </Link>

            <Link
              href="#how-it-works"
              className="rounded-2xl border border-white/15 bg-white/5 px-8 py-4 text-sm font-black text-white/75 transition hover:bg-white hover:text-black"
            >
              How It Works
            </Link>
          </div>
        </div>
      </section>

      <section className="px-6 py-20">
        <div className="mx-auto grid max-w-7xl gap-6 md:grid-cols-4">
          <Stat value="AI Discovery" label="Appear in outing recommendations" />
          <Stat value="TheOutHaven Reserve" label="Turn interest into bookings" />
          <Stat value="QR Ready" label="Drive scans to your profile" />
          <Stat value="Trackable" label="Views, clicks, and customer interest" />
        </div>
      </section>

      <section
        id="how-it-works"
        className="border-y border-white/10 bg-[#070707] px-6 py-20"
      >
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-[#e1062a]">
              Business tools
            </p>

            <h2 className="mt-4 text-4xl font-black md:text-5xl">
              A cleaner path from discovery to action.
            </h2>

            <p className="mt-5 text-lg leading-8 text-white/60">
              TheOutHaven is designed to help users find locations that match their
              intent — and help businesses turn that attention into visits,
              bookings, and customer interest.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <Feature
              number="01"
              title="Choose your package"
              text="Start with free Basic AI discovery or upgrade to TheOutHaven Pro for priority discovery, reservations, analytics, and QR growth tools."
            />

            <Feature
              number="02"
              title="Claim or add your location"
              text="Verify your business or submit a new restaurant, lounge, venue, activity, or experience for review."
            />

            <Feature
              number="03"
              title="Get discovered by AI"
              text="TheOutHaven recommends your business to users planning date nights, birthdays, dinners, brunch, nightlife, and outings."
            />

            <Feature
              number="04"
              title="Turn interest into action"
              text="Use booking links, TheOutHaven Reserve, QR tools, and analytics to convert discovery into visits and reservations."
            />
          </div>
        </div>
      </section>

      <section id="packages" className="px-6 py-20">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-[#e1062a]">
              Packages
            </p>

            <h2 className="mt-4 text-4xl font-black md:text-5xl">
              Start free or grow with TheOutHaven Pro.
            </h2>

            <p className="mt-6 text-lg leading-8 text-white/60">
              The free plan gives your business Basic AI discovery on TheOutHaven.
              TheOutHaven Pro gives your listing stronger placement, booking tools,
              analytics, QR growth tools, and more control over how customers
              discover you.
            </p>

            <div className="mt-8 inline-flex rounded-2xl border border-white/10 bg-[#0d0d0d] p-1">
              <button
                type="button"
                onClick={() => setBilling("monthly")}
                className={`rounded-xl px-5 py-3 text-sm font-black transition ${
                  billing === "monthly"
                    ? "bg-white text-black"
                    : "text-white/55 hover:text-white"
                }`}
              >
                Monthly
              </button>

              <button
                type="button"
                onClick={() => setBilling("yearly")}
                className={`rounded-xl px-5 py-3 text-sm font-black transition ${
                  billing === "yearly"
                    ? "bg-[#e1062a] text-white"
                    : "text-white/55 hover:text-white"
                }`}
              >
                Yearly
                <span className="ml-2 rounded-full bg-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.12em]">
                  Save 20%
                </span>
              </button>
            </div>

            <p className="mt-4 text-sm font-semibold text-white/45">
              {isYearly
                ? "Yearly billing gives Pro businesses two months free."
                : "Switch to yearly to save 20% on TheOutHaven Pro."}
            </p>
          </div>

          <div className="grid items-stretch gap-5 md:grid-cols-2">
            <PlanCard
              title="Free"
              price="$0"
              period="/mo"
              text="Basic visibility for businesses that want to appear in TheOutHaven AI discovery."
              cta="Start Free"
              href="/locations/apply?plan=free"
              features={[
                "Basic AI discovery",
                "Appears in search results",
                "1 photo",
                "Claim your business",
                "Basic views",
              ]}
            />

            <PlanCard
              featured
              title="TheOutHaven Pro"
              price={isYearly ? "$79" : "$99"}
              period="/mo"
              yearlyNote={isYearly ? "Billed yearly at $948/year" : undefined}
              oldPrice={isYearly ? "$99/mo" : undefined}
              cta={isYearly ? "Choose Yearly Pro" : "Choose Monthly Pro"}
              href={`/checkout?plan=pro&billing=${billing}`}
              features={[
                "Priority AI discovery",
                "TheOutHaven Reserve",
                "Advanced analytics",
                "QR Growth Tools",
                "Up to 10 photos",
                "Full listing customization",
              ]}
            />
          </div>
        </div>
      </section>

      <section className="bg-white px-6 py-20 text-black">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 text-center">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-[#e1062a]">
              Who should join
            </p>

            <h2 className="mt-4 text-4xl font-black md:text-5xl">
              TheOutHaven is for experience-driven locations.
            </h2>
          </div>

          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            <LightCard
              title="Restaurants"
              text="Dinner, brunch, rooftops, lounges, casual dining, and upscale experiences."
            />
            <LightCard
              title="Activities"
              text="Bowling, karaoke, comedy, games, museums, nightlife, and interactive experiences."
            />
            <LightCard
              title="Venues"
              text="Spaces that host birthdays, date nights, group outings, and memorable events."
            />
            <LightCard
              title="Local brands"
              text="Locations that want to be found when people are actively planning where to go."
            />
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden px-6 py-24 text-center">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(225,6,42,0.18),transparent_38%)]" />

        <div className="relative mx-auto max-w-4xl">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-[#e1062a]">
            Grow with TheOutHaven
          </p>

          <h2 className="mt-4 text-5xl font-black tracking-tight md:text-6xl">
            Be found when people are planning.
          </h2>

          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-white/55">
            Choose your package, claim your listing, strengthen your profile,
            and turn discovery into action.
          </p>

          <Link
            href="#packages"
            className="mt-10 inline-flex rounded-2xl bg-[#e1062a] px-10 py-5 text-lg font-black text-white shadow-2xl shadow-red-500/30 transition hover:bg-red-500"
          >
            View Packages →
          </Link>
        </div>
      </section>
    </main>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-[2rem] border border-white/10 bg-[#0d0d0d] p-6 text-center">
      <p className="text-2xl font-black text-white">{value}</p>
      <p className="mt-2 text-sm font-semibold text-white/45">{label}</p>
    </div>
  );
}

function Feature({
  number,
  title,
  text,
}: {
  number: string;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-[2rem] border border-white/10 bg-black p-7">
      <p className="text-sm font-black text-[#e1062a]">{number}</p>
      <h3 className="mt-4 text-xl font-black">{title}</h3>
      <p className="mt-3 text-sm leading-7 text-white/50">{text}</p>
    </div>
  );
}

function PlanCard({
  title,
  price,
  period,
  oldPrice,
  yearlyNote,
  text,
  features,
  cta,
  href,
  featured = false,
}: {
  title: string;
  price: string;
  period: string;
  oldPrice?: string;
  yearlyNote?: string;
  text?: string;
  features: string[];
  cta: string;
  href: string;
  featured?: boolean;
}) {
  return (
    <div
      className={`relative flex h-full flex-col rounded-[2rem] border p-7 shadow-2xl transition duration-300 hover:-translate-y-2 ${
        featured
          ? "border-[#e1062a]/70 bg-[#12060a] shadow-red-500/20"
          : "border-white/10 bg-[#0d0d0d] shadow-black/40"
      }`}
    >
      {featured && (
        <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/2">
          <span className="whitespace-nowrap rounded-full bg-[#e1062a] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-red-500/30">
            Most Popular
          </span>
        </div>
      )}

      <div className="mt-4 flex flex-1 flex-col">
        <h3 className="text-2xl font-black">{title}</h3>

        <div className="mt-3 flex items-end gap-1">
          <p className="text-4xl font-black">{price}</p>
          <p className="pb-1 text-sm font-bold text-white/45">{period}</p>
        </div>

        <div className="min-h-[82px]">
          {oldPrice && (
            <p className="mt-2 text-sm font-bold text-white/35 line-through">
              {oldPrice}
            </p>
          )}

          {yearlyNote && (
            <p className="mt-2 rounded-full bg-[#e1062a]/15 px-3 py-2 text-xs font-black text-[#ff8a9b]">
              {yearlyNote}
            </p>
          )}

          {text ? (
            <p className="mt-4 text-sm leading-7 text-white/55">{text}</p>
          ) : null}
        </div>

        <div className="mt-6 flex-1 space-y-3">
          {features.map((feature) => (
            <Check key={feature} text={feature} />
          ))}
        </div>

        <Link
          href={href}
          className={`mt-7 inline-flex w-full justify-center rounded-2xl px-6 py-3 text-sm font-black transition ${
            featured
              ? "bg-[#e1062a] text-white hover:bg-red-500"
              : "border border-white/15 bg-white/5 text-white/80 hover:bg-white hover:text-black"
          }`}
        >
          {cta}
        </Link>
      </div>
    </div>
  );
}

function Check({ text }: { text: string }) {
  return (
    <div className="flex min-h-[58px] items-center rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <p className="text-sm font-semibold leading-6 text-white/60">✓ {text}</p>
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