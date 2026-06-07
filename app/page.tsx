import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import RecoveryRedirect from "@/components/RecoveryRedirect";
import LaunchWaitlistForm from "@/components/launch/LaunchWaitlistForm";
import { buildMetadata } from "@/lib/seo";

export const revalidate = 300;

export const metadata: Metadata = buildMetadata({
  title: "Stop searching 10 tabs. Start planning one perfect outing.",
  description:
    "Join TheOutHaven Launch List for early access, NYC outing ideas, and a chance to win a $100 gift card.",
  path: "/",
});

const searchExamples = [
  "dinner and hookah after",
  "girls night with drinks",
  "date night with an activity nearby",
  "steak dinner and rooftop drinks after",
  "brunch and a fun activity nearby",
  "birthday dinner with lounge vibes",
];

const howItWorks = [
  {
    title: "Tell us the whole plan",
    copy: "Share the food, mood, people, area, and what you want to do after in one normal sentence.",
  },
  {
    title: "Search in one natural sentence",
    copy: "Use phrases like dinner and hookah after, girls night with drinks, or date night with an activity nearby.",
  },
  {
    title: "Find food, drinks, activities, and things to do after",
    copy: "TheOutHaven helps connect restaurants, lounges, activities, and next-stop ideas around the outing you want.",
  },
  {
    title: "Plan one complete outing",
    copy: "Spend less time bouncing between tabs and more time choosing a plan that actually fits the moment.",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#070303] text-white">
      <RecoveryRedirect />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_10%,rgba(225,29,72,0.34),transparent_30%),radial-gradient(circle_at_85%_5%,rgba(255,255,255,0.10),transparent_23%),linear-gradient(140deg,#070303_0%,#170808_47%,#050202_100%)]" />
      <Nav />
      <section className="px-5 pb-16 pt-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-16">
          <Hero />
          <FullSentenceSearch />
          <section id="launch-list" className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
            <LaunchFormCard />
            <GiveawayRulesCard />
          </section>
          <HowItWorks />
          <SocialFollow />
        </div>
      </section>
      <Footer />
    </main>
  );
}

function Nav() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#070303]/82 px-5 py-4 backdrop-blur-xl sm:px-6 lg:px-8">
      <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3" aria-label="TheOutHaven home">
          <Image src="/toh_logo.png" alt="TheOutHaven" width={44} height={44} className="rounded-xl" priority />
          <span className="text-sm font-black uppercase tracking-[0.24em] text-white/85">TheOutHaven</span>
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          <a href="#launch-list" className="hidden rounded-full border border-rose-300/30 bg-rose-500/10 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-rose-50 transition hover:bg-rose-500/20 sm:inline-flex">
            Join Launch List
          </a>
          <Link href="/login" className="rounded-full border border-white/10 bg-white/[0.07] px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-white transition hover:bg-white/12">
            Log In
          </Link>
        </div>
      </nav>
    </header>
  );
}

function Hero() {
  return (
    <section className="grid gap-10 pt-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pt-16">
      <div className="space-y-7">
        <div className="inline-flex rounded-full border border-rose-300/25 bg-rose-500/10 px-4 py-2 text-xs font-black uppercase tracking-[0.24em] text-rose-100 shadow-lg shadow-rose-950/20">
          TheOutHaven Launch Giveaway
        </div>
        <div className="space-y-5">
          <p className="text-sm font-black uppercase tracking-[0.32em] text-white/55">Launching Late Summer 2026</p>
          <h1 className="max-w-5xl text-5xl font-black tracking-[-0.055em] text-white sm:text-7xl lg:text-8xl">
            Stop searching 10 tabs. Start planning one perfect outing.
          </h1>
          <p className="max-w-3xl text-lg leading-8 text-white/76 sm:text-xl">
            Search the way you actually talk: “dinner and hookah after,” “girls night with drinks,” or “date night with an activity nearby.” TheOutHaven helps turn full-sentence ideas into complete outings.
          </p>
          <p className="max-w-3xl text-base leading-7 text-white/62 sm:text-lg">
            TheOutHaven is your AI outing assistant for restaurants, lounges, activities, and things to do after — all from one full-sentence search.
          </p>
          <p className="max-w-2xl rounded-3xl border border-white/10 bg-white/[0.06] p-4 text-base font-bold leading-7 text-white/82">
            Tell us the whole plan once — we’ll help you find the food, the vibe, and what to do after.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <a href="#launch-list" className="rounded-full bg-gradient-to-r from-rose-500 to-red-700 px-7 py-4 text-center text-sm font-black uppercase tracking-[0.18em] text-white shadow-2xl shadow-rose-950/40 transition hover:scale-[1.02]">
            Join Launch List
          </a>
          <Link href="/login" className="rounded-full border border-white/10 bg-white/[0.07] px-7 py-4 text-center text-sm font-black uppercase tracking-[0.18em] text-white transition hover:bg-white/12">
            Log In
          </Link>
        </div>
        <p className="text-sm leading-6 text-white/55">Join the Launch List for early access, NYC outing ideas, and a chance to win a $100 gift card.</p>
      </div>
      <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-4 shadow-2xl shadow-black/35 backdrop-blur">
        <div className="rounded-[1.5rem] border border-white/10 bg-[#0d0505] p-5">
          <div className="flex items-center gap-2 border-b border-white/10 pb-4">
            <span className="h-3 w-3 rounded-full bg-red-500" />
            <span className="h-3 w-3 rounded-full bg-yellow-400" />
            <span className="h-3 w-3 rounded-full bg-green-400" />
          </div>
          <div className="space-y-5 pt-5">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-200">Try a full-sentence search</p>
            <div className="rounded-3xl border border-rose-300/20 bg-rose-500/10 p-5 text-xl font-black leading-8 text-white">
              birthday dinner with lounge vibes
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {searchExamples.map((example) => (
                <span key={example} className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-bold text-white/75">
                  {example}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FullSentenceSearch() {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.025))] p-6 shadow-2xl shadow-black/25 sm:p-8">
      <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.30em] text-rose-200">Full-sentence search</p>
          <h2 className="mt-3 text-4xl font-black tracking-[-0.035em] sm:text-5xl">Search the way you actually talk.</h2>
        </div>
        <div className="space-y-4 text-base leading-8 text-white/70 sm:text-lg">
          <p>Type the full plan in one sentence — dinner and hookah after, girls night with drinks, a birthday dinner with lounge vibes, or a date night that includes something fun nearby. TheOutHaven helps turn your idea into a complete outing.</p>
          <p className="font-bold text-white/88">Tell us the whole plan once — we’ll help you find the food, the vibe, and what to do after.</p>
        </div>
      </div>
    </section>
  );
}

function LaunchFormCard() {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 shadow-2xl shadow-black/30 sm:p-7">
      <p className="text-xs font-black uppercase tracking-[0.30em] text-rose-200">TheOutHaven Launch Giveaway</p>
      <h2 className="mt-3 text-3xl font-black tracking-[-0.03em] sm:text-4xl">Join the Launch List.</h2>
      <p className="mt-3 text-sm leading-6 text-white/62">Join the Launch List for early access, NYC outing ideas, and a chance to win a $100 gift card.</p>
      <div className="mt-6">
        <LaunchWaitlistForm />
      </div>
    </section>
  );
}

function GiveawayRulesCard() {
  return (
    <aside className="space-y-5 rounded-[2rem] border border-rose-300/18 bg-[radial-gradient(circle_at_top_right,rgba(225,29,72,0.18),transparent_36%),rgba(255,255,255,0.045)] p-6 shadow-2xl shadow-black/25">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.30em] text-rose-200">$100 gift card</p>
        <h2 className="mt-3 text-3xl font-black tracking-[-0.03em]">How to enter:</h2>
      </div>
      <ol className="space-y-3 text-sm font-bold leading-6 text-white/78">
        <li>1. Join the Launch List.</li>
        <li>2. Enter the $100 gift card giveaway.</li>
        <li>3. Follow @TheOutHaven on Instagram or TikTok.</li>
        <li>4. Tag 2 friends in the giveaway post comments.</li>
        <li>5. Verify your email.</li>
      </ol>
      <div className="rounded-3xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-white/58">
        Almost done means almost done: you are not shown “You&rsquo;ve been entered into the prize giveaway.” until email verification succeeds.
      </div>
      <p className="text-xs leading-5 text-white/45">No purchase necessary. Must be 18+. One winner selected at random. Prize is a $100 gift card. TheOutHaven is not responsible for third-party availability, terms, or restrictions.</p>
    </aside>
  );
}

function HowItWorks() {
  return (
    <section className="space-y-6">
      <div className="max-w-3xl">
        <p className="text-xs font-black uppercase tracking-[0.30em] text-rose-200">How it works</p>
        <h2 className="mt-3 text-4xl font-black tracking-[-0.035em] sm:text-5xl">Plan around the whole outing.</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {howItWorks.map((step, index) => (
          <div key={step.title} className="rounded-3xl border border-white/10 bg-white/[0.055] p-5">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-rose-500 text-sm font-black">{index + 1}</span>
            <h3 className="mt-4 text-xl font-black">{step.title}</h3>
            <p className="mt-3 text-sm leading-6 text-white/58">{step.copy}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function SocialFollow() {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 text-center sm:p-8">
      <p className="text-xs font-black uppercase tracking-[0.30em] text-rose-200">Social step</p>
      <h2 className="mt-3 text-3xl font-black tracking-[-0.03em]">Follow @TheOutHaven on Instagram/TikTok</h2>
      <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-white/62">After joining, follow @TheOutHaven on Instagram or TikTok and tag 2 friends on the giveaway post. Social actions are manually reviewed before an entry is marked verified.</p>
      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
        <a href="https://www.instagram.com/TheOutHaven" className="rounded-full border border-white/10 bg-white/[0.07] px-6 py-3 text-sm font-black text-white">Follow on Instagram</a>
        <a href="https://www.tiktok.com/@TheOutHaven" className="rounded-full border border-white/10 bg-white/[0.07] px-6 py-3 text-sm font-black text-white">Follow on TikTok</a>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/10 px-5 py-8 text-center text-xs leading-5 text-white/45 sm:px-6 lg:px-8">
      <p>Launching Late Summer 2026. No purchase necessary. Must be 18+. One winner selected at random. Prize is a $100 gift card. TheOutHaven is not responsible for third-party availability, terms, or restrictions.</p>
    </footer>
  );
}
