import type { Metadata } from "next";
import Link from "next/link";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";

export const metadata: Metadata = {
  title: "TheOutHaven | Plan a Better Outing Faster",
  description:
    "Turn one date-night or group-outing idea into a clean route with restaurants, activities, timing, and backup options.",
  alternates: {
    canonical: "https://www.theouthaven.com",
  },
  openGraph: {
    title: "TheOutHaven | Plan a Better Outing Faster",
    description:
      "Tell TheOutHaven the vibe, neighborhood, and occasion, then get a conversion-ready outing plan in one guided flow.",
    url: "https://www.theouthaven.com",
    siteName: "TheOutHaven",
    type: "website",
  },
};

const HOMEPAGE_VERSION = "home-conversion-studio-redesign-2026-05-10";

const featuredDateIdeas = [
  {
    title: "Dinner + second stop",
    tag: "Classic date",
    description:
      "Start with a reliable dinner anchor, then keep momentum with a nearby lounge, dessert bar, or late-night backup.",
    prompt: "romantic dinner with a second stop nearby",
    accent: "bg-[#ffebe6]",
  },
  {
    title: "Activity-first night",
    tag: "Easy energy",
    description:
      "Lead with games, comedy, music, bowling, or a shared experience before landing somewhere relaxed for food.",
    prompt: "fun activity before dinner nearby",
    accent: "bg-[#fff2bf]",
  },
  {
    title: "Low-pressure hangout",
    tag: "Casual win",
    description:
      "Build a neighborhood route that feels thoughtful without overplanning: quick food, one move, and a clean fallback.",
    prompt: "low key local date with food and dessert",
    accent: "bg-[#eaf7ee]",
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
    title: "Tell us the vibe",
    text: "Share the city, mood, budget, occasion, must-have spot, or the kind of night you want in plain language.",
  },
  {
    title: "Review the route",
    text: "Get a clear sequence with an anchor, next move, timing notes, travel context, and smart alternatives.",
  },
  {
    title: "Pick it and go",
    text: "Use the plan as-is, send it to your person or group, or jump into /create to refine the details.",
  },
];

const betaFeedback = [
  {
    quote: "It felt like a friend who already knew the good next move.",
    person: "Beta feedback · Queens",
  },
  {
    quote: "The plan was easier to say yes to than another map list.",
    person: "Beta feedback · Date night",
  },
  {
    quote: "I had dinner, dessert, and a backup without opening ten tabs.",
    person: "Beta feedback · Long Island",
  },
  {
    quote: "The activity-first idea made the night feel less awkward.",
    person: "Beta feedback · First date",
  },
  {
    quote: "It turned a vague group text into an actual itinerary.",
    person: "Beta feedback · Birthday",
  },
];

const createPreviewResults = [
  {
    type: "Anchor",
    name: "Warm Italian dinner",
    note: "Astoria · $$ · reserve first",
  },
  {
    type: "Next move",
    name: "Listening bar nearby",
    note: "9 min walk · cocktails · late",
  },
  {
    type: "Fallback",
    name: "Dessert counter",
    note: "Casual · easy pivot · no booking",
  },
];

const createPreviewChecklist = [
  "Natural prompt input",
  "Route ordered by what to do first",
  "Context for timing, budget, and backups",
];

export default function HomePage() {
  return (
    <main
      data-homepage-version={HOMEPAGE_VERSION}
      className="min-h-screen overflow-hidden bg-[#fffaf3] text-[#19110e]"
    >
      <style>{`
        @keyframes beta-marquee {
          0% { transform: translateX(-50%); }
          100% { transform: translateX(0); }
        }
      `}</style>
      <TheOutHavenHeader />

      <section className="relative isolate px-5 pb-14 pt-32 sm:px-6 lg:pb-20 lg:pt-40">
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(135deg,rgba(225,6,42,0.13),transparent_34%),radial-gradient(circle_at_78%_16%,rgba(25,17,14,0.14),transparent_28%),linear-gradient(180deg,#fffaf3_0%,#f8efe5_100%)]" />
        <div className="absolute left-[8%] top-28 -z-10 h-52 w-52 rounded-full bg-[#e1062a]/20 blur-3xl" />
        <div className="absolute bottom-10 right-[8%] -z-10 h-72 w-72 rounded-full bg-white/80 blur-3xl" />

        <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[0.95fr_1.05fr]">
          <div>
            <p className="inline-flex rounded-full border border-[#19110e]/10 bg-white/70 px-4 py-2 text-xs font-black uppercase tracking-[0.26em] text-[#e1062a] shadow-sm backdrop-blur">
              Date nights, birthdays, weekend plans
            </p>
            <h1 className="mt-7 max-w-4xl text-5xl font-black leading-[0.88] tracking-[-0.065em] sm:text-7xl lg:text-8xl">
              A better outing plan in one clean click.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#19110e]/64 sm:text-xl">
              TheOutHaven turns your vibe into a restaurant, activity, next
              stop, and backup plan—without the tab overload.
            </p>
            <div className="mt-9 flex flex-col gap-4 sm:flex-row sm:items-center">
              <Link
                href="/create"
                className="inline-flex items-center justify-center rounded-full bg-[#e1062a] px-10 py-5 text-base font-black text-white shadow-2xl shadow-red-700/25 transition hover:-translate-y-0.5 hover:bg-[#ff2346]"
              >
                Plan My Outing
              </Link>
              <p className="max-w-xs text-sm font-bold leading-6 text-[#19110e]/50">
                Clean route. Useful context. Fewer decisions before you go.
              </p>
            </div>
          </div>

          <HeroPlannerMockup />
        </div>
      </section>

      <section className="px-5 py-14 sm:px-6 lg:py-20">
        <div className="mx-auto max-w-7xl">
          <SectionIntro
            eyebrow="Featured date ideas"
            title="Start from a plan that already has momentum."
            text="Each idea opens /create with a focused prompt so users can move from inspiration to decision faster."
          />
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {featuredDateIdeas.map((idea) => (
              <Link
                key={idea.title}
                href={`/create?prompt=${encodeURIComponent(idea.prompt)}`}
                className={`group min-h-[20rem] overflow-hidden rounded-[2rem] border border-[#19110e]/10 ${idea.accent} p-6 shadow-xl shadow-black/[0.04] transition hover:-translate-y-1 hover:border-[#e1062a]/40 hover:shadow-2xl hover:shadow-red-950/10`}
              >
                <div className="flex h-full flex-col justify-between rounded-[1.5rem] bg-white/72 p-5 backdrop-blur">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.24em] text-[#e1062a]">
                      {idea.tag}
                    </p>
                    <h2 className="mt-7 text-3xl font-black leading-none tracking-[-0.045em]">
                      {idea.title}
                    </h2>
                    <p className="mt-4 text-sm leading-7 text-[#19110e]/58">
                      {idea.description}
                    </p>
                  </div>
                  <p className="mt-8 text-sm font-black text-[#19110e] transition group-hover:text-[#e1062a]">
                    Try this idea →
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-[#19110e]/10 bg-white px-5 py-14 sm:px-6 lg:py-20">
        <div className="mx-auto max-w-7xl">
          <SectionIntro
            eyebrow="Categories"
            title="Pick the lane. We connect the stops."
            text="Make the first decision simple, then let the planner shape the restaurant, activity, lounge, dessert, or group route."
          />
          <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {categories.map((category) => (
              <Link
                key={category.label}
                href={`/create?prompt=${encodeURIComponent(category.prompt)}`}
                className="group rounded-[1.5rem] border border-[#19110e]/10 bg-[#fffaf3] p-4 text-center shadow-sm transition hover:-translate-y-1 hover:border-[#e1062a]/40 hover:bg-red-50"
              >
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-2xl shadow-sm transition group-hover:scale-110">
                  {category.icon}
                </span>
                <span className="mt-3 block text-sm font-black text-[#19110e]/70 group-hover:text-[#19110e]">
                  {category.label}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#19110e] px-5 py-16 text-white sm:px-6 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <SectionIntro
            eyebrow="How it works"
            title="Three steps from vague idea to ready-to-send plan."
            text="The homepage is built around conversion: understand the value, preview the output, then start the planner."
            dark
          />
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {steps.map((step, index) => (
              <article
                key={step.title}
                className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.06] p-7"
              >
                <span className="absolute right-5 top-4 text-7xl font-black leading-none text-white/[0.04]">
                  {index + 1}
                </span>
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-sm font-black text-[#19110e]">
                  0{index + 1}
                </span>
                <h2 className="mt-8 text-2xl font-black tracking-[-0.035em]">
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

      <section className="bg-[#0c0807] py-16 text-white lg:py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-6">
          <SectionIntro
            eyebrow="Beta feedback"
            title="Early testers keep asking for fewer tabs."
            text="A left-to-right reel of beta reactions from people planning dates, casual hangs, and group nights."
            dark
          />
        </div>
        <div className="relative mt-10 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_10%,black_90%,transparent)]">
          <div className="flex w-max gap-4 pr-4 [animation:beta-marquee_36s_linear_infinite] hover:[animation-play-state:paused]">
            {[...betaFeedback, ...betaFeedback].map((feedback, index) => (
              <figure
                key={`${feedback.person}-${index}`}
                className="w-[20rem] shrink-0 rounded-[1.75rem] border border-white/10 bg-white/[0.06] p-6 sm:w-[25rem]"
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
        <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[0.82fr_1.18fr]">
          <SectionIntro
            eyebrow="Preview /create"
            title="Show the outcome before asking for the click."
            text="Users see the exact promise: type one prompt, get a structured outing route with an anchor, next move, and backup."
          />
          <CreateExperiencePreview />
        </div>
      </section>

      <section className="px-5 pb-16 sm:px-6 lg:pb-24">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-[2.5rem] bg-[#e1062a] px-6 py-16 text-center text-white shadow-2xl shadow-red-950/20 sm:px-10 lg:py-20">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-white/70">
            Ready when you are
          </p>
          <h2 className="mx-auto mt-4 max-w-3xl text-4xl font-black leading-none tracking-[-0.055em] sm:text-6xl">
            Stop researching. Start the night.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-white/78">
            Bring a neighborhood, craving, occasion, or vague idea. TheOutHaven
            will turn it into a plan that is easy to choose.
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
          dark ? "text-white/60" : "text-[#19110e]/58"
        }`}
      >
        {text}
      </p>
    </div>
  );
}

function HeroPlannerMockup() {
  return (
    <div className="relative">
      <div className="absolute -left-4 top-8 hidden rounded-2xl bg-white px-5 py-4 text-sm font-black text-[#19110e] shadow-2xl shadow-black/10 sm:block">
        8 minute plan
      </div>
      <div className="absolute -right-3 bottom-10 hidden rounded-2xl bg-[#19110e] px-5 py-4 text-sm font-black text-white shadow-2xl shadow-black/20 sm:block">
        3 clean stops
      </div>
      <div className="rounded-[2.5rem] border border-[#19110e]/10 bg-white/78 p-4 shadow-2xl shadow-black/10 backdrop-blur">
        <div className="rounded-[2rem] bg-[#19110e] p-5 text-white">
          <div className="flex items-start justify-between gap-5">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-red-200">
                Tonight&apos;s route
              </p>
              <h2 className="mt-3 text-3xl font-black leading-none tracking-[-0.045em]">
                Dinner first. A better second move already planned.
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
                className="grid gap-3 rounded-3xl border border-white/10 bg-white/[0.04] p-4 sm:grid-cols-[1fr_auto] sm:items-center"
              >
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-red-200">
                    {result.type}
                  </p>
                  <p className="mt-2 font-black text-white">{result.name}</p>
                </div>
                <p className="text-xs font-bold leading-5 text-white/45 sm:max-w-[10rem] sm:text-right">
                  {result.note}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CreateExperiencePreview() {
  return (
    <div className="rounded-[2.25rem] border border-[#19110e]/10 bg-white p-4 shadow-2xl shadow-black/[0.06]">
      <div className="rounded-[1.75rem] border border-[#19110e]/10 bg-[#fffaf3] p-5">
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-[#e1062a]">
              /create experience
            </p>
            <p className="mt-2 text-2xl font-black tracking-[-0.04em]">
              One prompt becomes a usable outing.
            </p>
          </div>
          <Link
            href="/create"
            className="rounded-full border border-[#19110e]/15 px-5 py-3 text-center text-sm font-black text-[#19110e] transition hover:bg-[#19110e] hover:text-white"
          >
            Open create →
          </Link>
        </div>

        <div className="mt-6 rounded-3xl border border-[#19110e]/10 bg-white p-4">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-red-400" />
            <span className="h-3 w-3 rounded-full bg-yellow-300" />
            <span className="h-3 w-3 rounded-full bg-green-400" />
          </div>
          <p className="mt-5 text-sm text-[#19110e]/45">What you type</p>
          <p className="mt-2 text-sm font-black text-[#19110e] sm:text-base">
            fun dinner, dessert, and something active nearby
          </p>
          <div className="mt-4 h-2 rounded-full bg-[#19110e]/10">
            <div className="h-2 w-3/4 rounded-full bg-[#e1062a]" />
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {createPreviewResults.map((result) => (
            <div
              key={result.name}
              className="rounded-3xl border border-[#19110e]/10 bg-white p-4"
            >
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#19110e]/35">
                {result.type}
              </p>
              <p className="mt-8 text-base font-black text-[#19110e]">
                {result.name}
              </p>
              <p className="mt-2 text-sm leading-6 text-[#19110e]/48">
                {result.note}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-5 grid gap-3 rounded-3xl border border-[#e1062a]/25 bg-red-50 p-5 sm:grid-cols-[1fr_1.15fr]">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-[#e1062a]">
              What you get
            </p>
            <p className="mt-3 text-sm leading-7 text-[#19110e]/68">
              A short plan summary that explains the best order, the easy
              pivot, and why each stop fits the night.
            </p>
          </div>
          <ul className="space-y-3">
            {createPreviewChecklist.map((item) => (
              <li key={item} className="flex gap-3 text-sm font-bold text-[#19110e]/68">
                <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#e1062a] text-[10px] text-white">
                  ✓
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
