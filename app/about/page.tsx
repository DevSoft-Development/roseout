import Link from "next/link";

import TheOutHavenFooter from "@/components/TheOutHavenFooter";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";

export const metadata = {
  title: "About TheOutHaven",
  description:
    "Learn about TheOutHaven LLC, how we help people plan better outings, and the business platform we provide to restaurants, venues, and local experience operators.",
};

const founderLinkedIn =
  "https://www.linkedin.com/in/nicholas-endeavour-91b65a431/";

const locationCapabilities = [
  {
    number: "01",
    title: "Business profile & discovery",
    text: "Own how your location appears across TheOutHaven with your brand, photos, details, hours, offerings, and the information customers need to choose you.",
  },
  {
    number: "02",
    title: "Reservations & guest management",
    text: "Manage reservations, tables and spaces, waitlists, large groups, guest details, reminders, policies, and the day-of hosting experience from one workspace.",
  },
  {
    number: "03",
    title: "Events & experiences",
    text: "Publish events, experiences, times, availability, and bookable offerings that give customers more reasons to visit your location.",
  },
  {
    number: "04",
    title: "Menus, packages & offers",
    text: "Show the food, drinks, packages, promotions, and signature offerings that make your business the right fit for a specific outing.",
  },
  {
    number: "05",
    title: "Website & domain",
    text: "Create and manage a polished business website and connect your domain so your location can maintain a strong presence beyond its TheOutHaven profile.",
  },
  {
    number: "06",
    title: "Customer relationships",
    text: "Keep up with leads, guests, VIP customers, messages, notifications, reviews, and feedback so interest can turn into lasting relationships.",
  },
  {
    number: "07",
    title: "Marketing & social",
    text: "Plan promotions, create marketing content, connect social accounts, and keep your business visible before and after a customer discovers you.",
  },
  {
    number: "08",
    title: "Performance & insights",
    text: "See how your location is performing across discovery, reservations, customer activity, events, and other business outcomes from a single overview.",
  },
];

const businessTypes = [
  "Restaurants",
  "Bars & lounges",
  "Rooftops",
  "Nightlife venues",
  "Activity venues",
  "Entertainment concepts",
  "Event spaces",
  "Experience operators",
];

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <TheOutHavenHeader />

      <section className="relative overflow-hidden px-6 pb-24 pt-36">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_8%,rgba(225,6,42,0.22),transparent_30%),radial-gradient(circle_at_88%_42%,rgba(225,6,42,0.1),transparent_24%),linear-gradient(180deg,#050505,#090606_72%,#000)]" />
        <div className="absolute inset-x-0 top-20 h-px bg-gradient-to-r from-transparent via-[#e1062a]/45 to-transparent" />

        <div className="relative mx-auto max-w-7xl">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-[#ff8a9b]">
            About TheOutHaven
          </p>
          <div className="mt-6 grid gap-10 lg:grid-cols-[1.08fr_.72fr] lg:items-end">
            <h1 className="max-w-5xl text-5xl font-black leading-[.95] tracking-[-.055em] md:text-7xl lg:text-[5.2rem]">
              One company connecting better outings
              <span className="block text-[#e1062a]">with better local business.</span>
            </h1>
            <p className="max-w-xl text-lg leading-8 text-white/62 lg:justify-self-end">
              TheOutHaven brings people and local businesses together around the moments that matter: where to eat, what to do, where to celebrate, and how to turn an idea into a complete outing.
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
              TheOutHaven is building a better connection between people planning their time out and the local businesses that make those experiences possible.
            </p>
            <p>
              For consumers, that means one place to discover restaurants, activities, nightlife, entertainment, and complete outings. For businesses, it means a place to be discovered, present what makes the location special, manage the customer experience, and grow the relationship after discovery.
            </p>
            <p>
              We are starting in New York City and Long Island, with a long-term vision of becoming the place people turn to when they decide to go out—and the platform local businesses use to be ready when they do.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-white px-6 py-20 text-black lg:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-12 lg:grid-cols-[.9fr_1.1fr] lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-[#e1062a]">Why we exist</p>
              <h2 className="mt-4 text-4xl font-black tracking-[-0.045em] md:text-5xl">
                Discovery should end with a decision—not another search.
              </h2>
            </div>
            <p className="max-w-2xl text-lg leading-8 text-black/58 lg:justify-self-end">
              People often know the kind of experience they want before they know the exact places. TheOutHaven helps turn that intent into a plan while giving strong local businesses a better opportunity to become part of it.
            </p>
          </div>

          <div className="mt-14 grid gap-5 md:grid-cols-3">
            <CompanyCard number="01" title="Plan the whole outing" text="Bring restaurants, activities, nightlife, and experiences into the same decision." />
            <CompanyCard number="02" title="Make the right match" text="Consider the occasion, area, timing, atmosphere, preferences, and the way the outing should flow." />
            <CompanyCard number="03" title="Connect people with places" text="Help discovery lead to reservations, bookings, visits, and stronger customer relationships." />
          </div>
        </div>
      </section>

      <section className="px-6 py-20 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-4xl">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#ff8a9b]">For people</p>
            <h2 className="mt-4 text-4xl font-black tracking-[-0.045em] md:text-5xl">
              A better way to decide where to go next.
            </h2>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-white/58">
              Start with an occasion, a neighborhood, a restaurant, an activity, or simply the feeling you want. TheOutHaven helps bring the pieces together so the plan feels complete.
            </p>
          </div>

          <div className="mt-12 grid gap-px overflow-hidden rounded-[2rem] border border-white/10 bg-white/10 md:grid-cols-2">
            <DarkCompanyCard title="Restaurants & drinks" text="Discover dining, brunch, rooftops, lounges, date-night options, and special-occasion places that fit the plan." />
            <DarkCompanyCard title="Activities & entertainment" text="Find comedy, bowling, karaoke, museums, games, live entertainment, nightlife, and more ways to keep the outing going." />
            <DarkCompanyCard title="Area-first planning" text="Explore by borough, neighborhood, or town when location matters as much as the places themselves." />
            <DarkCompanyCard title="Complete outings" text="Move beyond finding one place and build a plan where the stops and experience make sense together." />
          </div>

          <Link href="/#plan-your-outing" className="mt-10 inline-flex rounded-full bg-[#e1062a] px-8 py-4 text-sm font-black text-white transition hover:bg-[#ff1744]">
            Plan an Outing
          </Link>
        </div>
      </section>

      <section className="relative overflow-hidden border-y border-white/10 bg-[#120606] px-6 py-20 lg:py-28">
        <div className="absolute right-[-8rem] top-[-8rem] h-96 w-96 rounded-full bg-[#e1062a]/10 blur-3xl" />
        <div className="relative mx-auto max-w-7xl">
          <div className="grid gap-12 lg:grid-cols-[.82fr_1.18fr] lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-[#ff8a9b]">For businesses & locations</p>
              <h2 className="mt-4 text-4xl font-black tracking-[-0.045em] md:text-6xl">
                More than a listing. A place to run and grow the customer experience.
              </h2>
            </div>
            <div>
              <p className="text-lg leading-8 text-white/62">
                TheOutHaven gives local businesses a dedicated workspace built around the full customer journey—from being discovered to hosting the visit and building the next relationship.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link href="/business" className="inline-flex justify-center rounded-full bg-white px-7 py-3.5 text-sm font-black text-black transition hover:bg-white/90">
                  For Businesses
                </Link>
                <Link href="/business/claim" className="inline-flex justify-center rounded-full border border-white/20 px-7 py-3.5 text-sm font-black text-white transition hover:bg-white hover:text-black">
                  Claim Your Location
                </Link>
              </div>
            </div>
          </div>

          <div className="mt-14 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {locationCapabilities.map((item) => (
              <BusinessCapability key={item.number} {...item} />
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white px-6 py-20 text-black lg:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-12 lg:grid-cols-[.82fr_1.18fr] lg:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-[#e1062a]">Who we serve</p>
              <h2 className="mt-4 text-4xl font-black tracking-[-0.045em] md:text-5xl">
                Built for the businesses that make going out worth it.
              </h2>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-black/58">
                Whether the customer is planning dinner, a celebration, a night out, or an activity, TheOutHaven is designed to help the right location become part of the plan.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {businessTypes.map((type) => (
                <div key={type} className="rounded-2xl border border-black/10 bg-[#f7f7f7] px-4 py-6 text-center text-sm font-black text-black/70">
                  {type}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-20 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-12 lg:grid-cols-[.75fr_1.25fr]">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-[#ff8a9b]">What guides us</p>
              <h2 className="mt-4 text-4xl font-black tracking-[-0.04em] md:text-5xl">
                Build value on both sides of the outing.
              </h2>
            </div>
            <div className="grid gap-6 sm:grid-cols-2">
              <Principle title="Useful over overwhelming" text="People should get closer to a decision, not simply receive more choices." />
              <Principle title="The outing over the listing" text="A location matters because of how it fits the experience a person is trying to create." />
              <Principle title="Local businesses matter" text="Restaurants, venues, and experience operators are not inventory—they are the reason memorable outings exist." />
              <Principle title="Relationships over clicks" text="The strongest outcome is not just discovery. It is a customer who chooses, visits, returns, and remembers the business." />
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-[#080808] px-6 py-20 lg:py-24">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#e1062a]">Where we’re starting</p>
            <h2 className="mt-4 text-4xl font-black tracking-[-0.04em] md:text-5xl">
              New York first. Built for what comes next.
            </h2>
            <p className="mt-6 text-lg leading-8 text-white/60">
              New York City and Long Island are our starting markets because few places offer more variety in food, entertainment, neighborhoods, culture, and nightlife. We are building the company here with a model designed to expand to more markets over time.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island", "Long Island"].map((area) => (
              <div key={area} className="rounded-2xl border border-white/10 bg-white/[.035] px-4 py-5 text-center text-sm font-black text-white/72">
                {area}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-20 lg:py-24">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_90%_10%,rgba(225,6,42,.2),transparent_30%),#0a0a0a] p-8 sm:p-10 lg:p-12">
          <div className="max-w-4xl">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#ff8a9b]">Our direction</p>
            <h2 className="mt-4 text-4xl font-black tracking-[-0.045em] md:text-5xl">
              Become part of the moment people decide to go out—and the place businesses are ready to meet them.
            </h2>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-white/60">
              TheOutHaven is building toward a future where planning, discovery, reservations, experiences, customer relationships, and business growth feel connected instead of fragmented.
            </p>
          </div>
        </div>
      </section>

      <section className="border-t border-white/10 px-6 py-16">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-[#e1062a]">Founder & CEO</p>
            <h2 className="mt-2 text-2xl font-black">Nicholas Endeavour</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/48">
              Nicholas Endeavour founded TheOutHaven and leads the company’s direction and development.
            </p>
          </div>
          <a href={founderLinkedIn} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 rounded-full border border-white/15 px-6 py-3 text-sm font-black text-white transition hover:bg-white hover:text-black">
            LinkedIn ↗
          </a>
        </div>
      </section>

      <section className="relative overflow-hidden px-6 py-24 text-center">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(225,6,42,0.18),transparent_38%)]" />
        <div className="relative mx-auto max-w-4xl">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-[#ff8a9b]">TheOutHaven</p>
          <h2 className="mt-4 text-5xl font-black tracking-[-0.05em] md:text-6xl">
            Better plans. Stronger local businesses.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-white/55">
            Discover your next outing or bring your business into the experience.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/#plan-your-outing" className="inline-flex rounded-full bg-[#e1062a] px-9 py-4 text-sm font-black text-white transition hover:bg-[#ff1744]">
              Plan an Outing
            </Link>
            <Link href="/business" className="inline-flex rounded-full border border-white/15 px-9 py-4 text-sm font-black text-white transition hover:bg-white hover:text-black">
              Explore Business Tools
            </Link>
          </div>
        </div>
      </section>

      <TheOutHavenFooter />
    </main>
  );
}

function CompanyCard({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <article className="rounded-[1.75rem] border border-black/10 bg-[#f7f7f7] p-7">
      <p className="text-xs font-black tracking-[0.2em] text-[#e1062a]">{number}</p>
      <h3 className="mt-5 text-2xl font-black tracking-[-0.03em]">{title}</h3>
      <p className="mt-4 text-sm leading-7 text-black/58">{text}</p>
    </article>
  );
}

function DarkCompanyCard({ title, text }: { title: string; text: string }) {
  return (
    <article className="bg-[#0a0a0a] p-7 sm:p-9">
      <h3 className="text-2xl font-black tracking-[-0.03em]">{title}</h3>
      <p className="mt-4 max-w-xl text-sm leading-7 text-white/52">{text}</p>
    </article>
  );
}

function BusinessCapability({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <article className="group rounded-[1.6rem] border border-white/10 bg-black/35 p-6 transition hover:border-[#e1062a]/45 hover:bg-black/50">
      <div className="flex items-center justify-between gap-4">
        <span className="text-xs font-black tracking-[0.2em] text-[#ff8a9b]">{number}</span>
        <span className="h-px flex-1 bg-gradient-to-r from-[#e1062a]/45 to-transparent" />
      </div>
      <h3 className="mt-6 text-xl font-black tracking-[-0.025em]">{title}</h3>
      <p className="mt-3 text-sm leading-7 text-white/52">{text}</p>
    </article>
  );
}

function Principle({ title, text }: { title: string; text: string }) {
  return (
    <article className="border-t border-white/10 pt-5">
      <h3 className="text-xl font-black">{title}</h3>
      <p className="mt-3 text-sm leading-7 text-white/52">{text}</p>
    </article>
  );
}
