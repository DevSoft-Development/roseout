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
    "Join TheOutHaven prelaunch access and be first to experience AI-powered outing planning for restaurants, activities, and complete plans.",
  path: "/",
});

const benefits = [
  {
    icon: "⌕",
    title: "One search for the full plan",
    copy: "Tell us the mood, food, location, budget, and what you want to do after. We handle the rest.",
  },
  {
    icon: "⌁",
    title: "Restaurant + activity matches",
    copy: "TheOutHaven pairs places that fit together instead of sending you back to another tab.",
  },
  {
    icon: "⌖",
    title: "Built for NYC + Long Island",
    copy: "Local-first recommendations shaped around the neighborhoods and areas people actually visit.",
  },
  {
    icon: "✦",
    title: "Designed for better OUTings",
    copy: "Less scrolling, fewer group-chat debates, and a clearer path from idea to complete plan.",
  },
];

const steps = [
  {
    title: "Tell us what you want",
    copy: "Share your vibe, occasion, budget, area, and preferences in one natural sentence.",
  },
  {
    title: "We build your OUTing",
    copy: "Our AI finds a restaurant and activity combination tailored to your plan.",
  },
  {
    title: "Go out and enjoy",
    copy: "Review the details, save your plan, and spend less time organizing the night.",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#050505] text-white">
      <RecoveryRedirect />
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_92%_23%,rgba(225,6,42,0.16),transparent_23%),radial-gradient(circle_at_8%_15%,rgba(255,255,255,0.035),transparent_22%),linear-gradient(180deg,#050505_0%,#070707_100%)]" />
      <BetaLaunchHeader />

      <section className="px-5 pb-16 pt-12 sm:px-6 lg:px-8 lg:pt-16">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-14 border-b border-white/10 pb-16 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
            <div className="max-w-2xl">
              <span className="inline-flex rounded-full border border-[#e1062a]/60 bg-[#e1062a]/8 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-red-100">
                Prelaunch Access
              </span>

              <h1 className="mt-8 text-5xl font-black leading-[0.92] tracking-[-0.06em] sm:text-6xl lg:text-7xl xl:text-[5.65rem]">
                Plan better <span className="text-[#e1062a]">OUT</span>ings.
              </h1>

              <p className="mt-7 max-w-xl text-lg leading-8 text-white/68 sm:text-xl">
                TheOutHaven is your AI outing assistant for restaurants, drinks, activities, and complete plans—all in one search.
              </p>

              <div id="launch-list" className="mt-8 max-w-xl scroll-mt-28">
                <PrelaunchAccessForm />
              </div>

              <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3 text-xs font-bold text-white/50 sm:text-sm">
                <span>◈ No spam</span>
                <span>✦ First access</span>
                <span>↻ Leave anytime</span>
              </div>
            </div>

            <ProductPreview />
          </div>

          <section className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="TheOutHaven benefits">
            {benefits.map((benefit) => (
              <article key={benefit.title} className="rounded-[1.5rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.018))] p-6 shadow-[0_22px_70px_rgba(0,0,0,0.28)]">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[#e1062a]/80 text-xl text-[#e1062a]">
                  {benefit.icon}
                </div>
                <h2 className="mt-7 text-xl font-black leading-tight">{benefit.title}</h2>
                <p className="mt-4 text-sm leading-6 text-white/56">{benefit.copy}</p>
              </article>
            ))}
          </section>

          <section id="how-it-works" className="py-20">
            <div className="text-center">
              <p className="text-xs font-black uppercase tracking-[0.28em] text-[#e1062a]">How it works</p>
              <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">Three simple steps.</h2>
            </div>
            <div className="relative mt-12 grid gap-8 md:grid-cols-3">
              <div className="pointer-events-none absolute left-[16%] right-[16%] top-8 hidden border-t border-dashed border-white/15 md:block" />
              {steps.map((step, index) => (
                <article key={step.title} className="relative text-center">
                  <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-[#0c0c0c] text-2xl shadow-xl shadow-black/40">
                    {index === 0 ? "□" : index === 1 ? "✦" : "▣"}
                  </span>
                  <span className="absolute left-1/2 top-0 flex h-6 w-6 -translate-x-[2.35rem] -translate-y-1/2 items-center justify-center rounded-full bg-[#e1062a] text-[0.65rem] font-black">
                    {index + 1}
                  </span>
                  <h3 className="mt-6 text-lg font-black">{step.title}</h3>
                  <p className="mx-auto mt-3 max-w-xs text-sm leading-6 text-white/55">{step.copy}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[linear-gradient(100deg,#090909_0%,#0b0707_55%,#250707_100%)] p-8 sm:p-10">
            <div className="pointer-events-none absolute -bottom-24 right-8 h-72 w-72 rounded-full border border-[#e1062a]/20 opacity-70" />
            <div className="pointer-events-none absolute bottom-0 right-0 h-48 w-[42%] bg-[linear-gradient(135deg,transparent_25%,rgba(225,6,42,0.14))]" />
            <div className="relative max-w-2xl">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-[#e1062a]">For business owners</p>
              <h2 className="mt-4 text-3xl font-black sm:text-4xl">Be discoverable when people are ready to go out.</h2>
              <p className="mt-4 max-w-xl text-base leading-7 text-white/60">
                Put your restaurant, bar, venue, or experience in front of people actively planning what to do next.
              </p>
              <Link href="/business" className="mt-7 inline-flex rounded-xl bg-[#e1062a] px-6 py-3.5 text-sm font-black text-white transition hover:bg-red-500">
                Learn About Business Listings →
              </Link>
            </div>
          </section>
        </div>
      </section>

      <footer className="border-t border-white/10 px-5 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 sm:grid-cols-2 lg:grid-cols-[1.2fr_0.7fr_0.7fr_0.8fr]">
          <Link href="/" className="flex items-start gap-3" aria-label="TheOutHaven home">
            <Image src="/toh_logo.png" alt="TheOutHaven logo" width={46} height={46} className="h-11 w-11 rounded-full object-contain" />
            <div>
              <p className="text-lg font-black">TheOutHaven</p>
              <p className="mt-1 text-xs text-white/45">Plan better <span className="text-[#e1062a]">OUT</span>ings.</p>
            </div>
          </Link>
          <FooterColumn title="Company" links={[["How It Works", "#how-it-works"], ["For Businesses", "/business"], ["About", "/about"]]} />
          <FooterColumn title="Legal" links={[["Privacy Policy", "/privacy"], ["Terms of Service", "/terms"]]} />
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-white/70">Connect</p>
            <a href="mailto:hello@theouthaven.com" className="mt-4 block text-sm text-white/50 hover:text-white">hello@theouthaven.com</a>
            <p className="mt-6 text-xs leading-5 text-white/35">© 2026 TheOutHaven. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}

function ProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[650px]" data-testid="product-preview">
      <div className="absolute -right-16 top-1/4 h-80 w-80 rounded-full bg-[#e1062a]/18 blur-[120px]" />
      <div className="relative rounded-[2rem] border border-white/20 bg-[#080808] p-3 shadow-[0_38px_120px_rgba(0,0,0,0.68)]">
        <div className="rounded-[1.55rem] border border-white/10 bg-black p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <Image src="/toh_logo.png" alt="TheOutHaven logo" width={40} height={40} className="h-10 w-10 rounded-full object-contain" priority />
            <span className="text-base font-black">TheOutHaven</span>
          </div>

          <h2 className="mt-7 text-3xl font-black leading-tight sm:text-4xl">What are you<br />in the mood for?</h2>

          <div className="mt-6 flex items-center justify-between rounded-2xl border border-white/5 bg-white/[0.08] p-4">
            <p className="max-w-[19rem] text-sm leading-6 text-white/85 sm:text-base">Dinner and a rooftop bar in Manhattan</p>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#e1062a] text-2xl">›</span>
          </div>

          <p className="mt-7 text-sm font-black">AI Recommended <span className="text-[#e1062a]">OUT</span>ing</p>

          <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-stretch gap-3">
            <PlaceCard kind="Restaurant" title="Quality Italian" meta="Italian · $$" rating="4.6 (812)" variant="restaurant" />
            <div className="flex flex-col items-center justify-center text-center text-[0.68rem] font-black text-white/75 sm:text-xs">
              <span className="text-xl">↟</span>
              <span>18 min<br />walk</span>
            </div>
            <PlaceCard kind="Rooftop" title="Westlight Rooftop" meta="Rooftop Bar · $$" rating="4.4 (620)" variant="activity" />
          </div>

          <button type="button" className="mt-5 w-full rounded-xl bg-[#e1062a] px-5 py-4 text-sm font-black text-white">View Full Details</button>
        </div>
      </div>

      <div className="absolute -bottom-8 -right-4 hidden w-[31%] rotate-[3deg] rounded-[2rem] border border-white/25 bg-[#080808] p-2 shadow-[0_28px_90px_rgba(0,0,0,0.7)] xl:block" aria-hidden="true">
        <div className="rounded-[1.55rem] border border-white/10 bg-black p-4">
          <div className="flex items-center gap-2">
            <Image src="/toh_logo.png" alt="" width={26} height={26} className="h-7 w-7 rounded-full object-contain" />
            <span className="text-[0.7rem] font-black">TheOutHaven</span>
          </div>
          <p className="mt-5 text-xl font-black leading-none">Your <span className="text-[#e1062a]">OUT</span>ing<br />is ready.</p>
          <div className="mt-5 h-20 rounded-xl border border-white/10 bg-[linear-gradient(135deg,#33140d,#111)]" />
          <div className="mt-3 h-20 rounded-xl border border-white/10 bg-[linear-gradient(135deg,#101820,#2b1010)]" />
          <div className="mt-4 rounded-lg bg-[#e1062a] px-3 py-2 text-center text-[0.65rem] font-black">View Full Details</div>
        </div>
      </div>
    </div>
  );
}

function PlaceCard({ kind, title, meta, rating, variant }: { kind: string; title: string; meta: string; rating: string; variant: "restaurant" | "activity" }) {
  const background = variant === "restaurant"
    ? "bg-[radial-gradient(circle_at_72%_28%,rgba(225,100,45,0.28),transparent_22%),linear-gradient(135deg,#2c120b,#090909_70%)]"
    : "bg-[radial-gradient(circle_at_72%_25%,rgba(225,6,42,0.20),transparent_24%),linear-gradient(135deg,#0a1117,#1c0b0b_75%)]";

  return (
    <article className="min-w-0 overflow-hidden rounded-xl border border-white/5 bg-white/[0.055]" data-testid={`place-card-${variant}`}>
      <div className={`relative aspect-[1.2/1] overflow-hidden ${background}`}>
        <div className="absolute inset-x-0 bottom-0 h-[52%] bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.76))]" />
        <div className="absolute left-[12%] top-[16%] h-[45%] w-[34%] rounded-t-full border border-white/10 bg-white/[0.04]" />
        <div className="absolute bottom-[18%] right-[12%] h-[34%] w-[42%] rounded-lg border border-white/10 bg-white/[0.05]" />
        <span className="absolute bottom-3 left-3 text-[0.62rem] font-black uppercase tracking-[0.18em] text-white/50">{kind}</span>
      </div>
      <div className="p-3">
        <h3 className="truncate text-sm font-black">{title}</h3>
        <p className="mt-1 truncate text-xs text-white/55">{meta}</p>
        <p className="mt-2 text-xs text-amber-300">★ <span className="text-white/65">{rating}</span></p>
      </div>
    </article>
  );
}

function FooterColumn({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-[0.18em] text-white/70">{title}</p>
      <div className="mt-4 space-y-3">
        {links.map(([label, href]) => (
          <Link key={label} href={href} className="block text-sm text-white/50 hover:text-white">{label}</Link>
        ))}
      </div>
    </div>
  );
}
