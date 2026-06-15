import type { Metadata } from "next";
import Link from "next/link";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";
import { buildMetadata } from "@/lib/seo";


export const metadata: Metadata = buildMetadata({
  title: "Business Listings",
  description:
    "Claim and manage a TheOutHaven business listing so guests can discover accurate restaurant, activity, contact, and reservation details.",
  path: "/business",
});

const claimCta = "/business/claim";
const plansCta = "/business#plans";

const proofItems = [
  "A growing network of local favorites",
  "Built for NYC, Queens, Brooklyn, Long Island & beyond",
  "Restaurants, lounges, rooftops, activities & event spaces",
  "Discovery, calls, reservations & analytics in one place",
];

const howItWorks = [
  {
    title: "1. Scan or enter your claim code",
    text: "Use the QR code or claim code from your TheOutHaven postcard to pull up the correct location automatically.",
  },
  {
    title: "2. Verify and complete your profile",
    text: "Confirm your business details, add photos, update links, and make sure guests see the right information.",
  },
  {
    title: "3. Activate Partner Plan when ready",
    text: "TheOutHaven Partner Plan includes a standalone reservation portal, website embed, guest management, waitlist tools, reminders, analytics, and discovery.",
  },
];

const businessTools = [
  {
    title: "Show up in outing searches",
    text: "Reach customers looking for real plans like steak dinner in Queens, rooftop drinks, hookah after dinner, brunch spots, or local activities.",
  },
  {
    title: "Turn interest into action",
    text: "Keep your profile accurate so guests can view details, call, reserve, save, share, and visit with confidence.",
  },
  {
    title: "Manage guest demand",
    text: "With Pro, manage reservations, waitlists, guest notes, phone calls, SMS reminders, and customer interest from one place.",
  },
  {
    title: "Understand what works",
    text: "Review analytics and business insights so you can see how guests discover your location and which actions drive demand.",
  },
];

const venueTypes = [
  "Restaurants",
  "Lounges",
  "Rooftops",
  "Brunch spots",
  "Hookah lounges",
  "Nightlife",
  "Event spaces",
  "Activities",
  "Local experiences",
];

const freeFeatures = [
  "Claimed business profile",
  "Basic profile visibility and discovery",
  "Accurate contact details and guest actions",
  "Website, phone, and reservation links",
  "Photos and profile updates when supported",
];

const proFeatures = [
  "Everything in Free Discovery",
  "Reserve features included",
  "Reservations and waitlists",
  "Guest management and notes",
  "SMS reminders",
  "Analytics and advanced business tools",
];

export default function BusinessPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#050505] text-white">
      <TheOutHavenHeader />
      <HeroSection />
      <ProofRow />

      <Section className="pt-8">
        <SectionHeader
          eyebrow="How it works"
          title="How TheOutHaven Works for Your Business"
          text="Scan your claim code, verify your location, then upgrade to Pro when you are ready for reservations, guest tools, and analytics."
          centered
        />
        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {howItWorks.map((item) => (
            <SimpleCard key={item.title} title={item.title} text={item.text} />
          ))}
        </div>
      </Section>

      <Section className="border-y border-white/10 bg-[#080808]">
        <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <SectionHeader
            eyebrow="Business tools"
            title="Built for local businesses that turn searches into visits"
            text="TheOutHaven helps restaurant owners, lounge owners, rooftop venues, nightlife businesses, event spaces, activity operators, and local experience owners stay visible when customers are planning where to go next."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {businessTools.map((tool) => (
              <SimpleCard key={tool.title} title={tool.title} text={tool.text} compact />
            ))}
          </div>
        </div>
      </Section>

      <Section>
        <SectionHeader eyebrow="Venue types" title="Made for neighborhood favorites and premium local experiences" centered />
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {venueTypes.map((venue) => (
            <VenueCard key={venue} title={venue} />
          ))}
        </div>
      </Section>

      <Section id="plans" className="border-y border-white/10 bg-[#080808]">
        <SectionHeader
          eyebrow="Plans"
          title="Choose TheOutHaven Partner Plan"
          text="Claim your profile first. Activate TheOutHaven Partner Plan when you are ready for a standalone reservation portal, website embed, owner dashboard, guest tools, analytics, and discovery."
          centered
        />
        <div className="mt-10 grid gap-5 lg:grid-cols-2">
          <PricingCard
            title="Free Discovery"
            price="Free"
            description="Keep your business visible on TheOutHaven with a claimed profile, accurate contact details, guest actions, and basic discovery."
            features={freeFeatures}
            cta="Claim Your Location"
            href={claimCta}
          />
          <PricingCard
            title="TheOutHaven Partner Plan — $99/month"
            price="$99"
            period="/month"
            description="Includes a standalone reservation portal, website embed, waitlist, guest management, reminders, analytics, and owner tools."
            features={proFeatures}
            cta="Start Pro"
            href={claimCta}
            highlighted
          />
        </div>
      </Section>

      <section className="relative overflow-hidden px-4 py-20 sm:px-6 lg:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(225,6,42,0.2),transparent_38%)]" />
        <div className="relative mx-auto max-w-5xl rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 text-center shadow-2xl shadow-red-500/10 sm:p-12 lg:p-16">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-[#e1062a]">TheOutHaven for Business</p>
          <h2 className="mt-5 text-4xl font-black tracking-tight md:text-6xl">Ready to bring more guests to your business?</h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-white/60 md:text-lg">
            Use your TheOutHaven claim code to claim your profile, keep your listing accurate, and upgrade to Pro when you are ready to manage reservations, guests, and analytics from one place.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <CtaLink href={claimCta}>Claim Your Location</CtaLink>
            <CtaLink href={plansCta} variant="secondary">See Plans</CtaLink>
          </div>
        </div>
      </section>
    </main>
  );
}

function HeroSection() {
  return (
    <section className="relative overflow-hidden px-4 pb-10 pt-28 sm:px-6 sm:pt-32 lg:px-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(225,6,42,0.26),transparent_32%),radial-gradient(circle_at_80%_10%,rgba(255,255,255,0.1),transparent_24%),linear-gradient(180deg,#080808_0%,#050505_76%)]" />
      <div className="absolute left-1/2 top-20 h-72 w-72 -translate-x-1/2 rounded-full bg-[#e1062a]/10 blur-3xl" />
      <div className="relative mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.35em] text-[#e1062a]">For local business owners</p>
          <h1 className="mt-5 max-w-4xl text-5xl font-black leading-[0.98] tracking-tight sm:text-6xl lg:text-7xl">
            Get Discovered by People Planning Their Next Outing
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-white/68">
            TheOutHaven helps restaurants, lounges, rooftops, activities, and event spaces show up in AI-powered outing searches, turn guest interest into profile views, calls, reservations, and visits, and gives business owners a simple way to claim and manage their listing.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <CtaLink href={claimCta}>Claim Your Location</CtaLink>
            <CtaLink href={plansCta} variant="secondary">See Plans</CtaLink>
          </div>
        </div>
        <DashboardVisual />
      </div>
    </section>
  );
}

function ProofRow() {
  return (
    <section className="px-4 pb-10 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-wrap gap-3">
        {proofItems.map((item) => (
          <div key={item} className="rounded-full border border-white/10 bg-white/[0.045] px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-white/66">
            {item}
          </div>
        ))}
      </div>
    </section>
  );
}

function DashboardVisual() {
  const rows = ["Profile views", "Guest calls", "Reservations", "Saved plans"];
  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-3 shadow-2xl shadow-red-500/10 backdrop-blur sm:rounded-[2.5rem] sm:p-5">
      <div className="overflow-hidden rounded-[1.55rem] border border-white/10 bg-[#070707] sm:rounded-[2rem]">
        <div className="border-b border-white/10 px-5 py-5">
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#e1062a]">Location owner dashboard</p>
          <p className="mt-2 text-xl font-black">Tonight&apos;s guest actions</p>
        </div>
        <div className="grid gap-4 p-5 sm:p-6">
          {rows.map((row, index) => (
            <div key={row} className="rounded-2xl border border-white/10 bg-black px-4 py-4">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm font-black">{row}</p>
                <span className="rounded-full bg-[#e1062a]/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-red-100">
                  {index === 2 ? "Pro" : "Live"}
                </span>
              </div>
              <div className="mt-3 h-2 rounded-full bg-white/10">
                <div className="h-2 rounded-full bg-[#e1062a]" style={{ width: `${55 + index * 10}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Section({ children, className = "", id }: { children: React.ReactNode; className?: string; id?: string }) {
  return <section id={id} className={`px-4 py-16 sm:px-6 sm:py-20 lg:px-8 ${className}`}><div className="mx-auto max-w-7xl">{children}</div></section>;
}

function SectionHeader({ eyebrow, title, text, centered = false }: { eyebrow: string; title: string; text?: string; centered?: boolean }) {
  return (
    <div className={centered ? "mx-auto max-w-3xl text-center" : "max-w-3xl"}>
      <p className="text-xs font-black uppercase tracking-[0.32em] text-[#e1062a]">{eyebrow}</p>
      <h2 className="mt-4 text-4xl font-black tracking-tight md:text-5xl">{title}</h2>
      {text && <p className="mt-4 text-base leading-7 text-white/58 md:text-lg">{text}</p>}
    </div>
  );
}

function SimpleCard({ title, text, compact = false }: { title: string; text: string; compact?: boolean }) {
  return (
    <article className={`rounded-[2rem] border border-white/10 bg-white/[0.045] shadow-2xl shadow-black/20 ${compact ? "p-5" : "p-6 sm:p-7"}`}>
      <div className="mb-5 h-9 w-9 rounded-full bg-[#e1062a]/18 ring-1 ring-[#e1062a]/30" />
      <h3 className="text-xl font-black tracking-tight">{title}</h3>
      <p className="mt-3 text-sm font-semibold leading-6 text-white/60">{text}</p>
    </article>
  );
}

function VenueCard({ title }: { title: string }) {
  return (
    <article className="rounded-[1.5rem] border border-white/10 bg-black p-5 transition hover:border-[#e1062a]/45 hover:bg-[#100609]">
      <h3 className="text-lg font-black">{title}</h3>
      <p className="mt-3 text-xs font-black uppercase tracking-[0.14em] text-white/38">Discovery • Calls • Reservations • Guest actions</p>
    </article>
  );
}

function PricingCard({ title, price, period, description, features, cta, href, highlighted = false }: { title: string; price: string; period?: string; description: string; features: string[]; cta: string; href: string; highlighted?: boolean }) {
  return (
    <article className={`relative flex h-full flex-col rounded-[2rem] border p-6 shadow-2xl sm:p-8 ${highlighted ? "border-[#e1062a]/70 bg-[linear-gradient(180deg,rgba(225,6,42,0.2),rgba(255,255,255,0.045))] shadow-red-500/15" : "border-white/10 bg-black shadow-black/40"}`}>
      {highlighted && <span className="mb-5 w-fit rounded-full bg-[#e1062a] px-4 py-2 text-xs font-black uppercase tracking-[0.18em]">Partner Plan includes reservations</span>}
      <h3 className="text-3xl font-black tracking-tight">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-white/55">{description}</p>
      <div className="mt-6 flex items-end gap-1"><p className="text-5xl font-black">{price}</p>{period && <p className="pb-2 text-sm font-black text-white/45">{period}</p>}</div>
      <ul className="mt-7 flex-1 space-y-3">
        {features.map((feature) => <li key={feature} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-sm font-semibold leading-6 text-white/66">✓ {feature}</li>)}
      </ul>
      <CtaLink href={href} className="mt-7 w-full justify-center" variant={highlighted ? "primary" : "secondary"}>{cta}</CtaLink>
    </article>
  );
}

function CtaLink({ href, children, variant = "primary", className = "" }: { href: string; children: React.ReactNode; variant?: "primary" | "secondary"; className?: string }) {
  return (
    <Link href={href} className={`inline-flex items-center justify-center rounded-2xl px-7 py-4 text-sm font-black transition duration-200 ${variant === "primary" ? "bg-[#e1062a] text-white shadow-2xl shadow-red-500/25 hover:bg-red-500" : "border border-white/15 bg-white/[0.05] text-white/85 hover:bg-white hover:text-black"} ${className}`}>
      {children}
    </Link>
  );
}
