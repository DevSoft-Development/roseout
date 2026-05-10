import type { Metadata } from "next";
import Link from "next/link";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";

export const metadata: Metadata = {
  title: "TheOutHaven | Plan Your Outing in One Search",
  description:
    "Plan restaurants, lounges, activities, and date ideas from TheOutHaven’s clean conversion-focused homepage.",
  alternates: {
    canonical: "https://www.theouthaven.com",
  },
  openGraph: {
    title: "TheOutHaven | Plan Your Outing in One Search",
    description:
      "Tell TheOutHaven the vibe, location, and occasion, then get a clean restaurant-and-activity plan.",
    url: "https://www.theouthaven.com",
    siteName: "TheOutHaven",
    type: "website",
  },
};

const HOMEPAGE_VERSION = "home-redesign-v7-fresh-homepage-2026-05-10";

const featuredDateIdeas = [
  {
    title: "Rooftop drinks + late-night bite",
    area: "NYC area",
    description:
      "A stylish first stop with a nearby restaurant option so the night feels planned, not random.",
    prompt: "rooftop drinks and food near me",
    accent: "from-red-500/25 to-white/5",
  },
  {
    title: "Restaurant + bowling after",
    area: "Queens",
    description:
      "Start with a restaurant, then add an activity close enough to keep the energy moving.",
    prompt: "restaurant with bowling in Queens",
    accent: "from-amber-400/20 to-red-500/10",
  },
  {
    title: "Lounge night + food nearby",
    area: "Long Island",
    description:
      "Find the lounge vibe you want and pair it with a restaurant that makes sense for the outing.",
    prompt: "lounge with food in Long Island",
    accent: "from-fuchsia-500/20 to-red-500/10",
  },
];

const categories = [
  { label: "Restaurants", icon: "🍽️", prompt: "restaurants near me" },
  { label: "Lounges", icon: "🍸", prompt: "lounges near me" },
  { label: "Activities", icon: "🎯", prompt: "activities near me" },
  { label: "Rooftops", icon: "🌇", prompt: "rooftop drinks" },
  { label: "Bowling", icon: "🎳", prompt: "bowling and food" },
  { label: "Comedy", icon: "🎤", prompt: "comedy show and restaurant" },
  { label: "Dessert", icon: "🍰", prompt: "dessert date ideas" },
  { label: "Live music", icon: "🎶", prompt: "live music and food" },
];

const steps = [
  {
    number: "01",
    title: "Tell it the vibe",
    text: "Search the way you would text a friend: location, mood, food, activity, budget, or occasion.",
    icon: "💬",
  },
  {
    number: "02",
    title: "Review the best matches",
    text: "TheOutHaven organizes restaurant and activity options, prioritizes nearby picks, and avoids duplicate results.",
    icon: "✨",
  },
  {
    number: "03",
    title: "Build the outing",
    text: "Choose a restaurant, add an activity if you want one, compare distance between stops, and continue with confidence.",
    icon: "🗺️",
  },
];

const betaFeedback = [
  {
    quote:
      "I did not have to bounce between apps. It gave me restaurants and the thing to do after.",
    context: "Beta feedback · Queens",
  },
  {
    quote:
      "The add-on search is what I needed. I could start with a lounge and then find food around it.",
    context: "Beta feedback · Long Island",
  },
  {
    quote:
      "It feels like the site understands the plan, not just the words I typed.",
    context: "Beta feedback · Date night",
  },
  {
    quote:
      "The preview cards made it simple to pick one place and keep going instead of overthinking.",
    context: "Beta feedback · Activity first",
  },
  {
    quote:
      "This is cleaner than search. I can see the outing before I commit to anything.",
    context: "Beta feedback · Restaurant first",
  },
];

const previewRestaurants = [
  {
    name: "Modern Italian spot",
    detail: "Restaurant · Astoria",
  },
  {
    name: "Cozy sushi counter",
    detail: "Restaurant · 1.8 miles away",
  },
];

const previewActivities = [
  {
    name: "Cocktail lounge",
    detail: "0.7 miles from restaurant",
  },
  {
    name: "Bowling + arcade",
    detail: "Activity · nearby match",
  },
];

export default function HomePage() {
  return (
    <main
      data-homepage-version={HOMEPAGE_VERSION}
      className="min-h-screen overflow-hidden bg-[#050505] text-white"
    >
      <TheOutHavenHeader />

      <section className="relative isolate px-5 pb-20 pt-32 sm:px-6 sm:pt-36 lg:pb-28">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_15%,rgba(225,6,42,0.25),transparent_30%),radial-gradient(circle_at_82%_10%,rgba(255,255,255,0.08),transparent_25%),linear-gradient(180deg,#0a0a0a_0%,#050505_58%,#000_100%)]" />
        <div className="absolute left-1/2 top-20 -z-10 h-[40rem] w-[40rem] -translate-x-1/2 rounded-full border border-white/10 bg-white/[0.02] blur-3xl" />

        <div className="mx-auto grid max-w-7xl items-center gap-12 lg:min-h-[calc(100vh-9rem)] lg:grid-cols-[0.92fr_1.08fr]">
          <div className="max-w-3xl">
            <p className="inline-flex rounded-full border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs font-black uppercase tracking-[0.28em] text-red-200">
              Plan outings faster
            </p>

            <h1 className="mt-7 text-5xl font-black leading-[0.94] tracking-tight sm:text-6xl lg:text-7xl">
              Plan your outing in one search.
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/62 sm:text-xl">
              Tell TheOutHaven what you want, where you want it, and the mood
              you are going for. Get a clean restaurant-and-activity plan in
              seconds.
            </p>

            <Link
              href="/create"
              className="mt-9 inline-flex items-center justify-center rounded-2xl bg-[#e1062a] px-10 py-5 text-base font-black text-white shadow-2xl shadow-red-600/30 transition hover:-translate-y-0.5 hover:bg-red-500"
            >
              Plan My Outing
            </Link>
          </div>

          <CreatePreviewCard />
        </div>
      </section>

      <section className="border-y border-white/10 bg-black px-5 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <SectionIntro
            eyebrow="Featured date ideas"
            title="Start with the kind of night you want."
            text="Pick a direction, then let TheOutHaven shape it around your area, distance, and the stops that make sense together."
          />

          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {featuredDateIdeas.map((idea) => (
              <article
                key={idea.title}
                className="group relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#0d0d0d] p-6 shadow-2xl shadow-black/30 transition hover:-translate-y-1 hover:border-red-500/45"
              >
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${idea.accent} opacity-80 transition group-hover:opacity-100`}
                />
                <div className="relative">
                  <div className="flex items-center justify-between gap-4">
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-black">
                      {idea.area}
                    </span>
                    <span className="text-2xl">♡</span>
                  </div>

                  <h2 className="mt-16 text-2xl font-black tracking-tight">
                    {idea.title}
                  </h2>
                  <p className="mt-3 text-sm leading-7 text-white/62">
                    {idea.description}
                  </p>
                  <p className="mt-5 rounded-2xl border border-white/10 bg-black/35 p-3 text-xs font-bold text-white/50">
                    Try: “{idea.prompt}”
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#070707] px-5 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <SectionIntro
            eyebrow="Categories"
            title="Search by food, activity, place, or mood."
            text="TheOutHaven is built for plain-language outing searches, from quick restaurant ideas to full date-night plans."
          />

          <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {categories.map((category) => (
              <Link
                key={category.label}
                href={`/create?prompt=${encodeURIComponent(category.prompt)}`}
                className="group rounded-3xl border border-white/10 bg-white/[0.04] p-4 text-center transition hover:-translate-y-1 hover:border-red-500/45 hover:bg-red-500/10"
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
            title="A three-step flow for faster plans."
            text="No endless tabs. No messy duplicate lists. Just a simple path from idea to outing."
            light
          />

          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {steps.map((step) => (
              <article
                key={step.number}
                className="rounded-[2rem] border border-black/10 bg-[#f7f7f7] p-7 shadow-xl shadow-black/5"
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-black text-2xl">
                    {step.icon}
                  </span>
                  <span className="text-sm font-black text-[#e1062a]">
                    {step.number}
                  </span>
                </div>
                <h2 className="mt-6 text-2xl font-black tracking-tight">
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

      <section className="bg-black px-5 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <SectionIntro
            eyebrow="Beta feedback"
            title="People want a plan, not another search rabbit hole."
            text="Early feedback has shaped a cleaner flow for building outings around restaurants, lounges, and activities."
          />

          <div className="mt-10 flex snap-x gap-4 overflow-x-auto pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {betaFeedback.map((item) => (
              <article
                key={item.quote}
                className="min-w-[19rem] snap-start rounded-[2rem] border border-white/10 bg-[#0d0d0d] p-6 sm:min-w-[25rem]"
              >
                <div className="text-red-400" aria-label="5-star feedback">
                  ★★★★★
                </div>
                <p className="mt-5 text-lg font-semibold leading-8 text-white/82">
                  “{item.quote}”
                </p>
                <p className="mt-6 border-t border-white/10 pt-4 text-sm font-black uppercase tracking-[0.2em] text-white/38">
                  {item.context}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#070707] px-5 py-20 sm:px-6">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-red-400">
              Before you click
            </p>
            <h2 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">
              Preview the /create experience.
            </h2>
            <p className="mt-5 max-w-xl text-lg leading-8 text-white/58">
              See how one prompt becomes organized result cards, add-on search,
              and a simple plan summary before you move forward.
            </p>
          </div>

          <CreatePreviewCard compact />
        </div>
      </section>

      <section className="relative overflow-hidden bg-black px-5 py-24 text-center sm:px-6">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(225,6,42,0.22),transparent_42%)]" />
        <div className="relative mx-auto max-w-4xl">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-red-400">
            Ready to plan?
          </p>
          <h2 className="mt-4 text-4xl font-black tracking-tight sm:text-6xl">
            Turn one sentence into your next outing.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-white/58">
            Start with a restaurant, an activity, a lounge, or just a vibe.
            TheOutHaven will help shape the rest.
          </p>
          <Link
            href="/create"
            className="mt-10 inline-flex rounded-2xl bg-[#e1062a] px-10 py-5 text-lg font-black text-white shadow-2xl shadow-red-600/30 transition hover:-translate-y-0.5 hover:bg-red-500"
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
          light ? "text-[#e1062a]" : "text-red-400"
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

function CreatePreviewCard({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`relative rounded-[2rem] border border-white/10 bg-white/[0.05] p-4 shadow-2xl shadow-black/45 backdrop-blur ${
        compact ? "" : "lg:rotate-1"
      }`}
    >
      <div className="rounded-[1.5rem] border border-white/10 bg-[#0b0b0b] p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-red-400">
              /create preview
            </p>
            <p className="mt-1 text-sm font-bold text-white/45">
              One prompt, two clear columns
            </p>
          </div>
          <span className="rounded-full bg-green-400/10 px-3 py-1 text-xs font-black text-green-300">
            Live flow
          </span>
        </div>

        <div className="mt-5 rounded-2xl border border-white/10 bg-black p-4">
          <p className="text-sm font-black text-white">
            “A fun restaurant and lounge near Astoria....”
          </p>
          <div className="mt-4 h-2 rounded-full bg-white/10">
            <div className="h-2 w-4/5 rounded-full bg-[#e1062a]" />
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <PreviewColumn title="Restaurants" items={previewRestaurants} />
          <PreviewColumn title="Activities" items={previewActivities} />
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-white/35">
              Selected
            </p>
            <p className="mt-2 text-sm font-black text-white">
              Modern Italian spot
            </p>
          </div>
          <div className="text-center text-xs font-black uppercase tracking-[0.18em] text-red-300">
            0.7 mi
          </div>
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-red-200">
              Add-on
            </p>
            <p className="mt-2 text-sm font-black text-white">
              Cocktail lounge nearby
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewColumn({
  title,
  items,
}: {
  title: string;
  items: { name: string; detail: string }[];
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-white/40">
        {title}
      </p>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <div
            key={item.name}
            className="rounded-xl border border-white/10 bg-black/50 p-3"
          >
            <div className="h-2 w-16 rounded-full bg-red-500/70" />
            <p className="mt-3 text-sm font-black text-white/82">
              {item.name}
            </p>
            <p className="mt-1 text-xs text-white/38">{item.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
