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
              Get Discovered with TheOutHaven. Manage Reservations with TheOutHaven Reserve.
            </h1>

            <p className="mt-6 max-w-3xl text-lg leading-8 text-white/60">
              TheOutHaven helps restaurants, lounges, nightlife venues, and
              activity spaces attract customers through curated discovery and
              manage reservations with TheOutHaven Reserve.
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
                Discovery + Reserve
              </p>

              <h2 className="mt-4 text-3xl font-black">
                Discovery for guests. Reserve for operations.
              </h2>

              <div className="mt-6 space-y-4">
                <HeroPoint
                  title="Curated discovery"
                  text="TheOutHaven helps guests find the right restaurants, lounges, nightlife, and experiences."
                />
                <HeroPoint
                  title="TheOutHaven Reserve"
                  text="Run reservations, waitlists, reminders, and guest details with a dedicated hospitality product."
                />
                <HeroPoint
                  title="TheOutHaven Reserve Dashboard"
                  text="Give your team a live operating view for reservations, waitlists, and guest flow."
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 pb-16">
        <div className="mx-auto grid max-w-7xl gap-5 md:grid-cols-4">
          <Stat value="Discovery" label="Appear in customer searches" />
          <Stat value="Reserve" label="Power guest bookings" />
          <Stat value="Operations" label="Manage the floor in real time" />
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
                TheOutHaven Discovery gives your business a polished presence in
                curated recommendations. TheOutHaven Reserve adds the operational
                tools to convert discovery into managed reservations.
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
              title="TheOutHaven Discovery"
              subtitle="For businesses that want curated visibility across TheOutHaven."
              price="$0"
              period="/mo"
              href="/locations/apply?plan=free"
              cta="Start TheOutHaven Discovery"
              features={[
                "Discovery visibility",
                "Business profile",
                "Photos/contact/social links",
                "External reservation links",
                "QR tools",
                "Recommendation placement",
              ]}
            />

            <PlanCard
              featured
              title="TheOutHaven Reserve"
              subtitle="For hospitality teams that need reservations, floor operations, guest messaging, and insights."
              price={proPrice}
              period="/mo"
              oldPrice={isYearly ? "$99/mo" : undefined}
              note={isYearly ? "Billed yearly at $948/year" : "Monthly billing"}
              href={proHref}
              cta={isYearly ? "Choose Yearly Reserve" : "Choose Monthly Reserve"}
              features={[
                "TheOutHaven Reserve reservations",
                "Layout builder",
                "Live hostess dashboard",
                "SMS reminders",
                "Waitlist texting",
                "Calendar add",
                "Guest notes",
                "Analytics",
                "No cover fees",
              ]}
            />
          </div>
        </div>
      </section>

      <section className="bg-white px-6 py-20 text-black">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10 text-center">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-[#e1062a]">
              Brand Structure
            </p>

            <h2 className="mt-4 text-4xl font-black md:text-5xl">
              TheOutHaven Discovery vs TheOutHaven Reserve
            </h2>
          </div>

          <div className="overflow-hidden rounded-[2rem] border border-black/10 shadow-2xl shadow-black/10">
            <ComparisonRow item="Discovery visibility" free="Included" pro="Included" />
            <ComparisonRow item="Business profile" free="Included" pro="Included" />
            <ComparisonRow item="Photos/contact/social links" free="Included" pro="Included" />
            <ComparisonRow item="External reservation links" free="Included" pro="Included" />
            <ComparisonRow item="QR tools" free="Included" pro="Included" />
            <ComparisonRow item="Recommendation placement" free="Included" pro="Enhanced" />
            <ComparisonRow item="TheOutHaven Reserve reservations" free="—" pro="Included" />
            <ComparisonRow item="Layout builder" free="—" pro="Included" />
            <ComparisonRow item="Live hostess dashboard" free="—" pro="Included" />
            <ComparisonRow item="TheOutHaven Reserve SMS Reminders" free="—" pro="Included" />
            <ComparisonRow item="TheOutHaven Reserve Waitlist" free="—" pro="Included" />
            <ComparisonRow item="Calendar add" free="—" pro="Included" />
            <ComparisonRow item="Guest notes" free="—" pro="Included" />
            <ComparisonRow item="Analytics" free="—" pro="Included" />
            <ComparisonRow item="No cover fees" free="—" pro="Included" />
            <ComparisonRow item="Best use" free="Discovery/experience" pro="Operational hospitality software" />
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-[#070707] px-6 py-20">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-[#e1062a]">
              TheOutHaven Reserve
            </p>

            <h2 className="mt-4 text-4xl font-black md:text-5xl">
              Unlock TheOutHaven Reserve
            </h2>

            <p className="mt-5 text-lg leading-8 text-white/60">
              TheOutHaven Reserve gives hospitality teams a premium operating
              layer for reservations, floor layouts, guest messaging, waitlists,
              and real-time visibility.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <OperationsFeature
                title="TheOutHaven Reserve Layout Builder"
                text="Drag tables, rooms, lanes, courts, sections, and event spaces into a live layout."
              />
              <OperationsFeature
                title="TheOutHaven Reserve Reservations"
                text="Accept, confirm, and organize booking requests from one clean workspace."
              />
              <OperationsFeature
                title="Guest notes"
                text="Keep names, party sizes, preferences, occasions, and contact details close to the reservation."
              />
              <OperationsFeature
                title="Reservation status"
                text="Track pending, confirmed, declined, completed, and waitlisted guests."
              />
              <OperationsFeature
                title="TheOutHaven Reserve Waitlist"
                text="Send TheOutHaven Reserve Waitlist updates when a table, room, lane, or section is ready."
              />
              <OperationsFeature
                title="Reserve analytics"
                text="Understand demand, profile clicks, reservation activity, and guest patterns."
              />
            </div>
          </div>

          <div className="rounded-[2.25rem] border border-white/10 bg-black p-5 shadow-2xl shadow-red-500/10">
            <div className="rounded-[1.75rem] border border-white/10 bg-[#0d0d0d] p-6">
              <div className="flex items-center justify-between border-b border-white/10 pb-5">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.25em] text-[#e1062a]">
                    Live Operations
                  </p>
                  <h3 className="mt-2 text-2xl font-black">
                    Powered by TheOutHaven Reserve
                  </h3>
                </div>

                <span className="rounded-full bg-[#e1062a]/15 px-3 py-2 text-xs font-black text-[#ff8a9b]">
                  Live
                </span>
              </div>

              <div className="mt-6 grid gap-4">
                <OperationsRow
                  name="Dinner Reservation"
                  detail="Tonight · 7:30 PM · Party of 4"
                  status="New"
                />
                <OperationsRow
                  name="Birthday Dinner"
                  detail="Friday · 8:00 PM · Party of 8"
                  status="Pending"
                />
                <OperationsRow
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
              text="Start with TheOutHaven Discovery or unlock TheOutHaven Reserve for reservations and guest management."
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
              title="Launch TheOutHaven Reserve"
              text="TheOutHaven Reserve helps teams manage bookings, waitlists, reminders, guest notes, and analytics."
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
              inside a platform built around curated discovery and dedicated
              hospitality operations with TheOutHaven Reserve.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            <GrowthCard
              title="More discovery"
              text="Be part of customer searches for date nights, birthdays, brunch, and nightlife."
            />
            <GrowthCard
              title="More operational control"
              text="Use TheOutHaven Reserve to turn customer interest into managed reservations, reminders, and guest records."
            />
            <GrowthCard
              title="More control"
              text="Use TheOutHaven Reserve to monitor bookings, waitlists, profile views, and guest interest."
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
            <Flow title="1. Pick a plan" text="Choose TheOutHaven Discovery or TheOutHaven Reserve." />
            <Flow title="2. Submit business" text="Add your location details." />
            <Flow title="3. Get reviewed" text="We verify your listing." />
            <Flow
              title="4. Go live"
              text="Start getting discovered with TheOutHaven and manage reservations with TheOutHaven Reserve."
            />
          </div>

          <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row">
            <Link
              href="/locations/apply?plan=free"
              className="rounded-2xl bg-[#e1062a] px-9 py-4 text-sm font-black text-white shadow-2xl shadow-red-500/30 transition hover:bg-red-500"
            >
              Start TheOutHaven Discovery →
            </Link>

            <Link
              href={proHref}
              className="rounded-2xl border border-white/15 bg-white px-9 py-4 text-sm font-black text-black transition hover:bg-white/85"
            >
              Unlock Reserve
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

function OperationsFeature({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black p-5">
      <h3 className="font-black text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-white/50">{text}</p>
    </div>
  );
}

function OperationsRow({
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