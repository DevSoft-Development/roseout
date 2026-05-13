import type { Metadata } from "next";
import Link from "next/link";
import RecoveryRedirect from "@/components/RecoveryRedirect";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

const HOMEPAGE_VERSION = "home-outing-planner-redesign-v5";
const HERO_BADGE = "Outing planner";

const featuredDateIdeas = [
  {
    title: "Dinner + dessert walk",
    tag: "Walkable plan",
    description:
      "Pick the restaurant, then see a nearby dessert stop with a clear walking-time handoff.",
    prompt: "restaurant and dessert within walking distance",
  },
  {
    title: "Activity after dinner",
    tag: "Full route",
    description:
      "Start with food, add something fun nearby, and keep the whole night in one clean flow.",
    prompt: "dinner and a fun activity walking distance",
  },
  {
    title: "Group night without chaos",
    tag: "Easy win",
    description:
      "A group-friendly food anchor, a second stop, and backup ideas that make the choice obvious.",
    prompt: "group dinner and activity nearby",
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
    title: "Name the night",
    text: "Ask for dinner, dessert, drinks, activities, budget, neighborhood, or walking distance in one sentence.",
  },
  {
    title: "See the route",
    text: "TheOutHaven separates the anchor spot from the add-on stop and shows which options fit together.",
  },
  {
    title: "Move with confidence",
    text: "Use the details, reservation, website, and walking-time context to go from planning to action.",
  },
];

const userFeedback = [
  {
    quote: "It gave me the whole night instead of another list of places.",
    person: "Queens outing",
  },
  {
    quote: "The second-stop ideas made dinner feel like an actual date plan.",
    person: "Date night",
  },
  {
    quote: "I liked that I could type the way I talk to friends.",
    person: "Long Island outing",
  },
  {
    quote: "The preview made the choice feel obvious in under a minute.",
    person: "Activity first",
  },
  {
    quote: "Cleaner than bouncing between maps, reviews, and group texts.",
    person: "Restaurant first",
  },
];

const createPreviewResults = [
  {
    type: "Restaurant",
    name: "Dinner anchor",
    note: "Queens · $$ · reservation-ready",
  },
  {
    type: "Add-on stop",
    name: "Dessert nearby",
    note: "8 min walk · easy after dinner",
  },
  {
    type: "Activity",
    name: "Games or lounge",
    note: "Second-stop option · close by",
  },
];

function createPromptHref(prompt?: string) {
  if (!prompt) return "/create";

  return `/create?prompt=${encodeURIComponent(prompt)}`;
}

export default function HomePage() {
  return (
    <main
      data-homepage-version={HOMEPAGE_VERSION}
      data-homepage-lock="2026-05-11"
      className="min-h-screen overflow-hidden bg-[#070303] text-white"
    >
      <RecoveryRedirect />
      <style>{`
        @keyframes feedback-marquee {
          0% { transform: translateX(-50%); }
          100% { transform: translateX(0); }
        }
      `}</style>
      <TheOutHavenHeader />

      <section className="relative isolate overflow-hidden px-5 pb-16 pt-32 sm:px-6 lg:pb-24 lg:pt-40">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_12%_18%,rgba(225,6,42,0.35),transparent_30%),radial-gradient(circle_at_90%_12%,rgba(255,244,229,0.18),transparent_26%),linear-gradient(135deg,#080303_0%,#1a0708_48%,#070303_100%)]" />
        <div className="absolute left-[8%] top-28 -z-10 h-[30rem] w-[30rem] rounded-full bg-[#e1062a]/20 blur-3xl" />
        <div className="absolute bottom-0 right-[8%] -z-10 h-[24rem] w-[24rem] rounded-full bg-white/10 blur-3xl" />

        <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[0.98fr_1.02fr]">
          <div>
            <p className="inline-flex rounded-full border border-[#e1062a]/35 bg-[#e1062a]/15 px-4 py-2 text-xs font-bold uppercase tracking-[0.24em] text-red-100 shadow-2xl shadow-red-950/30">
              {HERO_BADGE}
            </p>
            <h1 className="mt-7 max-w-5xl text-4xl font-extrabold leading-[0.94] tracking-[-0.045em] text-white sm:text-6xl lg:text-7xl">
              Plan the whole outing, not just one stop.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-white/68 sm:text-lg">
              TheOutHaven connects restaurant anchors, dessert or drink add-ons,
              nearby activities, and walking-distance context in one clean flow.
            </p>
            <div className="mt-9 flex flex-col gap-4 sm:flex-row sm:items-center">
              <Link
                href={createPromptHref()}
                className="inline-flex items-center justify-center rounded-full bg-[#e1062a] px-9 py-5 text-base font-bold text-white shadow-2xl shadow-red-950/40 transition hover:-translate-y-0.5 hover:bg-red-500"
              >
                Plan My Outing
              </Link>
              <p className="text-sm font-bold text-white/48">
                Food, add-ons, and activities in one simple plan.
              </p>
            </div>
          </div>

          <HeroPlanCard />
        </div>
      </section>

      <section className="bg-[#fff8f1] px-5 py-16 text-[#17110f] sm:px-6 lg:py-20">
        <div className="mx-auto max-w-7xl">
          <SectionIntro
            eyebrow="Planning lanes"
            title="Start with prompts that build complete outings."
            text="Each card starts a prompt that can return a restaurant plus dessert, drinks, or an activity instead of only one business."
          />
          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {featuredDateIdeas.map((idea) => (
              <Link
                key={idea.title}
                href={createPromptHref(idea.prompt)}
                className="group flex min-h-[18rem] flex-col justify-between rounded-[2rem] border border-[#17110f]/10 bg-white p-6 shadow-xl shadow-black/[0.04] transition hover:-translate-y-1 hover:border-[#e1062a]/45 hover:shadow-2xl hover:shadow-red-950/10"
              >
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#e1062a]">
                    {idea.tag}
                  </p>
                  <h2 className="mt-7 text-xl font-extrabold tracking-[-0.02em] sm:text-2xl">
                    {idea.title}
                  </h2>
                  <p className="mt-4 text-sm leading-7 text-[#17110f]/58">
                    {idea.description}
                  </p>
                </div>
                <p className="mt-8 text-sm font-semibold text-[#17110f] transition group-hover:text-[#e1062a]">
                  Try this idea →
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-[#110808] px-5 py-16 text-white sm:px-6 lg:py-20">
        <div className="mx-auto max-w-7xl">
          <SectionIntro
            eyebrow="Start by category"
            title="Choose the lane. We connect the stops."
            text="Food, drinks, activities, shows, dessert, or group-friendly plans—each category launches straight into a better prompt."
            dark
          />
          <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {categories.map((category) => (
              <Link
                key={category.label}
                href={createPromptHref(category.prompt)}
                className="group rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-center transition hover:-translate-y-1 hover:border-[#e1062a]/55 hover:bg-[#e1062a]/15"
              >
                <span className="block text-3xl transition group-hover:scale-110">
                  {category.icon}
                </span>
                <span className="mt-3 block text-sm font-semibold text-white/70 group-hover:text-white">
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
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-red-100/20 bg-gradient-to-br from-[#e1062a] to-[#ff6b7d] text-base font-extrabold text-white shadow-lg shadow-red-950/30">
                  {index + 1}
                </span>
                <h2 className="mt-8 text-xl font-extrabold tracking-[-0.02em]">
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
            eyebrow="User feedback"
            title="Plan with fewer tabs and clearer next steps."
            text="Real planning notes from people using TheOutHaven before date nights, birthdays, and casual plans."
            dark
          />
        </div>
        <div className="relative mt-10 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_10%,black_90%,transparent)]">
          <div className="flex w-max gap-4 pr-4 [animation:feedback-marquee_34s_linear_infinite] hover:[animation-play-state:paused]">
            {[...userFeedback, ...userFeedback].map((feedback, index) => (
              <figure
                key={`${feedback.person}-${index}`}
                className="w-[20rem] shrink-0 rounded-[1.75rem] border border-white/10 bg-white/[0.06] p-6 sm:w-[24rem]"
              >
                <blockquote className="text-base font-semibold leading-7 tracking-[-0.01em]">
                  “{feedback.quote}”
                </blockquote>
                <figcaption className="mt-6 text-xs font-bold uppercase tracking-[0.22em] text-red-200">
                  {feedback.person}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#fff8f1] px-5 py-16 text-[#17110f] sm:px-6 lg:py-24">
        <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[0.85fr_1.15fr]">
          <SectionIntro
            eyebrow="Planner preview"
            title="See the restaurant, add-on, and walking context before you click."
            text="The planner asks for one natural-language prompt, then turns it into a structured route with useful context instead of clutter."
          />
          <CreatePreview />
        </div>
      </section>

      <section className="bg-[#fff8f1] px-5 pb-16 text-[#17110f] sm:px-6 lg:pb-24">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-[2.5rem] bg-[#e1062a] px-6 py-16 text-center text-white shadow-2xl shadow-red-950/20 sm:px-10 lg:py-20">
          <p className="text-xs font-bold uppercase tracking-[0.35em] text-white/70">
            Ready when you are
          </p>
          <h2 className="mx-auto mt-4 max-w-3xl text-3xl font-extrabold leading-tight tracking-[-0.04em] sm:text-5xl">
            Your complete outing starts here.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-white/78">
            Bring a vibe, a neighborhood, or one thing you know you want.
            TheOutHaven will shape the restaurant, add-on, activity, and walking
            context into a cleaner outing.
          </p>
          <Link
            href={createPromptHref()}
            className="mt-10 inline-flex rounded-full bg-white px-10 py-5 text-lg font-bold text-[#e1062a] shadow-2xl shadow-red-950/20 transition hover:-translate-y-0.5 hover:bg-[#fff4f4]"
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
        className={`text-xs font-bold uppercase tracking-[0.3em] ${
          dark ? "text-red-200" : "text-[#e1062a]"
        }`}
      >
        {eyebrow}
      </p>
      <h2 className="mt-4 text-3xl font-extrabold tracking-[-0.035em] sm:text-4xl">
        {title}
      </h2>
      <p
        className={`mt-4 text-sm leading-7 sm:text-base ${
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
    <div className="relative rounded-[1.5rem] border border-white/10 bg-white/[0.07] p-2 shadow-xl shadow-black/30 backdrop-blur">
      <div className="rounded-[1.25rem] border border-white/10 bg-[#120909] p-4 text-white">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-red-200">
              Plan preview
            </p>
            <h2 className="mt-3 text-xl font-extrabold tracking-[-0.02em]">
              Restaurant, dessert, then a nearby activity.
            </h2>
          </div>
          <span className="rounded-full bg-[#e1062a]/20 px-3 py-1 text-xs font-bold text-red-100">
            Ready
          </span>
        </div>
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.06] p-3">
          <p className="text-sm text-white/45">Prompt</p>
          <p className="mt-2 text-base font-bold text-white">
            restaurant and dessert within walking distance
          </p>
        </div>
        <div className="mt-5 space-y-3">
          {createPreviewResults.map((result) => (
            <div
              key={result.name}
              className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3"
            >
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-200">
                  {result.type}
                </p>
                <p className="mt-2 font-bold text-white">{result.name}</p>
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
    <div className="rounded-[2.25rem] border border-[#17110f]/10 bg-white p-4 shadow-2xl shadow-black/[0.08]">
      <div className="rounded-[1.75rem] border border-[#17110f]/10 bg-[#fbf7f1] p-5">
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#e1062a]">
              Create experience
            </p>
            <p className="mt-2 text-lg font-extrabold tracking-[-0.02em]">
              Turn one idea into a plan.
            </p>
          </div>
          <Link
            href={createPromptHref()}
            className="rounded-full border border-[#17110f]/15 px-5 py-3 text-center text-sm font-bold text-[#17110f] transition hover:bg-[#17110f] hover:text-white"
          >
            Open planner →
          </Link>
        </div>
        <div className="mt-6 rounded-3xl border border-[#17110f]/10 bg-white p-4">
          <p className="text-sm text-[#17110f]/45">What you type</p>
          <p className="mt-2 text-sm font-bold text-[#17110f] sm:text-base">
            restaurant, dessert, and walking-distance activity nearby
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
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#17110f]/35">
                {result.type}
              </p>
              <p className="mt-8 text-base font-bold text-[#17110f]">
                {result.name}
              </p>
              <p className="mt-2 text-sm leading-6 text-[#17110f]/48">
                {result.note}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-5 rounded-3xl border border-[#e1062a]/25 bg-red-50 p-5">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#e1062a]">
            Plan summary
          </p>
          <p className="mt-3 text-sm leading-7 text-[#17110f]/68">
            Choose the restaurant as the anchor, treat dessert as a real add-on
            stop, then compare nearby activities with walking context before
            you decide.
          </p>
        </div>
      </div>
    </div>
  );
}
