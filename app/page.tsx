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

const HOMEPAGE_VERSION = "home-redesign-conversion-2026-05-10";

const featuredDateIdeas = [
  {
    title: "Dinner + cocktail lounge",
    meta: "Low-pressure date night",
    description:
      "Start with a polished dinner pick, then add a nearby lounge so the night has a natural second stop.",
    prompt: "dinner and cocktail lounge near me",
  },
  {
    title: "Rooftop + late bite",
    meta: "Views, drinks, food",
    description:
      "Find a rooftop that matches the mood and pair it with a food option close enough to keep things easy.",
    prompt: "rooftop drinks and late night food",
  },
  {
    title: "Activity + restaurant after",
    meta: "Fun first, food next",
    description:
      "Plan around bowling, comedy, games, or live music, then see restaurant matches nearby.",
    prompt: "fun activity and restaurant after",
  },
];

const categories = [
  { label: "Restaurants", icon: "🍽️", prompt: "restaurants near me" },
  { label: "Lounges", icon: "🍸", prompt: "lounges near me" },
  { label: "Activities", icon: "🎯", prompt: "activities near me" },
  { label: "Rooftops", icon: "🌇", prompt: "rooftop drinks" },
  { label: "Comedy", icon: "🎤", prompt: "comedy show and food" },
  { label: "Bowling", icon: "🎳", prompt: "bowling and dinner" },
  { label: "Dessert", icon: "🍰", prompt: "dessert date ideas" },
  { label: "Live music", icon: "🎶", prompt: "live music and dinner" },
];

const steps = [
  {
    title: "Share the vibe",
    text: "Type the occasion, neighborhood, food craving, budget, or activity idea in plain language.",
  },
  {
    title: "Compare the matches",
    text: "TheOutHaven organizes restaurants and things to do into clean cards with useful outing context.",
  },
  {
    title: "Choose your plan",
    text: "Save the best pairing, check the distance between stops, and move forward with a plan that feels ready.",
  },
];

const betaFeedback = [
  {
    quote:
      "I could see the whole night instead of opening five different apps.",
    person: "Beta feedback · Queens",
  },
  {
    quote:
      "The add-on ideas made it easier to turn dinner into an actual plan.",
    person: "Beta feedback · Date night",
  },
  {
    quote:
      "It felt built for the way I actually describe plans to friends.",
    person: "Beta feedback · Long Island",
  },
  {
    quote:
      "The preview was simple: pick a restaurant, add something nearby, done.",
    person: "Beta feedback · Activity first",
  },
  {
    quote:
      "Cleaner than search results. I knew what to do next right away.",
    person: "Beta feedback · Restaurant first",
  },
];

const createPreviewResults = [
  { name: "Cozy Italian dinner", type: "Restaurant", distance: "Astoria · $$" },
  { name: "Low-lit cocktail lounge", type: "Add-on", distance: "0.6 mi away" },
  { name: "Late dessert bar", type: "Backup", distance: "Open late" },
];

export default function HomePage() {
  return (
    <main
      data-homepage-version={HOMEPAGE_VERSION}
      className="min-h-screen overflow-hidden bg-[#050505] text-white"
    >
      <TheOutHavenHeader />

      <section className="relative isolate px-5 pb-16 pt-32 sm:px-6 lg:pb-24 lg:pt-36">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_18%,rgba(225,6,42,0.22),transparent_30%),radial-gradient(circle_at_85%_12%,rgba(255,255,255,0.08),transparent_24%),linear-gradient(180deg,#111_0%,#050505_62%,#050505_100%)]" />
        <div className="absolute left-1/2 top-28 -z-10 h-[26rem] w-[26rem] -translate-x-1/2 rounded-full bg-red-600/10 blur-3xl" />

        <div className="mx-auto grid max-w-7xl items-center gap-12 lg:min-h-[calc(100vh-8rem)] lg:grid-cols-[1fr_0.9fr]">
          <div className="max-w-4xl">
            <p className="inline-flex rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-xs font-black uppercase tracking-[0.28em] text-red-200">
              Plan less. Go out better.
            </p>

            <h1 className="mt-7 text-5xl font-black leading-[0.9] tracking-tight sm:text-7xl lg:text-8xl">
              Your next outing, planned in minutes.
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/64 sm:text-xl">
              Tell TheOutHaven the vibe, place, and occasion. Get a clean plan
              with restaurants, activities, and nearby add-ons that actually fit.
            </p>

            <Link
              href="/create"
              className="mt-9 inline-flex items-center justify-center rounded-full bg-[#e1062a] px-9 py-5 text-base font-black text-white shadow-2xl shadow-red-600/30 transition hover:-translate-y-0.5 hover:bg-red-500"
            >
              Plan My Outing
            </Link>
          </div>

          <HeroPlannerCard />
        </div>
      </section>

      <section className="border-y border-white/10 bg-black px-5 py-18 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <SectionIntro
            eyebrow="Featured date ideas"
            title="Start with an outing people already want."
            text="Use a proven plan type, then personalize the area, pace, and second stop in /create."
          />

          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {featuredDateIdeas.map((idea) => (
              <Link
                key={idea.title}
                href={`/create?prompt=${encodeURIComponent(idea.prompt)}`}
                className="group rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 transition hover:-translate-y-1 hover:border-red-500/50 hover:bg-red-500/10"
              >
                <p className="text-xs font-black uppercase tracking-[0.24em] text-red-300">
                  {idea.meta}
                </p>
                <h2 className="mt-8 text-2xl font-black tracking-tight">
                  {idea.title}
                </h2>
                <p className="mt-3 text-sm leading-7 text-white/58">
                  {idea.description}
                </p>
                <p className="mt-6 text-sm font-black text-white transition group-hover:text-red-200">
                  Try this idea →
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#070707] px-5 py-18 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <SectionIntro
            eyebrow="Categories"
            title="Pick a starting point. The plan can build from there."
            text="Go directly to the kind of outing you have in mind, from restaurants and rooftops to comedy, dessert, and live music."
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
            title="Three steps from idea to itinerary."
            text="The flow is simple on purpose: describe the night, compare the options, then choose what feels right."
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

      <section className="bg-black px-5 py-18 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <SectionIntro
            eyebrow="Beta feedback"
            title="Early users want fewer tabs and a clearer next move."
            text="A left-to-right feedback reel from people testing the outing planner experience."
          />
        </div>

        <div className="mt-10 overflow-hidden">
          <div className="testimonial-track flex w-max gap-4">
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

      <section className="bg-[#070707] px-5 py-20 sm:px-6">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <SectionIntro
            eyebrow="Create preview"
            title="See the planning flow before you start."
            text="The /create experience turns one sentence into organized results, add-on suggestions, and a compact summary of your plan."
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
            Make tonight easier to choose.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-white/58">
            Start with a vibe, a place, or one thing you already know you want.
            TheOutHaven will help shape the rest.
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
    <div className="relative rounded-[2.2rem] border border-white/10 bg-white/[0.05] p-4 shadow-2xl shadow-black/50 backdrop-blur">
      <div className="rounded-[1.7rem] border border-white/10 bg-[#0b0b0b] p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-red-300">
              Tonight&apos;s plan
            </p>
            <h2 className="mt-3 text-2xl font-black tracking-tight">
              Dinner, then somewhere worth staying out for.
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
              <p className="text-right text-xs font-bold text-white/40">
                {result.distance}
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
          <p className="text-sm font-black text-white">
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
              <p className="mt-2 text-sm text-white/42">{result.distance}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-3xl border border-red-500/30 bg-red-500/10 p-5">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-red-200">
            Plan summary
          </p>
          <p className="mt-3 text-sm leading-7 text-white/70">
            Choose the dinner spot, keep the lounge as the second stop, and save
            dessert as an easy backup if the night keeps going.
          </p>
        </div>
      </div>
    </div>
  );
}
