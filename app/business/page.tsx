"use client";

import { useState } from "react";
import Link from "next/link";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";

type Billing = "monthly" | "yearly";

export default function BusinessPage() {
  const [billing, setBilling] = useState<Billing>("monthly");
  const isYearly = billing === "yearly";

  const proPrice = isYearly ? "$79" : "$99";
  const proHref = `/checkout?plan=pro&billing=${billing}`;

  return (
    <main className="min-h-screen bg-black text-white">
      <TheOutHavenHeader />

      <section className="relative overflow-hidden px-6 pt-32 pb-24">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(225,6,42,0.28),transparent_38%),linear-gradient(180deg,#050505,#000)]" />

        <div className="relative mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.35em] text-[#e1062a]">
              For Restaurants, Venues & Experiences
            </p>

            <h1 className="mt-5 text-5xl font-black leading-tight tracking-tight md:text-7xl">
              Get discovered when customers are ready to go out.
            </h1>

            <p className="mt-6 max-w-3xl text-lg leading-8 text-white/60">
              TheOutHaven connects restaurants, lounges, activities, venues, and
              local experiences with people actively planning dinner, birthdays,
              date nights, nightlife, brunch, and group outings.
            </p>

            <div className="mt-9 flex flex-col gap-4 sm:flex-row">
              <Link
                href="/locations/apply?plan=free"
                className="rounded-2xl bg-[#e1062a] px-8 py-4 text-center text-sm font-black text-white shadow-2xl shadow-red-500/30 transition hover:bg-red-500"
              >
                Join Free →
              </Link>

              <Link
                href="#plans"
                className="rounded-2xl border border-white/15 bg-white/5 px-8 py-4 text-center text-sm font-black text-white/80 transition hover:bg-white hover:text-black"
              >
                Compare Plans
              </Link>
            </div>
          </div>

          <div className="rounded-[2.25rem] border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-red-500/10">
            <div className="rounded-[1.75rem] bg-[#0b0b0b] p-6">
              <p className="text-sm font-black uppercase tracking-[0.25em] text-[#e1062a]">
                Business Growth
              </p>

              <h2 className="mt-4 text-3xl font-black">
                From discovery to reservation.
              </h2>

              <div className="mt-6 space-y-4">
                <HeroPoint
                  title="AI discovery"
                  text="Show up when customers search for places to go."
                />
                <HeroPoint
                  title="Reservation system"
                  text="Pro businesses can accept reservation requests directly through TheOutHaven."
                />
                <HeroPoint
                  title="Real-time dashboard"
                  text="Monitor new reservations, customer interest, and booking activity from your business dashboard."
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 pb-16">
        <div className="mx-auto grid max-w-7xl gap-5 md:grid-cols-4">
          <Stat value="Discovery" label="Appear in customer searches" />
          <Stat value="Reservations" label="Accept customer booking requests" />
          <Stat value="Dashboard" label="Monitor reservations in real time" />
          <Stat value="Analytics" label="Track views, clicks, and interest" />
        </div>
      </section>

      <section
        id="plans"
        className="border-y border-white/10 bg-[#070707] px-6 py-20"
      >
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-[#e1062a]">
                Plans
              </p>

              <h2 className="mt-4 text-4xl font-black md:text-5xl">
                Start free. Upgrade when you’re ready to grow.
              </h2>

              <p className="mt-5 text-lg leading-8 text-white/60">
                Free gives your business basic visibility. Pro gives you stronger
                discovery, a reservation system, real-time reservation monitoring,
                analytics, QR growth tools, and more control over your listing.
              </p>
            </div>

            <div className="inline-flex w-fit rounded-2xl border border-white/10 bg-black p-1">
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
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <PlanCard
              title="Free"
              subtitle="For businesses that want basic visibility."
              price="$0"
              period="/mo"
              href="/locations/apply?plan=free"
              cta="Start Free"
              features={[
                "Basic AI discovery",
                "Appear in search results",
                "Claim or submit your listing",
                "Business name, address, category, and details",
                "Basic profile visibility",
                "One featured image",
              ]}
            />

            <PlanCard
              featured
              title="TheOutHaven Pro"
              subtitle="For businesses that want stronger placement, reservations, and conversion tools."
              price={proPrice}
              period="/mo"
              oldPrice={isYearly ? "$99/mo" : undefined}
              note={isYearly ? "Billed yearly at $948/year" : "Monthly billing"}
              href={proHref}
              cta={isYearly ? "Choose Yearly Pro" : "Choose Monthly Pro"}
              features={[
                "Priority AI discovery",
                "Enhanced profile placement",
                "Built-in reservation system",
                "Visual layout builder",
                "Hostess/operator view",
                "SMS confirmations and reminders",
                "Waitlist texting",
                "Add-to-calendar links",
                "Basic guest notes",
                "Basic analytics",
                "Accept customer reservation requests",
                "Real-time reservation dashboard",
                "Monitor new reservations and customer interest",
                "TheOutHaven Reserve",
                "QR Growth Tools",
                "Up to 10 photos",
                "Booking, website, phone, and menu links",
                "Full listing customization",
              ]}
            />
          </div>
        </div>
      </section>

      <section className="bg-white px-6 py-20 text-black">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10 text-center">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-[#e1062a]">
              Plan Comparison
            </p>

            <h2 className="mt-4 text-4xl font-black md:text-5xl">
              Free vs Pro
            </h2>
          </div>

          <div className="overflow-hidden rounded-[2rem] border border-black/10 shadow-2xl shadow-black/10">
            <ComparisonRow item="AI discovery" free="Basic" pro="Priority" />
            <ComparisonRow item="Search visibility" free="Standard" pro="Enhanced" />
            <ComparisonRow item="Claim business listing" free="Yes" pro="Yes" />
            <ComparisonRow item="Photos" free="1" pro="Up to 10" />
            <ComparisonRow item="Reservation system" free="—" pro="Included" />
            <ComparisonRow item="Layout builder" free="—" pro="Included" />
            <ComparisonRow item="Hostess/operator view" free="—" pro="Included" />
            <ComparisonRow item="SMS confirmations/reminders" free="—" pro="Included" />
            <ComparisonRow item="Waitlist texting" free="—" pro="Included" />
            <ComparisonRow item="Calendar add" free="—" pro="Included" />
            <ComparisonRow item="Guest notes" free="—" pro="Basic" />
            <ComparisonRow item="Accept reservation requests" free="—" pro="Included" />
            <ComparisonRow item="Real-time reservation dashboard" free="—" pro="Included" />
            <ComparisonRow item="Monitor customer booking interest" free="—" pro="Included" />
            <ComparisonRow item="Analytics" free="Basic views" pro="Advanced insights" />
            <ComparisonRow item="QR growth tools" free="—" pro="Included" />
            <ComparisonRow item="TheOutHaven Reserve" free="—" pro="Included" />
            <ComparisonRow item="Profile customization" free="Limited" pro="Full control" />
            <ComparisonRow item="Best for" free="Getting listed" pro="Growing bookings" />
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-[#070707] px-6 py-20">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-[#e1062a]">
              Pro Reservation Dashboard
            </p>

            <h2 className="mt-4 text-4xl font-black md:text-5xl">
              Monitor reservations in real time.
            </h2>

            <p className="mt-5 text-lg leading-8 text-white/60">
              TheOutHaven Pro gives businesses a dashboard to view reservation
              requests, customer details, booking activity, and customer interest
              as it comes in.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <DashboardFeature
                title="Visual floor maps"
                text="Drag tables, rooms, lanes, courts, sections, and event spaces into a live layout."
              />
              <DashboardFeature
                title="New reservations"
                text="See incoming reservation requests from customers."
              />
              <DashboardFeature
                title="Customer details"
                text="View guest name, date, time, party size, and contact details."
              />
              <DashboardFeature
                title="Booking status"
                text="Track pending, confirmed, declined, and completed reservations."
              />
              <DashboardFeature
                title="Waitlist texting"
                text="Notify guests when their table, room, or lane is ready."
              />
              <DashboardFeature
                title="Growth insights"
                text="Monitor views, clicks, QR scans, reservation interest, and no-shows."
              />
            </div>
          </div>

          <div className="rounded-[2.25rem] border border-white/10 bg-black p-5 shadow-2xl shadow-red-500/10">
            <div className="rounded-[1.75rem] border border-white/10 bg-[#0d0d0d] p-6">
              <div className="flex items-center justify-between border-b border-white/10 pb-5">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.25em] text-[#e1062a]">
                    Live Dashboard
                  </p>
                  <h3 className="mt-2 text-2xl font-black">
                    Reservation Activity
                  </h3>
                </div>

                <span className="rounded-full bg-[#e1062a]/15 px-3 py-2 text-xs font-black text-[#ff8a9b]">
                  Live
                </span>
              </div>

              <div className="mt-6 grid gap-4">
                <DashboardRow
                  name="Dinner Reservation"
                  detail="Tonight · 7:30 PM · Party of 4"
                  status="New"
                />
                <DashboardRow
                  name="Birthday Dinner"
                  detail="Friday · 8:00 PM · Party of 8"
                  status="Pending"
                />
                <DashboardRow
                  name="Date Night Booking"
                  detail="Saturday · 6:45 PM · Party of 2"
                  status="Confirmed"
                />
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                <MiniMetric value="18" label="Requests" />
                <MiniMetric value="11" label="Confirmed" />
                <MiniMetric value="42" label="Profile clicks" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="px-6 py-20">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-[#e1062a]">
              How It Works
            </p>

            <h2 className="mt-4 text-4xl font-black md:text-5xl">
              A simple path from signup to customer action.
            </h2>

            <p className="mt-5 text-lg leading-8 text-white/60">
              TheOutHaven helps your business become discoverable in moments
              when customers are already deciding where to go.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <Step
              number="01"
              title="Choose your plan"
              text="Start with Free or upgrade to Pro for priority placement, reservations, and growth tools."
            />
            <Step
              number="02"
              title="Claim or add your business"
              text="Submit your restaurant, lounge, venue, activity, or experience for review."
            />
            <Step
              number="03"
              title="Build your profile"
              text="Add details, photos, links, categories, and the experiences you want to be known for."
            />
            <Step
              number="04"
              title="Manage reservations"
              text="Pro businesses can monitor reservation requests and customer booking activity from the dashboard."
            />
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-[#070707] px-6 py-20">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 text-center">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-[#e1062a]">
              Who Should Join
            </p>

            <h2 className="mt-4 text-4xl font-black md:text-5xl">
              Built for places people go to experience something.
            </h2>
          </div>

          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            <DarkCard
              title="Restaurants"
              text="Dinner, brunch, rooftops, casual dining, fine dining, and group-friendly spots."
            />
            <DarkCard
              title="Lounges & Nightlife"
              text="Hookah lounges, cocktail lounges, rooftops, bars, music, and late-night experiences."
            />
            <DarkCard
              title="Activities"
              text="Bowling, karaoke, arcades, comedy clubs, museums, paint nights, and games."
            />
            <DarkCard
              title="Venues"
              text="Event spaces, birthday locations, private rooms, and memorable group outing spaces."
            />
          </div>
        </div>
      </section>

      <section className="bg-white px-6 py-20 text-black">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-[#e1062a]">
              Grow With Us
            </p>

            <h2 className="mt-4 text-4xl font-black md:text-5xl">
              Reach customers while TheOutHaven grows.
            </h2>

            <p className="mt-5 text-lg leading-8 text-black/60">
              Join early, strengthen your presence, and position your business
              inside a platform built around outings, discovery, reservations,
              and local experiences.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            <GrowthCard
              title="More discovery"
              text="Be part of customer searches for date nights, birthdays, brunch, and nightlife."
            />
            <GrowthCard
              title="More reservations"
              text="Use the Pro reservation system to turn customer interest into booking requests."
            />
            <GrowthCard
              title="More control"
              text="Use your dashboard to monitor activity, reservations, profile views, and customer interest."
            />
          </div>
        </div>
      </section>

      <section className="px-6 py-24">
        <div className="mx-auto max-w-7xl rounded-[2.5rem] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(225,6,42,0.22),transparent_42%),#080808] p-8 text-center md:p-14">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-[#e1062a]">
            Sign Up Flow
          </p>

          <h2 className="mt-4 text-4xl font-black md:text-6xl">
            Join TheOutHaven in minutes.
          </h2>

          <div className="mx-auto mt-10 grid max-w-5xl gap-5 md:grid-cols-4">
            <Flow title="1. Pick a plan" text="Choose Free or Pro." />
            <Flow title="2. Submit business" text="Add your location details." />
            <Flow title="3. Get reviewed" text="We verify your listing." />
            <Flow
              title="4. Go live"
              text="Start getting discovered and manage reservations if you’re Pro."
            />
          </div>

          <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row">
            <Link
              href="/locations/apply?plan=free"
              className="rounded-2xl bg-[#e1062a] px-9 py-4 text-sm font-black text-white shadow-2xl shadow-red-500/30 transition hover:bg-red-500"
            >
              Start Free →
            </Link>

            <Link
              href={proHref}
              className="rounded-2xl border border-white/15 bg-white px-9 py-4 text-sm font-black text-black transition hover:bg-white/85"
            >
              Upgrade to Pro
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function HeroPoint({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
      <h3 className="font-black text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-white/50">{text}</p>
    </div>
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

function PlanCard({
  title,
  subtitle,
  price,
  period,
  oldPrice,
  note,
  features,
  cta,
  href,
  featured = false,
}: {
  title: string;
  subtitle: string;
  price: string;
  period: string;
  oldPrice?: string;
  note?: string;
  features: string[];
  cta: string;
  href: string;
  featured?: boolean;
}) {
  return (
    <div
      className={`relative flex h-full flex-col rounded-[2.25rem] border p-7 shadow-2xl transition duration-300 hover:-translate-y-2 ${
        featured
          ? "border-[#e1062a]/70 bg-[#14070a] shadow-red-500/20"
          : "border-white/10 bg-black shadow-black/40"
      }`}
    >
      {featured && (
        <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2">
          <span className="whitespace-nowrap rounded-full bg-[#e1062a] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-red-500/30">
            Best For Growth
          </span>
        </div>
      )}

      <h3 className="mt-4 text-3xl font-black">{title}</h3>
      <p className="mt-3 text-sm leading-7 text-white/55">{subtitle}</p>

      <div className="mt-6 flex items-end gap-1">
        <p className="text-5xl font-black">{price}</p>
        <p className="pb-2 text-sm font-bold text-white/45">{period}</p>
      </div>

      {oldPrice && (
        <p className="mt-2 text-sm font-bold text-white/35 line-through">
          {oldPrice}
        </p>
      )}

      {note && (
        <p className="mt-3 rounded-full bg-white/5 px-4 py-2 text-xs font-black text-white/55">
          {note}
        </p>
      )}

      <div className="mt-7 flex-1 space-y-3">
        {features.map((feature) => (
          <div
            key={feature}
            className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
          >
            <p className="text-sm font-semibold leading-6 text-white/65">
              ✓ {feature}
            </p>
          </div>
        ))}
      </div>

      <Link
        href={href}
        className={`mt-7 inline-flex w-full justify-center rounded-2xl px-6 py-4 text-sm font-black transition ${
          featured
            ? "bg-[#e1062a] text-white hover:bg-red-500"
            : "border border-white/15 bg-white/5 text-white/80 hover:bg-white hover:text-black"
        }`}
      >
        {cta}
      </Link>
    </div>
  );
}

function ComparisonRow({
  item,
  free,
  pro,
}: {
  item: string;
  free: string;
  pro: string;
}) {
  return (
    <div className="grid grid-cols-3 border-b border-black/10 bg-white text-sm last:border-b-0 md:text-base">
      <div className="p-4 font-black">{item}</div>
      <div className="border-l border-black/10 p-4 font-semibold text-black/60">
        {free}
      </div>
      <div className="border-l border-black/10 bg-[#fff5f6] p-4 font-black text-[#e1062a]">
        {pro}
      </div>
    </div>
  );
}

function Step({
  number,
  title,
  text,
}: {
  number: string;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-[2rem] border border-white/10 bg-[#0d0d0d] p-7">
      <p className="text-sm font-black text-[#e1062a]">{number}</p>
      <h3 className="mt-4 text-xl font-black">{title}</h3>
      <p className="mt-3 text-sm leading-7 text-white/50">{text}</p>
    </div>
  );
}

function DashboardFeature({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black p-5">
      <h3 className="font-black text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-white/50">{text}</p>
    </div>
  );
}

function DashboardRow({
  name,
  detail,
  status,
}: {
  name: string;
  detail: string;
  status: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <div>
        <p className="font-black text-white">{name}</p>
        <p className="mt-1 text-sm text-white/45">{detail}</p>
      </div>

      <span className="rounded-full bg-[#e1062a] px-3 py-1 text-xs font-black text-white">
        {status}
      </span>
    </div>
  );
}

function MiniMetric({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black p-4 text-center">
      <p className="text-2xl font-black text-white">{value}</p>
      <p className="mt-1 text-xs font-bold text-white/45">{label}</p>
    </div>
  );
}

function DarkCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-[2rem] border border-white/10 bg-black p-6">
      <h3 className="text-xl font-black">{title}</h3>
      <p className="mt-3 text-sm leading-7 text-white/50">{text}</p>
    </div>
  );
}

function GrowthCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-lg shadow-black/5">
      <h3 className="text-xl font-black">{title}</h3>
      <p className="mt-3 text-sm leading-7 text-black/60">{text}</p>
    </div>
  );
}

function Flow({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-[2rem] border border-white/10 bg-black/50 p-6">
      <h3 className="text-lg font-black">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-white/50">{text}</p>
    </div>
  );
}