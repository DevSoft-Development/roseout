import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import BetaLaunchHeader from "@/components/BetaLaunchHeader";
import RecoveryRedirect from "@/components/RecoveryRedirect";
import PrelaunchAccessForm from "@/components/launch/PrelaunchAccessForm";
import { buildMetadata } from "@/lib/seo";

export const revalidate = 300;

export const metadata: Metadata = buildMetadata({
  title: "Plan better OUTings.",
  description:
    "Join TheOutHaven prelaunch access and be first to experience AI-powered restaurant and activity planning.",
  path: "/",
});

const benefits = [
  {
    icon: "✦",
    title: "AI-Powered Recommendations",
    copy: "TheOutHaven curates restaurant and activity pairings around your mood, location, and vibe.",
  },
  {
    icon: "⌖",
    title: "Save Time & Stress",
    copy: "Skip endless tabs and group chats. Get a complete outing plan in seconds.",
  },
  {
    icon: "◎",
    title: "Better OUTings, Every Time",
    copy: "From date night to friend nights out, make every outing easier to plan.",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#050505] text-white">
      <RecoveryRedirect />
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_92%_29%,rgba(225,6,42,0.23),transparent_24%),linear-gradient(180deg,#050505_0%,#070707_100%)]" />
      <BetaLaunchHeader />

      <section className="px-5 pb-14 pt-12 sm:px-6 lg:px-8 lg:pt-16">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-14 lg:grid-cols-[1.02fr_0.98fr] lg:items-center">
            <div className="max-w-2xl">
              <span className="inline-flex rounded-full border border-[#e1062a]/70 bg-[#e1062a]/10 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-red-100">
                Prelaunch Access
              </span>

              <h1 className="mt-8 text-5xl font-black leading-[0.94] tracking-[-0.055em] sm:text-6xl lg:text-7xl xl:text-[5.5rem]">
                Plan better <span className="text-[#e1062a]">OUT</span>ings.
              </h1>

              <p className="mt-7 max-w-xl text-lg leading-8 text-white/68 sm:text-xl">
                TheOutHaven is your AI outing assistant that finds the perfect restaurant and activity—so you can stop searching and start enjoying.
              </p>

              <div className="my-8 h-px bg-white/10" />

              <p className="text-xl font-black">
                <span className="text-[#e1062a]">Be the first to experience</span> TheOutHaven.
              </p>
              <p className="mt-2 max-w-xl text-base leading-7 text-white/62">
                Join the prelaunch list for early access, product updates, and launch-day perks.
              </p>

              <div id="launch-list" className="mt-7 max-w-xl scroll-mt-28">
                <PrelaunchAccessForm />
              </div>
            </div>

            <ProductPreview />
          </div>

          <section className="mt-16 grid overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#0a0a0a] md:grid-cols-3">
            {benefits.map((benefit, index) => (
              <article
                key={benefit.title}
                className={`px-7 py-9 text-center ${index > 0 ? "border-t border-white/10 md:border-l md:border-t-0" : ""}`}
              >
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-[#e1062a] text-3xl text-[#e1062a]">
                  {benefit.icon}
                </div>
                <h2 className="mx-auto mt-5 max-w-[16rem] text-xl font-black leading-tight">{benefit.title}</h2>
                <p className="mx-auto mt-4 max-w-xs text-sm leading-6 text-white/58">{benefit.copy}</p>
              </article>
            ))}
          </section>

          <section className="mt-8 flex flex-col gap-6 rounded-[1.75rem] border border-white/10 bg-[#0a0a0a] p-7 sm:flex-row sm:items-center sm:justify-between sm:p-9">
            <div className="flex items-center gap-5">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#e1062a]/20 text-3xl text-[#e1062a]">▣</div>
              <div>
                <h2 className="text-2xl font-black">Launching Late Summer 2026</h2>
                <p className="mt-1 text-base text-white/58">Be first in line for exclusive early access.</p>
              </div>
            </div>
            <a href="#launch-list" className="rounded-xl border border-white/15 px-7 py-4 text-center text-sm font-black transition hover:border-[#e1062a] hover:bg-[#e1062a]">
              Join the List
            </a>
          </section>
        </div>
      </section>

      <footer className="border-t border-white/10 px-5 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="flex items-center gap-3" aria-label="TheOutHaven home">
            <Image src="/toh_logo.png" alt="TheOutHaven logo" width={46} height={46} className="h-11 w-11 rounded-full object-contain" />
            <div>
              <p className="text-lg font-black">TheOutHaven</p>
              <p className="text-xs text-white/45">Plan better OUTings.</p>
            </div>
          </Link>
          <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-white/55">
            <Link href="/privacy" className="hover:text-white">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-white">Terms of Service</Link>
            <Link href="/business" className="hover:text-white">For Businesses</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

function ProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[470px]">
      <div className="absolute -right-20 top-1/4 h-72 w-72 rounded-full bg-[#e1062a]/25 blur-[110px]" />
      <div className="relative rounded-[3rem] border border-white/25 bg-[#080808] p-3 shadow-[0_30px_100px_rgba(0,0,0,0.65)]">
        <div className="rounded-[2.4rem] border border-white/10 bg-black p-6 sm:p-7">
          <div className="flex items-center gap-3">
            <Image src="/toh_logo.png" alt="TheOutHaven logo" width={42} height={42} className="h-10 w-10 rounded-full object-contain" priority />
            <span className="text-lg font-black">TheOutHaven</span>
          </div>

          <h2 className="mt-8 text-3xl font-black leading-tight">What are you<br />in the mood for?</h2>

          <div className="mt-6 flex items-center justify-between rounded-2xl bg-white/[0.08] p-4">
            <p className="max-w-[15rem] text-base leading-6 text-white/85">Dinner and a rooftop bar in Manhattan</p>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#e1062a] text-2xl">›</span>
          </div>

          <p className="mt-7 text-sm font-black">AI Recommended <span className="text-[#e1062a]">OUT</span>ing</p>

          <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
            <PlaceCard image="/images/landing/restaurant-placeholder.jpg" fallback="Restaurant" title="Quality Italian" meta="Italian · $$" rating="4.6 (812)" />
            <div className="flex flex-col items-center justify-center text-center text-xs font-black text-white/80">
              <span className="text-xl">↟</span>
              <span>18 min<br />walk</span>
            </div>
            <PlaceCard image="/images/landing/activity-placeholder.jpg" fallback="Rooftop" title="Westlight Rooftop" meta="Rooftop Bar · $$" rating="4.4 (620)" />
          </div>

          <button type="button" className="mt-5 w-full rounded-xl bg-[#e1062a] px-5 py-4 text-sm font-black text-white">View Full Details</button>
        </div>
      </div>
    </div>
  );
}

function PlaceCard({ image, fallback, title, meta, rating }: { image: string; fallback: string; title: string; meta: string; rating: string }) {
  return (
    <article className="min-w-0 overflow-hidden rounded-xl bg-white/[0.055]">
      <div className="relative aspect-[1.15/1] bg-[linear-gradient(135deg,#30130b,#090909)]">
        <Image src={image} alt="" fill className="object-cover" sizes="180px" />
        <span className="absolute inset-0 flex items-center justify-center text-xs font-black uppercase tracking-[0.16em] text-white/35">{fallback}</span>
      </div>
      <div className="p-3">
        <h3 className="truncate text-sm font-black">{title}</h3>
        <p className="mt-1 truncate text-xs text-white/55">{meta}</p>
        <p className="mt-2 text-xs text-amber-300">★ <span className="text-white/65">{rating}</span></p>
      </div>
    </article>
  );
}
