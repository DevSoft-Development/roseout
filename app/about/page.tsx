import Link from "next/link";

import TheOutHavenFooter from "@/components/TheOutHavenFooter";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";

export const metadata = {
  title: "About TheOutHaven",
  description:
    "Learn about TheOutHaven LLC, our mission, how we help people plan better outings, and how we help local businesses become part of those plans.",
};

const founderLinkedIn =
  "https://www.linkedin.com/in/nicholas-endeavour-91b65a431/";

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
          <div className="mt-6 grid gap-10 lg:grid-cols-[1.05fr_.75fr] lg:items-end">
            <div>
              <h1 className="max-w-5xl text-5xl font-black leading-[.95] tracking-[-.055em] md:text-7xl lg:text-[5.2rem]">
                We’re changing the way people decide
                <span className="block text-[#e1062a]">where to go next.</span>
              </h1>
            </div>
            <p className="max-w-xl text-lg leading-8 text-white/62 lg:justify-self-end">
              TheOutHaven is a New York company built around one simple idea: planning a great day or night out should feel exciting, not exhausting.
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
              TheOutHaven brings the pieces of an outing together in one place. Instead of making people search separately for dinner, drinks, activities, neighborhoods, and what to do next, we help them think about the entire experience from the beginning.
            </p>
            <p>
              We are starting with New York City and Long Island, two places where people have nearly endless choices but still spend too much time figuring out which choices actually work together.
            </p>
            <p>
              Our goal is bigger than helping someone find a restaurant or an activity. We want TheOutHaven to become the place people turn to when they know they want to go out, celebrate, explore, spend time together, or simply do something different.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-white px-6 py-20 text-black lg:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-12 lg:grid-cols-[.85fr_1.15fr] lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-[#e1062a]">Why we exist</p>
              <h2 className="mt-4 text-4xl font-black tracking-[-0.045em] md:text-5xl">
                Going out should not feel like research.
              </h2>
            </div>
            <p className="max-w-2xl text-lg leading-8 text-black/58 lg:justify-self-end">
              People often know the feeling they want before they know the exact places. A romantic night. A birthday that feels special. Dinner and something fun nearby. The hard part is turning that idea into a plan without losing an hour to tabs, maps, reviews, and group chats.
            </p>
          </div>

          <div className="mt-14 grid gap-5 md:grid-cols-3">
            <CompanyCard number="01" title="Bring the night together" text="Restaurants, activities, nightlife, and local experiences should work as one outing, not separate searches." />
            <CompanyCard number="02" title="Make choices feel easier" text="The right recommendation depends on the occasion, the area, the people, the timing, and the mood." />
            <CompanyCard number="03" title="Help people act" text="Discovery matters most when it leads to a decision, a reservation, a visit, or a memorable experience." />
          </div>
        </div>
      </section>

      <section className="px-6 py-20 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#ff8a9b]">What TheOutHaven brings together</p>
            <h2 className="mt-4 text-4xl font-black tracking-[-0.045em] md:text-5xl">
              One destination for the entire outing.
            </h2>
          </div>

          <div className="mt-12 grid gap-px overflow-hidden rounded-[2rem] border border-white/10 bg-white/10 md:grid-cols-2">
            <DarkCompanyCard title="Restaurants & drinks" text="From casual neighborhood favorites to rooftops, lounges, brunch, date-night tables, and special-occasion dining." />
            <DarkCompanyCard title="Activities & entertainment" text="Comedy, karaoke, bowling, museums, games, nightlife, live entertainment, and more ways to keep the outing going." />
            <DarkCompanyCard title="Neighborhood discovery" text="Plan around the borough, town, or area that fits the people, travel time, atmosphere, and occasion." />
            <DarkCompanyCard title="Complete outings" text="Move beyond finding one place and start thinking about how the stops, timing, and experience fit together." />
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-[#120606] px-6 py-20 lg:py-24">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#ff8a9b]">For people</p>
            <h2 className="mt-4 text-4xl font-black tracking-[-0.045em] md:text-5xl">
              Built around the way plans really happen.
            </h2>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/62">
              Sometimes the plan starts with a restaurant. Sometimes it starts with the occasion. Sometimes it is simply “we want to do something tonight.” TheOutHaven is designed to meet people at that starting point and help them move toward a complete plan.
            </p>
            <Link href="/create" className="mt-8 inline-flex rounded-full bg-[#e1062a] px-8 py-4 text-sm font-black text-white transition hover:bg-[#ff1744]">
              Plan an Outing
            </Link>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-black/35 p-7 sm:p-9">
            {["Start with the occasion, not just a category.", "Bring food and things to do into the same decision.", "Consider the area and the flow of the outing.", "Explore places that fit the kind of experience you want.", "Choose a plan that feels right for your group."].map((text) => (
              <div key={text} className="flex gap-4 border-b border-white/10 py-5 first:pt-0 last:border-0 last:pb-0">
                <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#e1062a]/15 text-xs font-black text-[#ff8a9b]">✓</span>
                <p className="text-base font-semibold leading-7 text-white/66">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white px-6 py-20 text-black lg:py-24">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#e1062a]">For local businesses</p>
            <h2 className="mt-4 text-4xl font-black tracking-[-0.045em] md:text-5xl">
              Better discovery should create better opportunities.
            </h2>
            <p className="mt-6 text-lg leading-8 text-black/58">
              TheOutHaven is also being built for the restaurants, venues, attractions, nightlife businesses, and experience providers that make local outings possible.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <LightPoint title="Be discoverable" text="Help the right people find your business when it fits the outing they already want." />
            <LightPoint title="Tell a fuller story" text="Give people the details, photos, offerings, and reasons they need to choose your location." />
            <LightPoint title="Turn interest into action" text="Create a clearer path from discovery to reservations, bookings, visits, and customer relationships." />
            <LightPoint title="Grow with TheOutHaven" text="Take part in a local discovery experience designed around complete plans instead of isolated listings." />
          </div>
        </div>
      </section>

      <section className="px-6 py-20 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-12 lg:grid-cols-[.75fr_1.25fr]">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-[#ff8a9b]">What guides us</p>
              <h2 className="mt-4 text-4xl font-black tracking-[-0.04em] md:text-5xl">
                A better way to discover local experiences.
              </h2>
            </div>
            <div className="grid gap-6 sm:grid-cols-2">
              <Principle title="Useful over overwhelming" text="More choices are not always better. We focus on helping people get closer to a decision." />
              <Principle title="The outing over the listing" text="A place matters because of how it fits the full experience a person is trying to create." />
              <Principle title="Local businesses matter" text="Great outings depend on the restaurants, venues, and local operators that give neighborhoods their character." />
              <Principle title="Trust matters" text="People should understand what they are choosing, where information comes from, and when details should be confirmed with a business." />
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-[#080808] px-6 py-20 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-[#e1062a]">Where we’re starting</p>
              <h2 className="mt-4 text-4xl font-black tracking-[-0.04em] md:text-5xl">
                New York first. Built for what comes next.
              </h2>
              <p className="mt-6 text-lg leading-8 text-white/60">
                New York City and Long Island are the starting point because few markets offer more variety in food, entertainment, neighborhoods, culture, and nightlife. That variety makes the opportunity clear: people do not need more places to search. They need a better way to turn all those choices into a plan.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island", "Long Island"].map((area) => (
                <div key={area} className="rounded-2xl border border-white/10 bg-white/[.035] px-4 py-5 text-center text-sm font-black text-white/72">{area}</div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-20 lg:py-24">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_90%_10%,rgba(225,6,42,.2),transparent_30%),#0a0a0a] p-8 sm:p-10 lg:p-12">
          <div className="max-w-4xl">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#ff8a9b]">Our direction</p>
            <h2 className="mt-4 text-4xl font-black tracking-[-0.045em] md:text-5xl">
              We want TheOutHaven to become part of the moment people decide to go out.
            </h2>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-white/60">
              Over time, that means helping more people plan with confidence, helping more local businesses become part of those plans, and expanding the experience into more cities and more kinds of outings while keeping the same simple promise: make planning feel easier.
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
            Make the plan. Enjoy the outing.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-white/55">
            Discover restaurants, activities, nightlife, and experiences across New York City and Long Island.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/create" className="inline-flex rounded-full bg-[#e1062a] px-9 py-4 text-sm font-black text-white transition hover:bg-[#ff1744]">Plan an Outing</Link>
            <Link href="/explore" className="inline-flex rounded-full border border-white/15 px-9 py-4 text-sm font-black text-white transition hover:bg-white hover:text-black">Explore Places</Link>
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

function LightPoint({ title, text }: { title: string; text: string }) {
  return (
    <article className="rounded-[1.5rem] border border-black/10 bg-[#f7f7f7] p-6">
      <h3 className="text-lg font-black">{title}</h3>
      <p className="mt-3 text-sm leading-7 text-black/58">{text}</p>
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
