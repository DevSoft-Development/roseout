import type { Metadata } from "next";
import Link from "next/link";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";

export const metadata: Metadata = {
  title: "TheOutHaven | Plan a Better Outing Faster",
  description:
    "Plan a clean restaurant, activity, lounge, or date-night itinerary with TheOutHaven in one guided flow.",
  alternates: {
    canonical: "https://www.theouthaven.com",
  },
  openGraph: {
    title: "TheOutHaven | Plan a Better Outing Faster",
    description:
      "Tell TheOutHaven the vibe, location, and occasion, then preview a clear restaurant-and-activity plan.",
    url: "https://www.theouthaven.com",
    siteName: "TheOutHaven",
    type: "website",
  },
};

const HOMEPAGE_VERSION = "home-conversion-redesign-2026-05-10";

const featuredDateIdeas = [
  {
    title: "Dinner + a second stop",
    meta: "Most popular",
    description:
      "Pair a restaurant with a nearby lounge, dessert bar, or walkable add-on so the night has momentum.",
    prompt: "dinner and a second stop nearby",
  },
  {
    title: "Activity before food",
    meta: "Fun first",
    description:
      "Start with bowling, comedy, games, or live music, then land somewhere easy for food and conversation.",
    prompt: "fun activity before dinner nearby",
  },
  {
    title: "Low-key romantic plan",
    meta: "Date-night ready",
    description:
      "Find the cozy table, the right neighborhood, and one simple backup if you decide to keep going.",
    prompt: "low key romantic dinner and drinks",
  },
];

const categories = [
  { label: "Restaurants", icon: "🍽️", prompt: "restaurants near me" },
  { label: "Lounges", icon: "🍸", prompt: "lounges near me" },
  { label: "Activities", icon: "🎯", prompt: "activities near me" },
  { label: "Rooftops", icon: "🌇", prompt: "rooftop drinks" },
  { label: "Comedy", icon: "🎤", prompt: "comedy show and food" },
  { label: "Bowling", icon: "🎳", prompt: "bowling and dinner" },
  { label: "Dessert", icon: "🍰", prompt: "dessert after dinner" },
  { label: "Live music", icon: "🎶", prompt: "live music and dinner" },
];

const steps = [
  {
    title: "Describe the night",
    text: "Tell us the vibe, area, budget, craving, occasion, or one place you already have in mind.",
  },
  {
    title: "Review the shortlist",
    text: "See organized matches with practical outing context, add-on ideas, and simple plan notes.",
  },
  {
    title: "Pick and go",
    text: "Choose the strongest route, keep a backup, and head out with fewer tabs and less second guessing.",
  },
];

const betaFeedback = [
  {
    quote: "It gave me the whole night instead of another list of places.",
    person: "Beta feedback · Queens",
  },
  {
    quote: "The second-stop ideas made dinner feel like an actual date plan.",
    person: "Beta feedback · Date night",
  },
  {
    quote: "I liked that I could type the way I talk to friends.",
    person: "Beta feedback · Long Island",
  },
  {
    quote: "The preview made the choice feel obvious in under a minute.",
    person: "Beta feedback · Activity first",
  },
  {
    quote: "Cleaner than bouncing between maps, reviews, and group texts.",
    person: "Beta feedback · Restaurant first",
  },
];

const createPreviewResults = [
  {
    name: "Candlelit Italian spot",
    type: "Dinner",
    note: "Astoria · $$ · Strong date vibe",
  },
  {
    name: "Listening bar nearby",
    type: "Second stop",
    note: "0.5 mi away · cocktails · open late",
  },
  {
    name: "Dessert backup",
    type: "Keep going",
    note: "Walkable · easy reservation fallback",
  },
];

export default function HomePage() {
  return (
    <main
      data-homepage-version={HOMEPAGE_VERSION}
      className="min-h-screen overflow-hidden bg-[#070707] text-white"
    >
      <TheOutHavenHeader />

      <section className="relative isolate px-5 pb-20 pt-32 sm:px-6 lg:pb-28 lg:pt-40">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_18%,rgba(225,6,42,0.28),transparent_28%),radial-gradient(circle_at_85%_10%,rgba(255,255,255,0.12),transparent_22%),linear-gradient(180deg,#151515_0%,#070707_64%)]" />
        <div className="absolute left-1/2 top-24 -z-10 h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-[#e1062a]/10 blur-3xl" />

        <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1.02fr_0.98fr]">
          <div className="max-w-4xl">
            <p className="inline-flex rounded-full border border-white/10 bg-white/[0.07] px-4 py-2 text-xs font-black uppercase tracking-[0.28em] text-red-200 shadow-2xl shadow-black/20">
              Date nights · birthdays · group plans
            </p>

            <h1 className="mt-7 max-w-5xl text-5xl font-black leading-[0.9] tracking-tight sm:text-7xl lg:text-8xl">
              Stop searching. Start going out.
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/66 sm:text-xl">
              TheOutHaven turns one idea into a clean outing plan with the
              right restaurant, activity, second stop, and backup.
            </p>

            <div className="mt-9 flex flex-col gap-4 sm:flex-row sm:items-center">
              <Link
                href="/create"
                className="inline-flex items-center justify-center rounded-full bg-[#e1062a] px-9 py-5 text-base font-black text-white shadow-2xl shadow-red-600/30 transition hover:-translate-y-0.5 hover:bg-red-500"
              >
                Plan My Outing
              </Link>
              <p className="text-sm font-bold text-white/45">
                No overthinking. Just a plan that feels ready.
              </p>
            </div>
          </div>

          <HeroPlannerCard />
        </div>
      </section>

      <section className="border-y border-white/10 bg-black px-5 py-16 sm:px-6 lg:py-20">
        <div className="mx-auto max-w-7xl">
          <SectionIntro
            eyebrow="Featured date ideas"
            title="Start with a proven plan. Customize the details."
            text="Choose a direction in one tap, then let /create tune the neighborhood, vibe, timing, and backup options."
          />

          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {featuredDateIdeas.map((idea) => (
              <Link
                key={idea.title}
                href={`/create?prompt=${encodeURIComponent(idea.prompt)}`}
                className="group flex min-h-[18rem] flex-col justify-between rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 transition hover:-translate-y-1 hover:border-red-500/55 hover:bg-red-500/10"
              >
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.24em] text-red-300">
                    {idea.meta}
                  </p>
                  <h2 className="mt-7 text-2xl font-black tracking-tight sm:text-3xl">
                    {idea.title}
                  </h2>
                  <p className="mt-4 text-sm leading-7 text-white/58">
                    {idea.description}
                  </p>
                </div>
                <p className="mt-8 text-sm font-black text-white transition group-hover:text-red-200">
                  Try this idea →
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#080808] px-5 py-16 sm:px-6 lg:py-20">
        <div className="mx-auto max-w-7xl">
          <SectionIntro
            eyebrow="Categories"
            title="Tell us where to begin. We will connect the rest."
            text="Jump into the kind of outing you want: food, drinks, activities, entertainment, dessert, or a mix of everything."
          />

          <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {categories.map((category) => (
              <Link
                key={category.label}
                href={`/create?prompt=${encodeURIComponent(category.prompt)}`}
                className="group rounded-3xl border border-white/10 bg-black p-4 text-center transition hover:-translate-y-1 hover:border-red-500/50 hover:bg-white/[0.06]"
              >
                <span className="block text-3xl transition group-hover:scale-110">
                  {category.icon}
                </span>
                <span className="mt-3 block text-sm font-black text-white/72 group-hover:text-white">
                  {category.label}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white px-5 py-20 text-black sm:px-6">
        <div className="mx-auto max-w-7xl">
          <SectionIntro
            eyebrow="How it works"
            title="Three steps from maybe to booked."
            text="The homepage is built to move people into the planner quickly, then help them decide with confidence."
            light
          />

          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {steps.map((step, index) => (
              <article
                key={step.title}
                className="rounded-[2rem] border border-black/10 bg-[#f7f7f7] p-7 shadow-xl shadow-black/5"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black text-sm font-black text-white">
                  0{index + 1}
                </span>
                <h2 className="mt-8 text-2xl font-black tracking-tight">
                  {step.title}
                </h2>
                <p className="mt-3 text-sm leading-7 text-black/60">
                  {step.text}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-black px-5 py-16 sm:px-6 lg:py-20">
        <div className="mx-auto max-w-7xl">
          <SectionIntro
            eyebrow="Beta feedback"
            title="Early users want the same thing: fewer tabs."
            text="A left-to-right feedback reel from people testing the planner before a night out."
          />
        </div>

        <div className="relative mt-10 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
          <div className="testimonial-track flex w-max gap-4 pr-4">
            {[...betaFeedback, ...betaFeedback].map((item, index) => (
              <article
                key={`${item.quote}-${index}`}
                className="w-[20rem] shrink-0 rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 sm:w-[25rem]"
              >
                <p className="text-sm font-black uppercase tracking-[0.25em] text-red-300">
                  ★★★★★
                </p>
                <p className="mt-5 text-lg font-semibold leading-8 text-white/82">
                  “{item.quote}”
                </p>
                <p className="mt-6 border-t border-white/10 pt-4 text-xs font-black uppercase tracking-[0.2em] text-white/38">
                  {item.person}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#080808] px-5 py-20 sm:px-6">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
          <SectionIntro
            eyebrow="Create preview"
            title="Preview the /create experience before you click."
            text="The planner turns one sentence into a prompt check, a shortlist, add-ons, and a concise plan summary."
          />

          <CreatePreview />
        </div>
      </section>

      <section className="relative overflow-hidden bg-black px-5 py-24 text-center sm:px-6">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(225,6,42,0.24),transparent_42%)]" />
        <div className="relative mx-auto max-w-4xl">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-red-300">
            Ready when you are
          </p>
          <h2 className="mt-4 text-4xl font-black tracking-tight sm:text-6xl">
            Make the plan the easy part.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-white/58">
            Bring a vibe, a neighborhood, or one thing you know you want. We
            will help shape the rest into an outing worth taking.
          </p>
          <Link
            href="/create"
            className="mt-10 inline-flex rounded-full bg-[#e1062a] px-10 py-5 text-lg font-black text-white shadow-2xl shadow-red-600/30 transition hover:-translate-y-0.5 hover:bg-red-500"
          >
            Plan My Outing
          </Link>
        </div>
      </section>
    </main>
  );
}

function SectionIntro({
  eyebrow,
  title,
  text,
  light = false,
}: {
  eyebrow: string;
  title: string;
  text: string;
  light?: boolean;
}) {
  return (
    <div className="max-w-3xl">
      <p
        className={`text-xs font-black uppercase tracking-[0.3em] ${
          light ? "text-[#e1062a]" : "text-red-300"
        }`}
      >
        {eyebrow}
      </p>
      <h2 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">
        {title}
      </h2>
      <p
        className={`mt-4 text-base leading-8 sm:text-lg ${
          light ? "text-black/60" : "text-white/55"
        }`}
      >
        {text}
      </p>
    </div>
  );
}

function HeroPlannerCard() {
  return (
    <div className="relative rounded-[2.4rem] border border-white/10 bg-white/[0.06] p-4 shadow-2xl shadow-black/50 backdrop-blur">
      <div className="absolute -right-5 -top-5 hidden rounded-3xl border border-red-400/30 bg-red-500/15 px-5 py-4 text-sm font-black text-red-100 shadow-2xl shadow-red-950/30 sm:block">
        8 min plan
      </div>
      <div className="rounded-[1.9rem] border border-white/10 bg-[#0b0b0b] p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-red-300">
              Tonight&apos;s route
            </p>
            <h2 className="mt-3 text-2xl font-black tracking-tight">
              Restaurant, then somewhere worth staying out for.
            </h2>
          </div>
          <span className="rounded-full bg-green-400/10 px-3 py-1 text-xs font-black text-green-300">
            Ready
          </span>
        </div>

        <div className="mt-6 rounded-3xl border border-white/10 bg-black p-4">
          <p className="text-sm text-white/45">Prompt</p>
          <p className="mt-2 text-base font-black text-white">
            “romantic dinner and drinks near Astoria”
          </p>
        </div>

        <div className="mt-5 space-y-3">
          {createPreviewResults.map((result) => (
            <div
              key={result.name}
              className="flex items-center justify-between gap-4 rounded-3xl border border-white/10 bg-white/[0.04] p-4"
            >
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-red-200">
                  {result.type}
                </p>
                <p className="mt-2 font-black text-white">{result.name}</p>
              </div>
              <p className="max-w-[9rem] text-right text-xs font-bold leading-5 text-white/40">
                {result.note}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CreatePreview() {
  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-4 shadow-2xl shadow-black/45">
      <div className="rounded-[1.5rem] border border-white/10 bg-black p-5">
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-red-300">
              /create
            </p>
            <p className="mt-2 text-xl font-black">
              Build a plan from one prompt.
            </p>
          </div>
          <Link
            href="/create"
            className="rounded-full border border-white/15 px-5 py-3 text-center text-sm font-black text-white transition hover:bg-white hover:text-black"
          >
            Open create →
          </Link>
        </div>

        <div className="mt-6 rounded-3xl border border-white/10 bg-[#0b0b0b] p-4">
          <p className="text-sm text-white/45">What you type</p>
          <p className="mt-2 text-sm font-black text-white sm:text-base">
            fun dinner, dessert, and something active nearby
          </p>
          <div className="mt-4 h-2 rounded-full bg-white/10">
            <div className="h-2 w-3/4 rounded-full bg-[#e1062a]" />
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {createPreviewResults.map((result) => (
            <div
              key={result.name}
              className="rounded-3xl border border-white/10 bg-white/[0.04] p-4"
            >
              <p className="text-xs font-black uppercase tracking-[0.2em] text-white/35">
                {result.type}
              </p>
              <p className="mt-8 text-base font-black text-white">
                {result.name}
              </p>
              <p className="mt-2 text-sm leading-6 text-white/42">
                {result.note}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-3xl border border-red-500/30 bg-red-500/10 p-5">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-red-200">
            Plan summary
          </p>
          <p className="mt-3 text-sm leading-7 text-white/70">
            Choose dinner as the anchor, keep the listening bar as the second
            stop, and save dessert as the easy backup if the night keeps going.
          </p>
        </div>
      </div>
    </div>
  );
}
