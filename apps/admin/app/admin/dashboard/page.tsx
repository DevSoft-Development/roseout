import type { Metadata } from "next";
import Link from "next/link";

import { ADMIN_ROLES } from "@theouthaven/auth/admin-roles";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import AdminLocationSearch from "@/components/admin/AdminLocationSearch";
import { readAdminOverview } from "@/lib/admin/admin-overview";

export const metadata: Metadata = {
  title: "Admin Dashboard",
  description: "Central admin overview for TheOutHaven.",
};
export const dynamic = "force-dynamic";

const format = (value: number | null | undefined) => Number(value || 0).toLocaleString();
const money = (cents: number | null | undefined) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(cents || 0) / 100);

export default async function CentralDashboardPage() {
  const admin = await requireAdminRole([...ADMIN_ROLES]);
  const overview = await readAdminOverview();
  const {
    totalLocations,
    reservations,
    todayReservations,
    upcomingReservations,
    activeEvents,
    activeExperiences,
    eventOrders,
    eventTickets,
    eventSalesCents,
    eventPlatformRevenueCents,
    experienceBookingCount,
    experienceGuests,
    experienceEstimatedValueCents,
    activePaidLocations,
    mrrCents,
    subscriptionCollected30dCents,
    trackedPlatformRevenue30dCents,
    openTickets,
    mlScored,
    mlIntentRows,
    mlPairRows,
    mlLastRunCreatedAt,
    generatedSites,
    liveGeneratedSites,
    hostingNodes,
    healthyHostingNodes,
  } = overview;

  const groups = [
    ["Users", "View customer accounts, beta testers, saved outings, booked outings, support tickets, and account activity.", "/admin/dashboard/users", "Manage Users"],
    ["Website Hosting", "Monitor generated websites, server load, deployment health, DNS, SSL, and remaining capacity.", "/admin/dashboard/website-hosting", `${format(generatedSites)} sites · ${format(hostingNodes)} nodes`],
    ["Careers CRM", "Manage jobs, applications, interviews, internships, marketing applicants, offers, and team conversion.", "/admin/dashboard/careers", "Hiring"],
    ["Search health", "Validate discovery, parser output, and search QA.", "/admin/dashboard/search-health", "Monitor"],
    ["Launch Catalog Health", "Verify public location launch blockers and monitor factual description backfill.", "/admin/dashboard/launch-catalog", "Launch readiness"],
    ["Photo enrichment", "Improve listing quality with Google enrichment and missing-photo queues.", "/admin/dashboard/locations/google-enrichment", "Improve"],
    ["Machine Learning", "Track learned ranking, intent scoring, pair scoring, and ML data readiness.", "/admin/dashboard/ml", `${format(mlScored)} scored · ${format(mlIntentRows)} intents · ${format(mlPairRows)} pairs`],
    ["Claims pipeline", "Review owner claims, QR codes, and claim outreach readiness.", "/admin/dashboard/claims", "Review"],
    ["Partner readiness", "Open CRM to manage partner launch, payments, portal, and next actions.", "/admin/dashboard/crm", "Operate"],
  ].filter(([title]) => title !== "Users" || admin.role === "superadmin");

  const tasks = [
    ["Launch catalog health", "/admin/dashboard/launch-catalog"],
    ["Website hosting health", "/admin/dashboard/website-hosting"],
    ["Needs review", "/admin/dashboard/settings/location-tools/enrichment"],
    ["Missing Google Place ID", "/admin/dashboard/locations/google-enrichment"],
    ["Claim not sent", "/admin/dashboard/crm?view=claim-not-sent"],
    ["Payment pending", "/admin/dashboard/crm?view=payment-pending"],
    ["Giveaway entries", "/admin/dashboard/giveaway"],
  ];

  const pulse = [
    ["Reservations today", format(todayReservations), `${format(upcomingReservations)} next 7 days`, "/admin/dashboard/reservations"],
    ["Active events", format(activeEvents), `${format(eventOrders)} orders · ${format(eventTickets)} tickets / 30d`, "/admin/dashboard/events-experiences"],
    ["Event sales · 30d", money(eventSalesCents), `${money(eventPlatformRevenueCents)} platform fees`, "/admin/dashboard/events-experiences"],
    ["Active experiences", format(activeExperiences), `${format(experienceBookingCount)} bookings / 30d`, "/admin/dashboard/events-experiences"],
    ["Experience guests · 30d", format(experienceGuests), `${money(experienceEstimatedValueCents)} est. booking value`, "/admin/dashboard/events-experiences"],
    ["Paying locations", format(activePaidLocations), `${money(mrrCents)} MRR`, "/admin/dashboard/billing"],
    ["Subscription collections · 30d", money(subscriptionCollected30dCents), "Successful Stripe invoices", "/admin/dashboard/billing"],
    ["Tracked platform revenue · 30d", money(trackedPlatformRevenue30dCents), "Subscriptions + event platform fees", "/admin/dashboard/billing"],
    ["ARR run rate", money(mrrCents * 12), "Based on current MRR", "/admin/dashboard/billing"],
    ["Marketplace activity · 30d", format(eventOrders + experienceBookingCount), "Event orders + experience bookings", "/admin/dashboard/events-experiences"],
  ];

  const topCards = [
    ["Total locations", format(totalLocations), "Restaurants + activities"],
    ["Generated sites", format(generatedSites), `${format(liveGeneratedSites)} live on managed hosting`],
    ["Hosting nodes", format(hostingNodes), `${format(healthyHostingNodes)} currently healthy`],
    ["Reservations", format(reservations), "All-time reservation records"],
    ["Today", format(todayReservations), "Reservations scheduled today"],
    ["Open tickets", format(openTickets), "Support requiring attention"],
  ];

  return (
    <main className="min-h-screen bg-[#090706] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <header className="rounded-3xl border border-white/10 bg-[#120d0b] p-6 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[.26em] text-rose-300">TheOutHaven Admin</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black sm:text-4xl">Admin Overview</h1>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-white/55">Monitor operations, partners, search health, claims, websites, infrastructure, and growth.</p>
            </div>
            <div className="flex flex-wrap gap-2 text-sm font-black">
              <Link href="/admin/dashboard/website-hosting" className="rounded-xl border border-white/15 px-4 py-2">Website Hosting</Link>
              <Link href="/admin/dashboard/reports" className="rounded-xl border border-white/15 px-4 py-2">View Reports</Link>
              <Link href="/admin/dashboard/settings" className="rounded-xl border border-white/15 px-4 py-2">Settings</Link>
              <Link href="/admin/dashboard" className="rounded-xl bg-white px-4 py-2 text-black">Refresh</Link>
            </div>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {topCards.map(([label,value,helper]) => (
            <article key={label} className="rounded-2xl border border-white/10 bg-white/[.04] p-4">
              <p className="text-[10px] font-black uppercase tracking-[.16em] text-white/40">{label}</p>
              <p className="mt-2 text-3xl font-black">{value}</p>
              <p className="mt-1 text-xs text-white/45">{helper}</p>
            </article>
          ))}
        </section>

        <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#120d0b]">
          <div className="border-b border-white/10 px-5 py-4">
            <p className="text-[10px] font-black uppercase tracking-[.2em] text-rose-200">Marketplace + financial pulse</p>
            <h2 className="mt-1 text-lg font-black">Business at a glance</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-5">
            {pulse.map(([label,value,detail,href]) => (
              <Link key={label} href={href} className="min-h-[94px] border-b border-white/10 px-4 py-3 transition hover:bg-white/[.045] sm:border-r">
                <p className="text-[10px] font-black uppercase tracking-[.14em] text-white/40">{label}</p>
                <p className="mt-1.5 text-xl font-black">{value}</p>
                <p className="mt-1 text-[11px] font-semibold text-white/35">{detail}</p>
              </Link>
            ))}
          </div>
          <p className="border-t border-white/10 px-5 py-3 text-[11px] font-semibold text-white/35">Experience booking value is estimated from current per-person pricing. Tracked platform revenue includes successful subscription collections and event platform fees.</p>
        </section>

        <section className="rounded-3xl border border-white/10 bg-[#120d0b] p-5">
          <p className="text-xs font-black uppercase tracking-[.22em] text-rose-200">Quick Admin Search</p>
          <h2 className="mt-1 text-2xl font-black">Search locations, owners, and CRM records</h2>
          <p className="mt-1 max-w-2xl text-sm text-white/55">Find records by location name, owner email, phone number, or address without leaving the dashboard.</p>
          <div className="mt-4"><AdminLocationSearch /></div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className="grid min-w-0 gap-4 md:grid-cols-2">
            {groups.map(([title,desc,href,status]) => (
              <Link key={title} href={href} className="rounded-[1.5rem] border border-white/10 bg-white/[.04] p-5 shadow-xl shadow-black/20 transition hover:border-rose-200/30 hover:bg-white/[.065]">
                <span className="inline-flex rounded-full border border-rose-200/20 bg-rose-500/10 px-3 py-1 text-xs font-black text-rose-50">{status}</span>
                <h3 className="mt-4 text-xl font-black">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-white/55">{desc}</p>
                {title === "Machine Learning" && mlLastRunCreatedAt ? <p className="mt-2 text-xs font-bold text-white/40">Last run {new Date(mlLastRunCreatedAt).toLocaleDateString()}</p> : null}
              </Link>
            ))}
          </section>

          <section className="rounded-3xl border border-white/10 bg-[#120d0b] p-5">
            <h2 className="text-xl font-black">Priority tasks</h2>
            <p className="mt-1 text-sm text-white/55">Operational queues that usually need daily attention.</p>
            <div className="mt-4 grid gap-2">
              {tasks.map(([label,href]) => (
                <Link key={label} href={href} className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-bold text-white/75 hover:border-rose-200/30 hover:text-white">
                  <span>{label}</span><span className="text-rose-200">Open</span>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
