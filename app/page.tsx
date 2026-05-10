import type { Metadata } from "next";
import Link from "next/link";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";

export const metadata: Metadata = {
  title: "TheOutHaven | Plan Your Next Outing",
  description:
    "Find date ideas, restaurants, activities, lounges, and a cleaner plan for your next outing with TheOutHaven.",
  alternates: {
    canonical: "https://www.theouthaven.com",
  },
  openGraph: {
    title: "TheOutHaven | Plan Your Next Outing",
    description:
      "Start with a vibe and preview a simple outing plan before opening the /create experience.",
    url: "https://www.theouthaven.com",
    siteName: "TheOutHaven",
    type: "website",
  },
};

const HOMEPAGE_VERSION = "home-clean-conversion-redesign-2026-05-10-fresh";

const featuredDateIdeas = [
  {
    title: "Dinner + drinks nearby",
    tag: "Classic date night",
    description:
      "Choose a restaurant first, then add a lounge or cocktail bar close enough to keep the night moving.",
    prompt: "dinner and drinks nearby",
  },
  {
    title: "Activity first, food after",
    tag: "Fun and easy",
    description:
      "Start with bowling, comedy, games, or live music, then find a restaurant that fits the route.",
    prompt: "activity first and food after",
  },
  {
    title: "Rooftop + dessert stop",
    tag: "Views and something sweet",
    description:
      "Pair a scenic rooftop with a late dessert option so the plan feels intentional from start to finish.",
    prompt: "rooftop and dessert date",
  },
];

const categories = [
  { label: "Restaurants", icon: "🍽️", prompt: "restaurants near me" },
  { label: "Lounges", icon: "🍸", prompt: "lounges near me" },
  { label: "Activities", icon: "🎯", prompt: "activities near me" },
  { label: "Rooftops", icon: "🌇", prompt: "rooftop date ideas" },
  { label: "Comedy", icon: "🎤", prompt: "comedy show and restaurant" },
  { label: "Bowling", icon: "🎳", prompt: "bowling and dinner" },
  { label: "Dessert", icon: "🍰", prompt: "dessert date ideas" },
  { label: "Live music", icon: "🎶", prompt: "live music and food" },
];

const steps = [
  {
    title: "Tell us the vibe",
    text: "Enter the neighborhood, occasion, food craving, activity, budget, or mood in one simple prompt.",
  },
  {
    title: "Review curated options",
    text: "See restaurants and experiences organized into a clean plan instead of scattered search results.",
  },
  {
    title: "Pick your outing",
    text: "Choose your favorite match, add a nearby second stop, and move forward with confidence.",
  },
];

const betaFeedback = [
  {
    quote: "It helped me stop overthinking and actually pick a plan.",
    source: "Beta feedback · date night",
  },
  {
    quote: "I liked seeing food and the thing to do after in the same place.",
    source: "Beta feedback · Queens",
  },
  {
    quote: "The add-on suggestions made the night feel complete.",
    source: "Beta feedback · Long Island",
  },
  {
    quote: "Cleaner than bouncing between maps, reviews, and group chats.",
    source: "Beta feedback · friends night",
  },
  {
    quote: "The preview showed exactly what I was going to get before I clicked.",
    source: "Beta feedback · first-time user",
  },
];

const createPreviewCards = [
  {
    label: "Prompt",
    title: "romantic dinner and something fun nearby",
    detail: "The flow starts with plain language, not filters.",
  },
  {
    label: "Results",
    title: "Restaurant + activity matches",
    detail: "Cards separate food, experiences, and nearby add-ons.",
  },
  {
    label: "Plan",
    title: "Dinner → lounge → dessert backup",
    detail: "A compact summary helps you choose the next step.",
  },
];

export default function HomePage() {
  return (
    <main
      data-homepage-version={HOMEPAGE_VERSION}
      className="min-h-screen overflow-hidden bg-[#050505] text-white"
    >
      <TheOutHavenHeader />

      <section className="relative isolate px-5 pb-20 pt-36 text-center sm:px-6 lg:pb-28 lg:pt-40">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_0%,rgba(225,6,42,0.30),transparent_34%),linear-gradient(180deg,#0f0f0f_0%,#050505_70%)]" />
        <div className="mx-auto max-w-5xl">
          <p className="mx-auto inline-flex rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-xs font-black uppercase tracking-[0.28em] text-red-200">
            Outings made simple
          </p>

          <h1 className="mx-auto mt-7 max-w-4xl text-5xl font-black leading-[0.92] tracking-tight sm:text-7xl lg:text-8xl">
            Plan the date night without the chaos.
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-white/64 sm:text-xl">
            Tell TheOutHaven your vibe and location. Get a clean restaurant,
            activity, and add-on plan you can actually choose.
          </p>

          <Link
            href="/create"
            className="mt-9 inline-flex items-center justify-center rounded-full bg-[#e1062a] px-10 py-5 text-base font-black text-white shadow-2xl shadow-red-600/30 transition hover:-translate-y-0.5 hover:bg-red-500"
          >
            Plan My Outing
          </Link>
        </div>
      </section>

      <section className="border-y border-white/10 bg-black px-5 py-20 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <SectionIntro
            eyebrow="Featured date ideas"
            title="Start with a plan that already works."
            text="Pick an idea, then let /create personalize it around your area, timing, and mood."
          />

          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {featuredDateIdeas.map((idea) => (
              <Link
                key={idea.title}
                href={`/create?prompt=${encodeURIComponent(idea.prompt)}`}
                className="group rounded-[2rem] border border-white/10 bg-white/[0.04] p-7 transition hover:-translate-y-1 hover:border-red-500/50 hover:bg-red-500/10"
              >
                <p className="text-xs font-black uppercase tracking-[0.25em] text-red-300">
                  {idea.tag}
                </p>
                <h2 className="mt-10 text-2xl font-black tracking-tight">
                  {idea.title}
                </h2>
                <p className="mt-3 text-sm leading-7 text-white/58">
                  {idea.description}
                </p>
                <p className="mt-6 text-sm font-black text-white transition group-hover:text-red-200">
                  Open this idea →
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#070707] px-5 py-20 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <SectionIntro
            eyebrow="Categories"
            title="Choose the starting point."
            text="Begin with food, a place, an activity, or the mood you want. Each category opens /create with a helpful prompt."
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
            title="Three steps. One cleaner outing."
            text="The flow keeps decisions simple so you can move from an idea to a plan faster."
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

      <section className="bg-black px-5 py-20 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <SectionIntro
            eyebrow="Beta feedback"
            title="People want a plan, not another search tab."
            text="A left-to-right reel of early feedback from people testing the planning flow."
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
                  Beta feedback
                </p>
                <p className="mt-5 text-lg font-semibold leading-8 text-white/82">
                  “{item.quote}”
                </p>
                <p className="mt-6 border-t border-white/10 pt-4 text-xs font-black uppercase tracking-[0.2em] text-white/38">
                  {item.source}
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
            title="Preview the /create experience before you click."
            text="See how one sentence becomes organized options, nearby add-ons, and a simple outing summary."
          />

          <CreateExperiencePreview />
        </div>
      </section>

      <section className="relative overflow-hidden bg-black px-5 py-24 text-center sm:px-6">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(225,6,42,0.22),transparent_44%)]" />
        <div className="relative mx-auto max-w-4xl">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-red-300">
            Ready to go out?
          </p>
          <h2 className="mt-4 text-4xl font-black tracking-tight sm:text-6xl">
            Make the plan in one place.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-white/58">
            Start with the first thing you know: the vibe, the area, the food,
            or the activity. TheOutHaven will help with the rest.
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

function CreateExperiencePreview() {
  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-4 shadow-2xl shadow-black/45">
      <div className="rounded-[1.5rem] border border-white/10 bg-black p-5">
        <div className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-red-300">
              /create preview
            </p>
            <h3 className="mt-2 text-2xl font-black tracking-tight">
              One prompt → one clean plan
            </h3>
          </div>
          <span className="rounded-full bg-green-400/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-green-300">
            Preview
          </span>
        </div>

        <div className="mt-5 rounded-3xl border border-white/10 bg-[#0b0b0b] p-4">
          <p className="text-sm font-black text-white">
            “romantic dinner and something fun nearby”
          </p>
          <div className="mt-4 h-2 rounded-full bg-white/10">
            <div className="h-2 w-4/5 rounded-full bg-[#e1062a]" />
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {createPreviewCards.map((card) => (
            <article
              key={card.label}
              className="rounded-3xl border border-white/10 bg-white/[0.04] p-4"
            >
              <p className="text-xs font-black uppercase tracking-[0.2em] text-white/35">
                {card.label}
              </p>
              <h4 className="mt-8 text-base font-black text-white">
                {card.title}
              </h4>
              <p className="mt-2 text-sm leading-6 text-white/45">
                {card.detail}
              </p>
            </article>
          ))}
        </div>

        <div className="mt-5 rounded-3xl border border-red-500/30 bg-red-500/10 p-5">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-red-200">
            What you get
          </p>
          <p className="mt-3 text-sm leading-7 text-white/70">
            A focused shortlist, a suggested second stop, distance context, and
            a plan summary you can use before texting the group.
          </p>
        </div>
      </div>
    </div>
  );
}
