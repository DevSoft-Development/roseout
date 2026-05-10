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

const HOMEPAGE_VERSION = "home-clean-conversion-redesign-2026-05-10";

const featuredDateIdeas = [
  {
    title: "Romantic dinner route",
    tag: "Date night",
    description:
      "A cozy dinner anchor, a nearby cocktail stop, and a dessert fallback if the night keeps going.",
    prompt: "romantic dinner drinks and dessert nearby",
  },
  {
    title: "Activity-first evening",
    tag: "Fun first",
    description:
      "Start with bowling, games, comedy, or music, then land somewhere relaxed for food and conversation.",
    prompt: "fun activity before dinner nearby",
  },
  {
    title: "Low-key local plan",
    tag: "Easy win",
    description:
      "A simple neighborhood plan with good food, easy logistics, and one smart backup close by.",
    prompt: "low key dinner and a second stop nearby",
  },
];

const categories = [
  { label: "Dinner", icon: "🍽️", prompt: "dinner date nearby" },
  { label: "Drinks", icon: "🍸", prompt: "drinks and lounge nearby" },
  { label: "Activities", icon: "🎯", prompt: "activities and food nearby" },
  { label: "Dessert", icon: "🍰", prompt: "dessert after dinner nearby" },
  { label: "Rooftops", icon: "🌇", prompt: "rooftop drinks and dinner" },
  { label: "Comedy", icon: "🎤", prompt: "comedy show and dinner" },
  { label: "Live music", icon: "🎶", prompt: "live music and dinner" },
  { label: "Group plans", icon: "✨", prompt: "group outing with food and activity" },
];

const steps = [
  {
    title: "Share the vibe",
    text: "Type the occasion, area, budget, craving, time, or the one place you already know.",
  },
  {
    title: "Get a clean route",
    text: "See a practical plan with the anchor spot, second stop, timing notes, and backup ideas.",
  },
  {
    title: "Choose and go",
    text: "Send the plan, book the spot, or keep exploring without opening ten more tabs.",
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
    type: "Anchor",
    name: "Candlelit Italian spot",
    note: "Astoria · $$ · reservation-friendly",
  },
  {
    type: "Second stop",
    name: "Listening bar nearby",
    note: "0.5 mi away · cocktails · open late",
  },
  {
    type: "Backup",
    name: "Dessert counter",
    note: "Walkable · no pressure · easy pivot",
  },
];

export default function HomePage() {
  return (
    <main
      data-homepage-version={HOMEPAGE_VERSION}
      className="min-h-screen overflow-hidden bg-[#fbf7f1] text-[#17110f]"
    >
      <style>{`
        @keyframes beta-marquee {
          0% { transform: translateX(-50%); }
          100% { transform: translateX(0); }
        }
      `}</style>
      <TheOutHavenHeader />

      <section className="relative isolate px-5 pb-16 pt-32 sm:px-6 lg:pb-24 lg:pt-40">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_18%,rgba(225,6,42,0.18),transparent_30%),radial-gradient(circle_at_88%_8%,rgba(23,17,15,0.10),transparent_24%),linear-gradient(180deg,#fffaf3_0%,#fbf7f1_70%)]" />
        <div className="absolute left-1/2 top-20 -z-10 h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-white/70 blur-3xl" />

        <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <p className="inline-flex rounded-full border border-[#17110f]/10 bg-white/70 px-4 py-2 text-xs font-black uppercase tracking-[0.28em] text-[#e1062a] shadow-sm">
              Outings planned in minutes
            </p>
            <h1 className="mt-7 max-w-5xl text-5xl font-black leading-[0.9] tracking-[-0.06em] sm:text-7xl lg:text-8xl">
              Plan a better night out without the tab overload.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#17110f]/65 sm:text-xl">
              TheOutHaven turns one vibe into a clean restaurant, activity,
              second stop, and backup plan you can actually use tonight.
            </p>
            <div className="mt-9 flex flex-col gap-4 sm:flex-row sm:items-center">
              <Link
                href="/create"
                className="inline-flex items-center justify-center rounded-full bg-[#e1062a] px-9 py-5 text-base font-black text-white shadow-2xl shadow-red-600/25 transition hover:-translate-y-0.5 hover:bg-red-500"
              >
                Plan My Outing
              </Link>
              <p className="text-sm font-bold text-[#17110f]/48">
                Clean picks. Clear route. One place to decide.
              </p>
            </div>
          </div>

          <HeroPlanCard />
        </div>
      </section>

      <section className="px-5 py-16 sm:px-6 lg:py-20">
        <div className="mx-auto max-w-7xl">
          <SectionIntro
            eyebrow="Featured date ideas"
            title="Start with a proven plan. Tune it to your city."
            text="Pick a strong starting point, then let /create shape the route around location, timing, mood, and backup options."
          />
          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {featuredDateIdeas.map((idea) => (
              <Link
                key={idea.title}
                href={`/create?prompt=${encodeURIComponent(idea.prompt)}`}
                className="group flex min-h-[18rem] flex-col justify-between rounded-[2rem] border border-[#17110f]/10 bg-white p-6 shadow-xl shadow-black/[0.04] transition hover:-translate-y-1 hover:border-[#e1062a]/45 hover:shadow-2xl hover:shadow-red-950/10"
              >
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.24em] text-[#e1062a]">
                    {idea.tag}
                  </p>
                  <h2 className="mt-7 text-2xl font-black tracking-[-0.03em] sm:text-3xl">
                    {idea.title}
                  </h2>
                  <p className="mt-4 text-sm leading-7 text-[#17110f]/58">
                    {idea.description}
                  </p>
                </div>
                <p className="mt-8 text-sm font-black text-[#17110f] transition group-hover:text-[#e1062a]">
                  Try this idea →
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-[#17110f]/10 bg-white px-5 py-16 sm:px-6 lg:py-20">
        <div className="mx-auto max-w-7xl">
          <SectionIntro
            eyebrow="Categories"
            title="Choose the lane. We connect the stops."
            text="Food, drinks, activities, shows, dessert, or group-friendly plans—each category launches straight into a better prompt."
          />
          <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {categories.map((category) => (
              <Link
                key={category.label}
                href={`/create?prompt=${encodeURIComponent(category.prompt)}`}
                className="group rounded-3xl border border-[#17110f]/10 bg-[#fbf7f1] p-4 text-center transition hover:-translate-y-1 hover:border-[#e1062a]/45 hover:bg-red-50"
              >
                <span className="block text-3xl transition group-hover:scale-110">
                  {category.icon}
                </span>
                <span className="mt-3 block text-sm font-black text-[#17110f]/70 group-hover:text-[#17110f]">
                  {category.label}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#17110f] px-5 py-20 text-white sm:px-6">
        <div className="mx-auto max-w-7xl">
          <SectionIntro
            eyebrow="How it works"
            title="Three steps from maybe to ready."
            text="The flow is intentionally simple: give us the idea, review the route, then go out with confidence."
            dark
          />
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {steps.map((step, index) => (
              <article
                key={step.title}
                className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-7"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-sm font-black text-[#17110f]">
                  0{index + 1}
                </span>
                <h2 className="mt-8 text-2xl font-black tracking-[-0.03em]">
                  {step.title}
                </h2>
                <p className="mt-3 text-sm leading-7 text-white/62">
                  {step.text}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#0b0807] py-16 text-white lg:py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-6">
          <SectionIntro
            eyebrow="Beta feedback"
            title="Early users want fewer tabs and faster decisions."
            text="A left-to-right reel from people testing TheOutHaven before date nights, birthdays, and casual plans."
            dark
          />
        </div>
        <div className="relative mt-10 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_10%,black_90%,transparent)]">
          <div className="flex w-max gap-4 pr-4 [animation:beta-marquee_34s_linear_infinite] hover:[animation-play-state:paused]">
            {[...betaFeedback, ...betaFeedback].map((feedback, index) => (
              <figure
                key={`${feedback.person}-${index}`}
                className="w-[20rem] shrink-0 rounded-[1.75rem] border border-white/10 bg-white/[0.06] p-6 sm:w-[24rem]"
              >
                <blockquote className="text-lg font-black leading-7 tracking-[-0.02em]">
                  “{feedback.quote}”
                </blockquote>
                <figcaption className="mt-6 text-xs font-black uppercase tracking-[0.22em] text-red-200">
                  {feedback.person}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 py-16 sm:px-6 lg:py-24">
        <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[0.85fr_1.15fr]">
          <SectionIntro
            eyebrow="Preview /create"
            title="See the experience before you click."
            text="The planner asks for one natural-language prompt, then turns it into a structured route with useful context instead of clutter."
          />
          <CreatePreview />
        </div>
      </section>

      <section className="px-5 pb-16 sm:px-6 lg:pb-24">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-[2.5rem] bg-[#e1062a] px-6 py-16 text-center text-white shadow-2xl shadow-red-950/20 sm:px-10 lg:py-20">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-white/70">
            Ready when you are
          </p>
          <h2 className="mx-auto mt-4 max-w-3xl text-4xl font-black leading-none tracking-[-0.05em] sm:text-6xl">
            Make the plan the easiest part of going out.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-white/78">
            Bring a vibe, a neighborhood, or one thing you know you want. We
            will shape the rest into an outing worth taking.
          </p>
          <Link
            href="/create"
            className="mt-10 inline-flex rounded-full bg-white px-10 py-5 text-lg font-black text-[#e1062a] shadow-2xl shadow-red-950/20 transition hover:-translate-y-0.5 hover:bg-[#fff4f4]"
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
  dark = false,
}: {
  eyebrow: string;
  title: string;
  text: string;
  dark?: boolean;
}) {
  return (
    <div className="max-w-3xl">
      <p
        className={`text-xs font-black uppercase tracking-[0.3em] ${
          dark ? "text-red-200" : "text-[#e1062a]"
        }`}
      >
        {eyebrow}
      </p>
      <h2 className="mt-4 text-4xl font-black tracking-[-0.05em] sm:text-5xl">
        {title}
      </h2>
      <p
        className={`mt-4 text-base leading-8 sm:text-lg ${
          dark ? "text-white/60" : "text-[#17110f]/58"
        }`}
      >
        {text}
      </p>
    </div>
  );
}

function HeroPlanCard() {
  return (
    <div className="relative rounded-[2.35rem] border border-[#17110f]/10 bg-white/75 p-4 shadow-2xl shadow-black/10 backdrop-blur">
      <div className="absolute -right-4 -top-4 hidden rounded-3xl bg-[#17110f] px-5 py-4 text-sm font-black text-white shadow-xl sm:block">
        8 min plan
      </div>
      <div className="rounded-[1.85rem] border border-[#17110f]/10 bg-[#17110f] p-5 text-white">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-red-200">
              Tonight&apos;s route
            </p>
            <h2 className="mt-3 text-2xl font-black tracking-[-0.03em]">
              Dinner, then somewhere worth staying out for.
            </h2>
          </div>
          <span className="rounded-full bg-green-400/10 px-3 py-1 text-xs font-black text-green-300">
            Ready
          </span>
        </div>
        <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.06] p-4">
          <p className="text-sm text-white/45">Prompt</p>
          <p className="mt-2 text-base font-black text-white">
            romantic dinner and drinks near Astoria
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
              <p className="max-w-[9rem] text-right text-xs font-bold leading-5 text-white/42">
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
    <div className="rounded-[2.25rem] border border-[#17110f]/10 bg-white p-4 shadow-2xl shadow-black/[0.06]">
      <div className="rounded-[1.75rem] border border-[#17110f]/10 bg-[#fbf7f1] p-5">
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-[#e1062a]">
              /create experience
            </p>
            <p className="mt-2 text-xl font-black tracking-[-0.03em]">
              Build a route from one prompt.
            </p>
          </div>
          <Link
            href="/create"
            className="rounded-full border border-[#17110f]/15 px-5 py-3 text-center text-sm font-black text-[#17110f] transition hover:bg-[#17110f] hover:text-white"
          >
            Open create →
          </Link>
        </div>
        <div className="mt-6 rounded-3xl border border-[#17110f]/10 bg-white p-4">
          <p className="text-sm text-[#17110f]/45">What you type</p>
          <p className="mt-2 text-sm font-black text-[#17110f] sm:text-base">
            fun dinner, dessert, and something active nearby
          </p>
          <div className="mt-4 h-2 rounded-full bg-[#17110f]/10">
            <div className="h-2 w-3/4 rounded-full bg-[#e1062a]" />
          </div>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {createPreviewResults.map((result) => (
            <div
              key={result.name}
              className="rounded-3xl border border-[#17110f]/10 bg-white p-4"
            >
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#17110f]/35">
                {result.type}
              </p>
              <p className="mt-8 text-base font-black text-[#17110f]">
                {result.name}
              </p>
              <p className="mt-2 text-sm leading-6 text-[#17110f]/48">
                {result.note}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-5 rounded-3xl border border-[#e1062a]/25 bg-red-50 p-5">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-[#e1062a]">
            Plan summary
          </p>
          <p className="mt-3 text-sm leading-7 text-[#17110f]/68">
            Choose dinner as the anchor, keep the listening bar as the second
            stop, and save dessert as the easy backup if the night keeps going.
          </p>
        </div>
      </div>
    </div>
  );
}
