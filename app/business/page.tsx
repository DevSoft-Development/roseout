import Link from "next/link";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";

const primaryCta = "/location/apply";
const proCta = "/checkout?plan=pro&billing=monthly";

const platformPillars = [
  {
    title: "Get Discovered",
    eyebrow: "Discovery",
    features: [
      "Customer discovery",
      "Curated searches",
      "Visibility across experiences",
      "SEO-friendly business pages",
      "Photos, social, and reservation links",
    ],
  },
  {
    title: "AI-Powered Matching",
    eyebrow: "Recommendations",
    features: [
      "Smart recommendations",
      "Cuisine + vibe matching",
      "Date-night pairing",
      "Group activity suggestions",
      "Personalized discovery",
    ],
  },
  {
    title: "TheOutHaven Reserve",
    eyebrow: "Reservations",
    features: [
      "Online reservations",
      "Waitlists",
      "SMS reminders",
      "Calendar add",
      "Guest management",
    ],
  },
  {
    title: "Hospitality Operations",
    eyebrow: "Operations",
    features: [
      "Layout builder",
      "Tables, rooms, and lanes",
      "Drag-and-drop management",
      "Live hostess mode",
      "Real-time occupancy",
    ],
  },
];

const operationsBullets = [
  "Live reservations",
  "Waitlist texting",
  "Table & room assignment",
  "Guest notes",
  "Mobile hostess mode",
];

const venueTypes = [
  "Restaurants",
  "Lounges",
  "Hookah",
  "Nightlife",
  "Bowling",
  "Karaoke",
  "Rooftops",
  "Arcades",
  "Event Spaces",
  "Wellness",
  "Creative Experiences",
];

const includedFeatures = [
  "Business profile page",
  "Discovery visibility",
  "AI-powered recommendations",
  "Photos & media",
  "Website/social links",
  "Google Maps integration",
  "External reservation links",
  "QR claim tools",
  "Customer traffic from searches",
  "Basic location management",
];

const reserveFeatures = [
  "Reservations",
  "Layout Builder",
  "SMS Reminders",
  "Waitlists",
  "Hostess Dashboard",
  "Analytics",
  "Guest Notes",
  "Calendar Add",
];

const freeFeatures = [
  "Business profile",
  "Discovery visibility",
  "AI recommendations",
  "Photos/contact/social links",
  "External reservation links",
  "QR tools",
  "Basic management",
];

const proFeatures = [
  "Everything in Free plus:",
  "Native reservations",
  "Layout builder",
  "SMS reminders",
  "Waitlist texting",
  "Live dashboard",
  "Guest notes",
  "Analytics",
  "Calendar add",
  "No per-cover fees",
];

export default function BusinessPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#050505] text-white">
      <TheOutHavenHeader />

      <HeroSection />

      <Section className="pt-0">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {platformPillars.map((pillar, index) => (
            <PillarCard key={pillar.title} index={index + 1} {...pillar} />
          ))}
        </div>
      </Section>

      <Section className="border-y border-white/10 bg-[#080808]">
        <div className="grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
          <SectionHeader
            eyebrow="Live operations"
            title="Run Your Venue in Real Time"
            text="Manage tables, booths, rooms, lanes, and guest flow from one live dashboard."
          />

          <OperationsShowcase />
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {operationsBullets.map((item) => (
            <MiniFeature key={item}>{item}</MiniFeature>
          ))}
        </div>
      </Section>

      <Section>
        <SectionHeader
          eyebrow="Venue types"
          title="Built for modern hospitality"
          centered
        />

        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {venueTypes.map((venue) => (
            <VenueCard key={venue} title={venue} />
          ))}
        </div>
      </Section>

      <Section className="border-y border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(225,6,42,0.16),transparent_34%),#080808]">
        <SectionHeader
          eyebrow="Every plan"
          title="Included With Every Plan"
          text="Start with the core discovery engine before adding advanced operations."
        />

        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {includedFeatures.map((feature) => (
            <IncludedTile key={feature}>{feature}</IncludedTile>
          ))}
        </div>
      </Section>

      <Section>
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <SectionHeader
              eyebrow="Pro operations"
              title="Unlock TheOutHaven Reserve"
              text="Advanced reservations and hospitality operations for modern venues."
            />
            <div className="mt-6 inline-flex rounded-full border border-[#e1062a]/40 bg-[#e1062a]/15 px-5 py-3 text-sm font-black text-white shadow-2xl shadow-red-500/10">
              No Per-Cover Fees
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {reserveFeatures.map((feature) => (
              <ReserveFeature key={feature} title={feature} />
            ))}
          </div>
        </div>
      </Section>

      <Section id="plans" className="border-y border-white/10 bg-[#080808]">
        <SectionHeader eyebrow="Simple pricing" title="Two ways to grow" centered />

        <div className="mt-10 grid gap-5 lg:grid-cols-2">
          <PricingCard
            title="TheOutHaven Discovery"
            price="Free"
            description="Claim your location and appear where customers discover their next plan."
            features={freeFeatures}
            cta="Claim Your Location"
            href={primaryCta}
          />
          <PricingCard
            title="TheOutHaven Reserve"
            price="$99"
            period="/month"
            description="Add native reservations, live floor management, and guest operations."
            features={proFeatures}
            cta="Start Pro"
            href={proCta}
            highlighted
          />
        </div>
      </Section>

      <section className="relative overflow-hidden px-4 py-20 sm:px-6 lg:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(225,6,42,0.2),transparent_38%)]" />
        <div className="relative mx-auto max-w-5xl rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 text-center shadow-2xl shadow-red-500/10 sm:p-12 lg:p-16">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-[#e1062a]">
            TheOutHaven for Business
          </p>
          <h2 className="mt-5 text-4xl font-black tracking-tight md:text-6xl">
            Modern Hospitality Starts Here
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-white/60 md:text-lg">
            Get discovered, manage guests, and grow with TheOutHaven.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <CtaLink href={primaryCta}>Claim Your Location</CtaLink>
            <CtaLink href={proCta} variant="secondary">
              Start Pro
            </CtaLink>
          </div>
        </div>
      </section>
    </main>
  );
}

function HeroSection() {
  return (
    <section className="relative overflow-hidden px-4 pb-16 pt-28 sm:px-6 sm:pb-20 sm:pt-32 lg:px-8 lg:pb-24">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(225,6,42,0.26),transparent_32%),radial-gradient(circle_at_80%_10%,rgba(255,255,255,0.1),transparent_24%),linear-gradient(180deg,#080808_0%,#050505_76%)]" />
      <div className="absolute left-1/2 top-20 h-72 w-72 -translate-x-1/2 rounded-full bg-[#e1062a]/10 blur-3xl" />

      <div className="relative mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.35em] text-[#e1062a]">
            Modern hospitality platform
          </p>
          <h1 className="mt-5 max-w-4xl text-5xl font-black leading-[0.98] tracking-tight sm:text-6xl lg:text-7xl">
            TheOutHaven for Business
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-white/68">
            Discovery, AI-powered recommendations, reservations, and hospitality operations — all in one platform.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <CtaLink href={primaryCta}>Claim Your Location</CtaLink>
            <CtaLink href={proCta} variant="secondary">
              Start Pro
            </CtaLink>
          </div>
        </div>

        <DashboardVisual />
      </div>
    </section>
  );
}

function DashboardVisual() {
  const timeline = ["6:00", "6:30", "7:15", "8:00"];

  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-3 shadow-2xl shadow-red-500/10 backdrop-blur sm:rounded-[2.5rem] sm:p-5">
      <div className="overflow-hidden rounded-[1.55rem] border border-white/10 bg-[#070707] sm:rounded-[2rem]">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-4 sm:px-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#e1062a]">
              TheOutHaven OS
            </p>
            <p className="mt-1 text-lg font-black">Tonight&apos;s floor</p>
          </div>
          <div className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-black text-emerald-300">
            Live
          </div>
        </div>

        <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[1fr_0.78fr]">
          <div className="rounded-[1.35rem] border border-white/10 bg-black p-4">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-black text-white/80">Layout</p>
              <p className="text-xs font-bold text-white/40">84% occupied</p>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {Array.from({ length: 12 }).map((_, index) => (
                <div
                  key={index}
                  className={`h-14 rounded-2xl border text-center text-xs font-black leading-[3.5rem] ${
                    index % 5 === 0
                      ? "border-amber-300/30 bg-amber-300/15 text-amber-200"
                      : index % 3 === 0
                        ? "border-[#e1062a]/40 bg-[#e1062a]/20 text-red-100"
                        : "border-emerald-300/30 bg-emerald-300/15 text-emerald-100"
                  }`}
                >
                  {index % 4 === 0 ? "Room" : `T${index + 1}`}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.04] p-4">
              <p className="text-sm font-black">AI match</p>
              <p className="mt-2 text-xs leading-5 text-white/50">
                Date night · rooftop · 7:15 PM · cocktails
              </p>
              <div className="mt-3 h-2 rounded-full bg-white/10">
                <div className="h-2 w-[86%] rounded-full bg-[#e1062a]" />
              </div>
            </div>
            {timeline.map((time, index) => (
              <div
                key={time}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-black px-4 py-3"
              >
                <div>
                  <p className="text-sm font-black">{time}</p>
                  <p className="text-xs text-white/45">
                    {index % 2 === 0 ? "Reserved table" : "Waitlist ready"}
                  </p>
                </div>
                <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white/60">
                  SMS
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function OperationsShowcase() {
  return (
    <div className="rounded-[2rem] border border-white/10 bg-black p-4 shadow-2xl shadow-black/40 sm:p-5">
      <div className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
        <div className="rounded-[1.5rem] border border-white/10 bg-[#0d0d0d] p-4">
          <div className="mb-4 flex items-center justify-between">
            <p className="font-black">Hostess dashboard</p>
            <span className="rounded-full bg-[#e1062a] px-3 py-1 text-xs font-black">
              Drag & drop
            </span>
          </div>
          <div className="grid grid-cols-6 gap-2">
            {Array.from({ length: 24 }).map((_, index) => (
              <div
                key={index}
                className={`h-10 rounded-xl ${
                  index % 7 === 0
                    ? "bg-[#e1062a]/70"
                    : index % 4 === 0
                      ? "bg-amber-300/55"
                      : "bg-emerald-300/45"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {[
            ["Patio booth", "7:00 PM · 4 guests", "Seated"],
            ["Karaoke room", "7:30 PM · 8 guests", "Ready"],
            ["Lane 04", "8:15 PM · birthday", "Hold"],
          ].map(([name, detail, status]) => (
            <div
              key={name}
              className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4"
            >
              <div>
                <p className="font-black">{name}</p>
                <p className="mt-1 text-xs text-white/45">{detail}</p>
              </div>
              <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white/70">
                {status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Section({
  children,
  className = "",
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`px-4 py-16 sm:px-6 sm:py-20 lg:px-8 ${className}`}>
      <div className="mx-auto max-w-7xl">{children}</div>
    </section>
  );
}

function SectionHeader({
  eyebrow,
  title,
  text,
  centered = false,
}: {
  eyebrow: string;
  title: string;
  text?: string;
  centered?: boolean;
}) {
  return (
    <div className={centered ? "mx-auto max-w-3xl text-center" : "max-w-3xl"}>
      <p className="text-xs font-black uppercase tracking-[0.32em] text-[#e1062a]">
        {eyebrow}
      </p>
      <h2 className="mt-4 text-4xl font-black tracking-tight md:text-5xl">
        {title}
      </h2>
      {text && <p className="mt-4 text-base leading-7 text-white/58 md:text-lg">{text}</p>}
    </div>
  );
}

function PillarCard({
  title,
  eyebrow,
  features,
  index,
}: {
  title: string;
  eyebrow: string;
  features: string[];
  index: number;
}) {
  return (
    <article className="group rounded-[2rem] border border-white/10 bg-white/[0.045] p-6 shadow-2xl shadow-black/20 transition duration-300 hover:-translate-y-1 hover:border-[#e1062a]/45 hover:bg-white/[0.065]">
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-[#e1062a]/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#ff4b66]">
          {eyebrow}
        </span>
        <span className="text-sm font-black text-white/25">0{index}</span>
      </div>
      <h3 className="mt-6 text-2xl font-black tracking-tight">{title}</h3>
      <ul className="mt-5 space-y-3">
        {features.map((feature) => (
          <li key={feature} className="flex gap-3 text-sm font-semibold leading-6 text-white/62">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#e1062a]" />
            {feature}
          </li>
        ))}
      </ul>
    </article>
  );
}

function MiniFeature({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 text-sm font-black text-white/78">
      {children}
    </div>
  );
}

function VenueCard({ title }: { title: string }) {
  return (
    <article className="rounded-[1.5rem] border border-white/10 bg-black p-5 transition hover:border-[#e1062a]/45 hover:bg-[#100609]">
      <h3 className="text-lg font-black">{title}</h3>
      <p className="mt-3 text-xs font-black uppercase tracking-[0.14em] text-white/38">
        Reservations • Discovery • Guest Management
      </p>
    </article>
  );
}

function IncludedTile({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-28 rounded-[1.5rem] border border-white/10 bg-black/55 p-5 text-sm font-black leading-6 text-white/75">
      <div className="mb-4 h-8 w-8 rounded-full bg-[#e1062a]/18 ring-1 ring-[#e1062a]/30" />
      {children}
    </div>
  );
}

function ReserveFeature({ title }: { title: string }) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.045] p-5">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-2xl bg-[#e1062a] text-sm font-black shadow-lg shadow-red-500/20">
        ✓
      </div>
      <h3 className="font-black">{title}</h3>
    </div>
  );
}

function PricingCard({
  title,
  price,
  period,
  description,
  features,
  cta,
  href,
  highlighted = false,
}: {
  title: string;
  price: string;
  period?: string;
  description: string;
  features: string[];
  cta: string;
  href: string;
  highlighted?: boolean;
}) {
  return (
    <article
      className={`relative flex h-full flex-col rounded-[2rem] border p-6 shadow-2xl sm:p-8 ${
        highlighted
          ? "border-[#e1062a]/70 bg-[linear-gradient(180deg,rgba(225,6,42,0.2),rgba(255,255,255,0.045))] shadow-red-500/15"
          : "border-white/10 bg-black shadow-black/40"
      }`}
    >
      {highlighted && (
        <span className="mb-5 w-fit rounded-full bg-[#e1062a] px-4 py-2 text-xs font-black uppercase tracking-[0.18em]">
          Pro
        </span>
      )}
      <h3 className="text-3xl font-black tracking-tight">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-white/55">{description}</p>
      <div className="mt-6 flex items-end gap-1">
        <p className="text-5xl font-black">{price}</p>
        {period && <p className="pb-2 text-sm font-black text-white/45">{period}</p>}
      </div>
      <ul className="mt-7 flex-1 space-y-3">
        {features.map((feature, index) => (
          <li
            key={feature}
            className={`rounded-2xl border border-white/10 p-4 text-sm font-semibold leading-6 ${
              highlighted && index === 0
                ? "bg-[#e1062a]/15 text-white"
                : "bg-white/[0.035] text-white/66"
            }`}
          >
            {index === 0 && highlighted ? feature : `✓ ${feature}`}
          </li>
        ))}
      </ul>
      <CtaLink href={href} className="mt-7 w-full justify-center" variant={highlighted ? "primary" : "secondary"}>
        {cta}
      </CtaLink>
    </article>
  );
}

function CtaLink({
  href,
  children,
  variant = "primary",
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center rounded-2xl px-7 py-4 text-sm font-black transition duration-200 ${
        variant === "primary"
          ? "bg-[#e1062a] text-white shadow-2xl shadow-red-500/25 hover:bg-red-500"
          : "border border-white/15 bg-white/[0.05] text-white/85 hover:bg-white hover:text-black"
      } ${className}`}
    >
      {children}
    </Link>
  );
}
