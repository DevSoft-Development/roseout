import type { Metadata } from "next";
import Link from "next/link";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";
import PartnerProPricingCard from "@/components/business/PartnerProPricingCard";
import { buildMetadata } from "@/lib/seo";


export const metadata: Metadata = buildMetadata({
  title: "Business Listings",
  description:
    "Claim and manage a TheOutHaven business listing so guests can discover accurate restaurant, activity, contact, and reservation details.",
  path: "/business",
});

const claimCta = "/business/claim/no-code";
const plansCta = "/business#plans";

const proofItems = [
  "A growing network of local favorites",
  "Built for NYC, Queens, Brooklyn, Long Island & beyond",
  "Restaurants, lounges, rooftops, activities & event spaces",
  "Discovery, calls, reservations & analytics in one place",
];

const howItWorks = [
  {
    title: "1. Find your business",
    text: "Search our live directory by business name, address, city, or ZIP code. If it is not listed, submit a new location for review.",
  },
  {
    title: "2. Verify and complete your profile",
    text: "Confirm your business details, add photos, update links, and make sure guests see the right information.",
  },
  {
    title: "3. Activate Partner Pro when ready",
    text: "Partner Pro includes a standalone reservation portal, website embed, guest management, waitlist tools, reminders, analytics, and discovery.",
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
  "Show up when guests search for outings on TheOutHaven",
  "Claim and manage your verified business profile",
  "Keep photos, contact details, and business information accurate",
  "Send guests to your phone, website, or existing reservation link",
  "Turn profile views into calls, clicks, saves, and shares",
];

const planFeatureGroups = [
  {
    title: "Discovery and business profile",
    features: [
      ["Claimed and verified business profile", "Included", "Included"],
      ["Placement in TheOutHaven search", "Standard", "Boosted"],
      ["AI-powered discovery", "Limited", "Priority"],
      ["Business photos", "1 photo", "Up to 10 photos"],
      ["Business details and contact links", "Core details", "Menu, website, phone and socials"],
      ["Branding workspace", "—", "Included"],
      ["Menu and package management", "—", "Included"],
      ["QR growth tools", "—", "Included"],
    ],
  },
  {
    title: "Reservations and venue operations",
    features: [
      ["TheOutHaven Reserve bookings", "—", "Included"],
      ["Hosted reservation portal", "—", "Included"],
      ["Website reservation embed", "—", "Included"],
      ["Availability and booking hours", "—", "Included"],
      ["Location layout builder and live map", "—", "Included"],
      ["Hostess and operator view", "—", "Included"],
      ["Reservation and waitlist dashboard", "—", "Included"],
      ["SMS confirmations and reminders", "—", "Included"],
      ["Waitlist texting and table-ready messages", "—", "Included"],
      ["Add-to-calendar links", "—", "Included"],
      ["Reservation deposits and Stripe payouts", "—", "Available"],
    ],
  },
  {
    title: "Guests, marketing and growth",
    features: [
      ["Guest details and private notes", "—", "Included"],
      ["Lead tracking", "—", "Included"],
      ["Offers and promotions", "—", "Included"],
      ["VIP list tools", "—", "Included"],
      ["Guest messaging", "—", "Included"],
      ["Reviews and feedback workspace", "—", "Included"],
      ["Marketing Studio", "—", "Included"],
      ["Business notifications", "—", "Included"],
      ["Analytics", "Profile views", "Views, clicks and bookings"],
    ],
  },
] as const;

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
          text="Find or add your location, verify ownership, then activate Partner Pro when you are ready for reservations, guest tools, and analytics."
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
          title="Choose the plan that fits your business"
          text="Start with Essentials for free. Choose Partner Pro when you are ready to accept bookings, manage guest demand, reduce no-shows, and measure what drives visits."
          centered
        />
        <div className="mx-auto mt-10 grid max-w-6xl gap-5 lg:grid-cols-[0.8fr_1.2fr]">
          <PricingCard
            title="Essentials"
            price="Free"
            description="Build a trusted presence where guests plan outings, then send them directly to your existing contact and booking channels."
            features={freeFeatures}
            cta="Claim Your Location"
            href={claimCta}
          />
          <PartnerProPricingCard claimHref={claimCta} />
        </div>
        <PlanFeatureComparison />
      </Section>

      <section className="relative overflow-hidden px-4 py-20 sm:px-6 lg:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(225,6,42,0.2),transparent_38%)]" />
        <div className="relative mx-auto max-w-5xl rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 text-center shadow-2xl shadow-red-500/10 sm:p-12 lg:p-16">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-[#e1062a]">TheOutHaven for Business</p>
          <h2 className="mt-5 text-4xl font-black tracking-tight md:text-6xl">Ready to bring more guests to your business?</h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-white/60 md:text-lg">
            Search for your business or add a new location, keep your listing accurate, and upgrade to Partner Pro when you are ready to manage reservations, guests, and analytics from one place.
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

function PlanFeatureComparison() {
  return (
    <section
      aria-labelledby="full-plan-comparison"
      className="mx-auto mt-14 max-w-6xl overflow-hidden rounded-[2rem] border border-white/10 bg-black shadow-2xl shadow-black/35"
    >
      <div className="border-b border-white/10 bg-[linear-gradient(135deg,rgba(225,6,42,0.16),transparent_55%)] p-6 sm:p-8">
        <p className="text-xs font-black uppercase tracking-[0.28em] text-[#e1062a]">
          Complete feature list
        </p>
        <h3
          id="full-plan-comparison"
          className="mt-3 text-3xl font-black tracking-tight sm:text-4xl"
        >
          See exactly what each plan includes
        </h3>
        <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-white/55">
          Essentials builds your presence on TheOutHaven. Partner Pro adds the
          booking, guest-management, marketing, and analytics tools used to run
          and grow demand.
        </p>
      </div>

      <div className="divide-y divide-white/10">
        {planFeatureGroups.map((group) => (
          <div key={group.title} className="p-4 sm:p-6">
            <h4 className="px-2 text-sm font-black uppercase tracking-[0.18em] text-white/75">
              {group.title}
            </h4>
            <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
              <table className="w-full min-w-[680px] border-collapse text-left">
                <thead className="bg-white/[0.055]">
                  <tr>
                    <th
                      scope="col"
                      className="w-1/2 px-4 py-4 text-xs font-black uppercase tracking-[0.14em] text-white/45"
                    >
                      Feature
                    </th>
                    <th
                      scope="col"
                      className="w-1/4 px-4 py-4 text-xs font-black uppercase tracking-[0.14em] text-white/65"
                    >
                      Essentials
                    </th>
                    <th
                      scope="col"
                      className="w-1/4 bg-[#e1062a]/10 px-4 py-4 text-xs font-black uppercase tracking-[0.14em] text-red-100"
                    >
                      Partner Pro
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {group.features.map(([feature, essentials, pro]) => (
                    <tr key={feature} className="border-t border-white/10">
                      <th
                        scope="row"
                        className="px-4 py-4 text-sm font-bold text-white/80"
                      >
                        {feature}
                      </th>
                      <td className="px-4 py-4 text-sm font-semibold text-white/48">
                        {essentials === "—" ? (
                          <span aria-label="Not included">—</span>
                        ) : (
                          essentials
                        )}
                      </td>
                      <td className="bg-[#e1062a]/[0.055] px-4 py-4 text-sm font-black text-white">
                        <span className="mr-2 text-emerald-300" aria-hidden="true">
                          ✓
                        </span>
                        {pro}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-4 border-t border-white/10 bg-white/[0.035] p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div>
          <p className="text-lg font-black">Ready to use the complete toolkit?</p>
          <p className="mt-1 text-xs font-semibold text-white/45">
            Choose monthly or annual billing above. Taxes are calculated at checkout.
          </p>
        </div>
        <CtaLink href={`${claimCta}?plan=monthly`}>
          Choose Partner Pro
        </CtaLink>
      </div>
    </section>
  );
}

function PricingCard({ title, price, period, description, features, cta, href, highlighted = false }: { title: string; price: string; period?: string; description: string; features: string[]; cta: string; href: string; highlighted?: boolean }) {
  return (
    <article className={`relative flex h-full flex-col rounded-[2rem] border p-6 shadow-2xl sm:p-8 ${highlighted ? "border-[#e1062a]/70 bg-[linear-gradient(180deg,rgba(225,6,42,0.2),rgba(255,255,255,0.045))] shadow-red-500/15" : "border-white/10 bg-black shadow-black/40"}`}>
      {highlighted && <span className="mb-5 w-fit rounded-full bg-[#e1062a] px-4 py-2 text-xs font-black uppercase tracking-[0.18em]">Partner Pro includes reservations</span>}
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
