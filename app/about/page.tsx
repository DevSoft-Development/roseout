import Link from "next/link";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "About TheOutHaven",
  description:
    "Learn how TheOutHaven helps people plan date nights, birthdays, restaurants, activities, and outings faster with AI-powered recommendations.",
  path: "/about",
});
export default function AboutPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <TheOutHavenHeader />

      <section className="relative overflow-hidden px-6 pt-28 pb-24 text-center">
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
            TheOutHaven is an AI-powered outing planner built to help you
            discover restaurants, activities, and experiences that match your
            vibe, location, budget, and mood.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/create"
              className="rounded-2xl bg-[#e1062a] px-8 py-4 text-sm font-black text-white shadow-2xl shadow-red-500/30 transition hover:bg-red-500"
            >
              Plan My Outing →
            </Link>

            <Link
              href="#faq"
              className="rounded-2xl border border-white/15 bg-white/5 px-8 py-4 text-sm font-black text-white/75 transition hover:bg-white hover:text-black"
            >
              Read FAQ
            </Link>
          </div>
        </div>
      </section>

      <section className="px-6 py-20">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-[#e1062a]">
              What TheOutHaven does
            </p>

            <h2 className="mt-4 text-4xl font-black tracking-tight md:text-5xl">
              One sentence in.
              <br />A better plan out.
            </h2>

            <p className="mt-6 text-lg leading-8 text-white/60">
              Instead of searching across multiple apps, TheOutHaven lets you
              describe what you want in plain English. We turn that request into
              a curated outing with restaurants, activities, and useful details.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <InfoCard
              title="Restaurants"
              text="Find dinner, brunch, rooftops, lounges, casual spots, or upscale experiences."
            />
            <InfoCard
              title="Activities"
              text="Pair your meal with karaoke, bowling, comedy, nightlife, museums, games, and more."
            />
            <InfoCard
              title="Vibe Matching"
              text="Search by romantic, fun, luxury, chill, birthday, budget-friendly, or nearby."
            />
            <InfoCard
              title="Faster Decisions"
              text="Get a focused set of options instead of hundreds of random listings."
            />
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-[#070707] px-6 py-20">
        <div className="mx-auto max-w-5xl text-center">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-[#e1062a]">
            Why we built it
          </p>

          <h2 className="mt-4 text-4xl font-black md:text-5xl">
            Planning should feel exciting, not exhausting.
          </h2>

          <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-white/60">
            A night out can start with a simple idea — but quickly turn into
            checking reviews, maps, menus, distance, price, and availability.
            TheOutHaven was built to reduce that friction and help people choose
            with confidence.
          </p>
        </div>
      </section>

      <section className="px-6 py-20">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10 max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-[#e1062a]">
              How to use TheOutHaven
            </p>

            <h2 className="mt-4 text-4xl font-black md:text-5xl">
              Simple enough for quick plans. Smart enough for real outings.
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <Step
              number="01"
              title="Describe the outing"
              text="Type what you want naturally, like “steak dinner and karaoke in Manhattan” or “romantic birthday dinner in Queens.”"
            />

            <Step
              number="02"
              title="Review your matches"
              text="TheOutHaven shows restaurants and activities that fit your request, including details, links, ratings, and location context."
            />

            <Step
              number="03"
              title="Choose and go"
              text="Select your favorites, view more details, visit the business website, or use reservation links when available."
            />
          </div>
        </div>
      </section>

      <section className="bg-white px-6 py-20 text-black">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10 text-center">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-[#e1062a]">
              Who TheOutHaven is for
            </p>

            <h2 className="mt-4 text-4xl font-black md:text-5xl">
              Built for everyday plans and special moments.
            </h2>
          </div>

          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            <LightCard
              title="Date Nights"
              text="Find restaurants and activities that feel intentional, not random."
            />
            <LightCard
              title="Birthdays"
              text="Plan something memorable without spending hours comparing options."
            />
            <LightCard
              title="Friends & Groups"
              text="Find fun outings that work for more than one person’s vibe."
            />
            <LightCard
              title="Quick Plans"
              text="Need something fast? Type the vibe and get options in seconds."
            />
          </div>
        </div>
      </section>

      <section className="px-6 py-20">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1fr_1fr] lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-[#e1062a]">
              Designed for trust
            </p>

            <h2 className="mt-4 text-4xl font-black md:text-5xl">
              TheOutHaven helps you decide. Businesses still control the
              details.
            </h2>

            <p className="mt-6 text-lg leading-8 text-white/60">
              TheOutHaven does not replace restaurants, venues, or reservation
              platforms. We help you discover and compare options faster, then
              direct you to the business or booking source when you’re ready.
            </p>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-[#0d0d0d] p-7">
            <TrustPoint text="Always confirm hours, availability, pricing, and policies directly with the business." />
            <TrustPoint text="Reservation and booking links may lead to third-party platforms." />
            <TrustPoint text="Recommendations are designed to guide discovery, not guarantee availability." />
            <TrustPoint text="TheOutHaven is starting with NYC-area experiences and expanding over time." />
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-[#070707] px-6 py-20">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1fr_0.85fr] lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-[#e1062a]">
              For businesses
            </p>

            <h2 className="mt-4 text-4xl font-black md:text-5xl">
              Own a restaurant, lounge, activity, or venue?
            </h2>

            <p className="mt-6 text-lg leading-8 text-white/60">
              TheOutHaven helps people discover where to go. Businesses can
              benefit from stronger visibility, better listing details, and a
              clearer path from discovery to action.
            </p>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-black p-7">
            <h3 className="text-2xl font-black">Business visibility</h3>

            <p className="mt-3 text-sm leading-7 text-white/55">
              If your location appears on TheOutHaven, users may discover your
              business while planning outings. Claiming your listing helps you
              manage your profile, improve your details, and prepare for
              business tools like analytics and QR claim access.
            </p>

            <Link
              href="/locations/apply"
              className="mt-6 inline-flex rounded-2xl bg-[#e1062a] px-6 py-3 text-sm font-black text-white transition hover:bg-red-500"
            >
              Claim Your Listing →
            </Link>
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
            <FAQ
              q="How do I use TheOutHaven?"
              a="Type what you want in plain English. For example, “romantic dinner in Brooklyn,” “birthday dinner and bowling in Queens,” or “karaoke in Manhattan.” TheOutHaven will return matching restaurants, activities, or both."
            />

            <FAQ
              q="Can TheOutHaven plan both food and activities?"
              a="Yes. TheOutHaven is designed to help combine restaurants and activities into one outing when your request includes both."
            />

            <FAQ
              q="Do I book through TheOutHaven?"
              a="TheOutHaven may show reservation, website, or booking links when available. Final booking, availability, cancellation policies, and pricing are handled by the business or third-party platform."
            />

            <FAQ
              q="Is TheOutHaven free to use?"
              a="You can use TheOutHaven to search and plan outings. Some future features may require an account, subscription, or business plan."
            />

            <FAQ
              q="Does TheOutHaven use my location?"
              a="Only if you choose to allow location access. Location helps TheOutHaven prioritize nearby options. You can also search by borough, neighborhood, city, or zip code."
            />

            <FAQ
              q="Why did TheOutHaven recommend a certain place?"
              a="TheOutHaven considers your request, location, category, vibe, and available listing details. We keep the matching system private, but the goal is simple: better-fit recommendations with less effort."
            />

            <FAQ
              q="What if a listing is wrong?"
              a="Business details can change. Always confirm directly with the business. TheOutHaven may allow owners or authorized representatives to claim and update listings."
            />

            <FAQ
              q="Where is TheOutHaven available?"
              a="TheOutHaven is focused on NYC-area outings first, with plans to expand into more cities and categories over time."
            />

            <FAQ
              q="Can restaurants, activities, or venues be featured?"
              a="TheOutHaven may offer business tools in the future, including claimed profiles, enhanced listings, analytics, and promotional placements."
            />
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
            Tell TheOutHaven what you want and get a focused plan faster.
          </p>

          <Link
            href="/create"
            className="mt-10 inline-flex rounded-2xl bg-[#e1062a] px-10 py-5 text-lg font-black text-white shadow-2xl shadow-red-500/30 transition hover:bg-red-500"
          >
            Plan My Outing →
          </Link>
        </div>
      </section>
    </main>
  );
}

function InfoCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-[2rem] border border-white/10 bg-[#0d0d0d] p-6">
      <h3 className="text-xl font-black">{title}</h3>
      <p className="mt-3 text-sm leading-7 text-white/50">{text}</p>
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
    <div className="rounded-[1.5rem] border border-white/10 bg-[#0d0d0d] p-6">
      <h3 className="text-base font-black text-white">{q}</h3>
      <p className="mt-3 text-sm leading-7 text-white/55">{a}</p>
    </div>
  );
}
