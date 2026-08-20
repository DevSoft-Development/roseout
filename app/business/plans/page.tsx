import type { Metadata } from "next";
import Link from "next/link";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";
import PartnerProPricingCard from "@/components/business/PartnerProPricingCard";
import FeatureInfo from "@/components/business/FeatureInfo";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Business Plans",
  description: "Compare TheOutHaven Essentials and Partner Pro features, pricing, events, experiences, reservations, marketing tools, and business analytics.",
  path: "/business/plans",
});

const claimHref = "/business/claim/no-code";
const essentialsFeatures = [
  "Show up when guests search for outings on TheOutHaven",
  "Claim and manage your verified business profile",
  "Create and publish events on your public location page",
  "Create and publish bookable experiences",
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
    title: "Events and experiences",
    features: [
      ["Create and publish events", "Included", "Included"],
      ["Public event pages with custom slugs", "Included", "Included"],
      ["Create and publish experiences", "Included", "Included"],
      ["Public experience pages with custom slugs", "Included", "Included"],
      ["Show events and experiences on location profile", "Included", "Included"],
      ["Show events and experiences on hosted website", "Included", "Included"],
      ["Event ticket sales and attendee management", "Basic", "Full management"],
      ["Event sales and revenue analytics", "Basic", "Included"],
      ["Experience availability, bookings and check-in", "Basic", "Full management"],
      ["Experience performance analytics", "Basic", "Included"],
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
      ["Analytics", "Profile views", "Views, clicks, bookings and sales"],
    ],
  },
] as const;

const featureDescriptions: Record<string, string> = {
  "Claimed and verified business profile": "Take ownership of your location page and display verified business information.",
  "Placement in TheOutHaven search": "Control how prominently your location can appear when guests search for outings.",
  "AI-powered discovery": "Helps TheOutHaven recommend your location when it matches a guest’s request.",
  "Business photos": "Show guests what your location, atmosphere, food, or experience looks like.",
  "Business details and contact links": "Keep important details and direct contact channels available from your profile.",
  "Branding workspace": "Manage the visual identity and branded content guests see across your business tools.",
  "Menu and package management": "Publish and update menus, packages, and other offerings.",
  "QR growth tools": "Create QR codes that send guests to your profile, booking flow, offers, or reviews.",
  "Create and publish events": "Create location-owned events and publish them directly to TheOutHaven.",
  "Public event pages with custom slugs": "Use a readable event URL generated from the event name or choose your own available slug.",
  "Create and publish experiences": "Create bookable experiences with pricing, guest limits, availability, and a public page.",
  "Public experience pages with custom slugs": "Use a readable experience URL generated from the experience name or choose your own available slug.",
  "Show events and experiences on location profile": "Published offerings automatically appear on your public TheOutHaven location page.",
  "Show events and experiences on hosted website": "Published offerings automatically sync to your TheOutHaven-hosted website.",
  "Event ticket sales and attendee management": "Sell or issue tickets and manage attendees and check-in from the location dashboard.",
  "Event sales and revenue analytics": "Track tickets, gross sales, location net estimates, and event performance.",
  "Experience availability, bookings and check-in": "Add bookable times, manage guest bookings, and track arrivals.",
  "Experience performance analytics": "Track bookings, booked guests, check-ins, upcoming inventory, and estimated booking value.",
  "TheOutHaven Reserve bookings": "Accept and manage reservations directly through TheOutHaven.",
  "Hosted reservation portal": "Give guests a dedicated TheOutHaven page where they can book your location.",
  "Website reservation embed": "Add TheOutHaven’s booking experience directly to your existing website.",
  "Availability and booking hours": "Set the days, times, capacity, and rules that control when guests can reserve.",
  "Location layout builder and live map": "Create a visual floor layout and track tables or reservable areas in real time.",
  "Hostess and operator view": "Use an operations-focused screen to seat guests and manage daily service.",
  "Reservation and waitlist dashboard": "View upcoming bookings, arrivals, cancellations, and waiting guests in one place.",
  "SMS confirmations and reminders": "Automatically text guests booking confirmations and reminders before their visit.",
  "Waitlist texting and table-ready messages": "Notify waiting guests by text when their table or reserved area is ready.",
  "Add-to-calendar links": "Let guests add confirmed reservations to their preferred calendar.",
  "Reservation deposits and Stripe payouts": "Collect eligible booking deposits and receive funds through connected Stripe payouts.",
  "Guest details and private notes": "Keep useful guest information and internal service notes available to your team.",
  "Lead tracking": "Track potential customers and inquiries from first interest through conversion.",
  "Offers and promotions": "Create promotions that encourage guests to visit, book, or return.",
  "VIP list tools": "Organize priority guests and provide your team with helpful VIP context.",
  "Guest messaging": "Communicate with guests about reservations, updates, and service-related needs.",
  "Reviews and feedback workspace": "Monitor guest feedback and manage review-related follow-up from one workspace.",
  "Marketing Studio": "Create and manage branded marketing content and guest-growth campaigns.",
  "Business notifications": "Receive alerts about bookings, guest activity, and actions that need attention.",
  Analytics: "Measure profile views, engagement, booking activity, event sales, and other business results.",
};

export default function BusinessPlansPage() {
  return <main className="min-h-screen bg-[#050505] text-white"><TheOutHavenHeader/><section className="relative overflow-hidden px-4 pb-20 pt-32 sm:px-6 lg:px-8"><div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(225,6,42,0.24),transparent_36%),linear-gradient(180deg,#0a0708,#050505_60%)]"/><div className="relative mx-auto max-w-7xl"><div className="mx-auto max-w-3xl text-center"><p className="text-xs font-black uppercase tracking-[0.35em] text-[#e1062a]">Business plans</p><h1 className="mt-5 text-5xl font-black tracking-tight sm:text-6xl">Choose how you want to grow</h1><p className="mt-5 text-base font-semibold leading-7 text-white/60 sm:text-lg">Start with Essentials for free, including basic Events and Experiences. Choose Partner Pro for the complete reservations, ticketing, guest-management, marketing, and analytics toolkit.</p></div><div className="mx-auto mt-12 grid max-w-6xl gap-5 lg:grid-cols-[0.8fr_1.2fr]"><EssentialsCard/><PartnerProPricingCard claimHref={claimHref}/></div><PlanFeatureComparison/></div></section></main>;
}

function EssentialsCard(){return <article className="flex h-full flex-col rounded-[2rem] border border-white/10 bg-black p-6 shadow-2xl shadow-black/40 sm:p-8"><span className="mb-5 w-fit rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-white/60">Build your presence</span><h2 className="text-3xl font-black tracking-tight">Essentials</h2><p className="mt-3 text-sm leading-6 text-white/55">Build a trusted presence where guests plan outings, publish your events and experiences, then send them directly to your contact and booking channels.</p><p className="mt-6 text-5xl font-black">Free</p><ul className="mt-7 flex-1 space-y-3">{essentialsFeatures.map(feature=><li key={feature} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-sm font-semibold leading-6 text-white/66"><span className="mr-2 text-emerald-300" aria-hidden="true">✓</span>{feature}</li>)}</ul><Link href={claimHref} className="mt-7 inline-flex w-full items-center justify-center rounded-2xl border border-white/15 bg-white/[0.05] px-7 py-4 text-sm font-black text-white transition hover:bg-white hover:text-black">Claim Your Location</Link></article>}

function PlanFeatureComparison(){return <section aria-labelledby="full-plan-comparison" className="mx-auto mt-14 max-w-6xl overflow-hidden rounded-[2rem] border border-white/10 bg-black shadow-2xl shadow-black/35"><div className="border-b border-white/10 bg-[linear-gradient(135deg,rgba(225,6,42,0.16),transparent_55%)] p-6 sm:p-8"><p className="text-xs font-black uppercase tracking-[0.28em] text-[#e1062a]">Complete feature list</p><h2 id="full-plan-comparison" className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">See exactly what each plan includes</h2><p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-white/55">Every advertised feature is shown below with the availability or limit for Essentials and Partner Pro.</p></div><div className="divide-y divide-white/10">{planFeatureGroups.map(group=><div key={group.title} className="p-4 sm:p-6"><h3 className="px-2 text-sm font-black uppercase tracking-[0.18em] text-white/75">{group.title}</h3><div className="mt-4 overflow-x-auto rounded-2xl border border-white/10"><table className="w-full min-w-[680px] border-collapse text-left"><thead className="bg-white/[0.055]"><tr><th scope="col" className="w-1/2 px-4 py-4 text-xs font-black uppercase tracking-[0.14em] text-white/45">Feature</th><th scope="col" className="w-1/4 px-4 py-4 text-xs font-black uppercase tracking-[0.14em] text-white/65">Essentials</th><th scope="col" className="w-1/4 bg-[#e1062a]/10 px-4 py-4 text-xs font-black uppercase tracking-[0.14em] text-red-100">Partner Pro</th></tr></thead><tbody>{group.features.map(([feature,essentials,pro])=><tr key={feature} className="border-t border-white/10"><th scope="row" className="px-4 py-4 text-sm font-bold text-white/80"><span className="inline-flex items-center gap-2">{feature}<FeatureInfo feature={feature} description={featureDescriptions[feature]}/></span></th><td className="px-4 py-4 text-sm font-semibold text-white/48">{essentials==="—"?<span aria-label="Not included">—</span>:essentials}</td><td className="bg-[#e1062a]/[0.055] px-4 py-4 text-sm font-black text-white"><span className="mr-2 text-emerald-300" aria-hidden="true">✓</span>{pro}</td></tr>)}</tbody></table></div></div>)}</div><div className="flex flex-col gap-4 border-t border-white/10 bg-white/[0.035] p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8"><div><p className="text-lg font-black">Ready to use the complete toolkit?</p><p className="mt-1 text-xs font-semibold text-white/45">Choose monthly or annual billing above. Taxes are calculated at checkout.</p></div><Link href={`${claimHref}?plan=monthly`} className="inline-flex items-center justify-center rounded-2xl bg-[#e1062a] px-7 py-4 text-sm font-black text-white shadow-2xl shadow-red-500/25 transition hover:bg-red-500">Choose Partner Pro</Link></div></section>}
