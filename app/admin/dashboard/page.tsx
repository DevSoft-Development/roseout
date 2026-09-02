import type { Metadata } from "next";
import Link from "next/link";
import AdminLocationSearch from "@/components/admin/AdminLocationSearch";
import {
  AdminActionButton,
  AdminKpiCard,
  AdminKpiGrid,
  AdminPageHeader,
  AdminPageShell,
  AdminSectionCard,
  AdminStatusBadge,
} from "@/components/admin/AdminDesignSystem";
import { requireAdminRole } from "@/lib/admin-auth";
import { readAdminOverview } from "@/lib/admin/admin-overview";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";

export const metadata: Metadata = {
  title: "Admin Dashboard",
  description: "Central admin overview for TheOutHaven.",
};

const format = (v: number | null | undefined) => Number(v || 0).toLocaleString();
const money = (cents: number | null | undefined) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(cents || 0) / 100);

export default async function CentralDashboardPage() {
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.dashboard);
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
    {
      title: "Users",
      desc: "View customer accounts, beta testers, saved outings, booked outings, support tickets, and account activity.",
      href: "/admin/dashboard/users",
      status: "Manage Users",
    },
    {
      title: "Website Hosting",
      desc: "Monitor TheOutHaven-generated websites, Lightsail server load, deployment health, DNS, SSL, and remaining site capacity.",
      href: "/admin/dashboard/website-hosting",
      status: `${format(generatedSites)} sites · ${format(hostingNodes)} nodes`,
      helper: `${format(liveGeneratedSites)} live · ${format(healthyHostingNodes)} healthy nodes`,
    },
    {
      title: "Careers CRM",
      desc: "Manage jobs, applications, interviews, internships, marketing applicants, offers, and team conversion.",
      href: "/admin/dashboard/careers",
      status: "Hiring",
    },
    {
      title: "Search health",
      desc: "Validate discovery, parser output, and search QA.",
      href: "/admin/dashboard/search-health",
      status: "Monitor",
    },
    {
      title: "Launch Catalog Health",
      desc: "Verify public location launch blockers and monitor the factual description backfill before expanding hidden inventory.",
      href: "/admin/dashboard/launch-catalog",
      status: "Launch readiness",
    },
    {
      title: "Photo enrichment",
      desc: "Improve listing quality with Google enrichment and missing-photo queues.",
      href: "/admin/dashboard/locations/google-enrichment",
      status: "Improve",
    },
    {
      title: "Machine Learning",
      desc: "Track learned ranking, intent scoring, pair scoring, and ML data readiness.",
      href: "/admin/dashboard/ml",
      status: `${format(mlScored)} scored · ${format(mlIntentRows)} intents · ${format(mlPairRows)} pairs`,
      helper: mlLastRunCreatedAt ? `Last run ${new Date(mlLastRunCreatedAt).toLocaleDateString()}` : "No ML run yet",
    },
    {
      title: "Claims pipeline",
      desc: "Review owner claims, QR codes, and claim outreach readiness.",
      href: "/admin/dashboard/claims",
      status: "Review",
    },
    {
      title: "Partner readiness",
      desc: "Open CRM to manage partner launch, payments, portal, and next actions.",
      href: "/admin/dashboard/crm",
      status: "Operate",
    },
  ].filter((group) => group.title !== "Users" || admin.role === "superadmin");

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
    { label: "Reservations today", value: format(todayReservations), detail: `${format(upcomingReservations)} next 7 days`, href: "/admin/dashboard/reservations" },
    { label: "Active events", value: format(activeEvents), detail: `${format(eventOrders)} orders · ${format(eventTickets)} tickets / 30d`, href: "/admin/dashboard/events-experiences" },
    { label: "Event sales · 30d", value: money(eventSalesCents), detail: `${money(eventPlatformRevenueCents)} platform fees`, href: "/admin/dashboard/events-experiences" },
    { label: "Active experiences", value: format(activeExperiences), detail: `${format(experienceBookingCount)} bookings / 30d`, href: "/admin/dashboard/events-experiences" },
    { label: "Experience guests · 30d", value: format(experienceGuests), detail: `${money(experienceEstimatedValueCents)} est. booking value`, href: "/admin/dashboard/events-experiences" },
    { label: "Paying locations", value: format(activePaidLocations), detail: `${money(mrrCents)} MRR`, href: "/admin/dashboard/billing" },
    { label: "Subscription collections · 30d", value: money(subscriptionCollected30dCents), detail: "Successful Stripe invoices", href: "/admin/dashboard/billing" },
    { label: "Tracked platform revenue · 30d", value: money(trackedPlatformRevenue30dCents), detail: "Subscriptions + event platform fees", href: "/admin/dashboard/billing" },
    { label: "ARR run rate", value: money(mrrCents * 12), detail: "Based on current MRR", href: "/admin/dashboard/billing" },
    { label: "Marketplace activity · 30d", value: format(eventOrders + experienceBookingCount), detail: "Event orders + experience bookings", href: "/admin/dashboard/events-experiences" },
  ];

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="TheOutHaven Admin"
        title="Admin Overview"
        subtitle="Monitor TheOutHaven operations, partners, search health, claims, websites, infrastructure, and growth."
        actions={
          <>
            <AdminActionButton href="/admin/dashboard/website-hosting">Website Hosting</AdminActionButton>
            <AdminActionButton href="/admin/dashboard/reports">View Reports</AdminActionButton>
            <AdminActionButton href="/admin/dashboard/settings">Settings</AdminActionButton>
            <AdminActionButton href="/admin/dashboard" variant="primary">Refresh</AdminActionButton>
          </>
        }
      />

      <AdminKpiGrid>
        <AdminKpiCard label="Total locations" value={totalLocations} helper="Restaurants + activities" />
        <AdminKpiCard label="Generated sites" value={generatedSites} helper={`${liveGeneratedSites} live on managed hosting`} />
        <AdminKpiCard label="Hosting nodes" value={hostingNodes} helper={`${healthyHostingNodes} currently healthy`} />
        <AdminKpiCard label="Reservations" value={reservations} helper="All-time reservation records" />
        <AdminKpiCard label="Today" value={todayReservations} helper="Reservations scheduled today" />
        <AdminKpiCard label="Open tickets" value={openTickets} helper="Support requiring attention" />
      </AdminKpiGrid>

      <AdminSectionCard className="overflow-hidden p-0">
        <div className="flex flex-col gap-1 border-b border-white/10 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-rose-200">Marketplace + financial pulse</p>
            <h2 className="mt-1 text-lg font-black text-white">Business at a glance</h2>
          </div>
          <p className="text-xs font-semibold text-white/35">Live counts plus trailing 30-day financial activity</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-5">
          {pulse.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="min-h-[94px] border-b border-white/10 px-4 py-3 transition hover:bg-white/[0.045] sm:border-r lg:[&:nth-child(5n)]:border-r-0"
            >
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">{item.label}</p>
              <p className="mt-1.5 text-xl font-black text-white">{item.value}</p>
              <p className="mt-1 text-[11px] font-semibold text-white/35">{item.detail}</p>
            </Link>
          ))}
        </div>
        <div className="border-t border-white/10 px-5 py-3 text-[11px] font-semibold text-white/35">
          Experience booking value is estimated from current per-person pricing. Tracked platform revenue includes successful subscription collections and event platform fees; it does not treat organizer/location proceeds as TheOutHaven revenue.
        </div>
      </AdminSectionCard>

      <AdminSectionCard className="p-5">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-rose-200">Quick Admin Search</p>
            <h2 className="mt-1 text-2xl font-black text-white">Search locations, owners, and CRM records</h2>
            <p className="mt-1 max-w-2xl text-sm text-white/55">
              Find records by location name, owner email, phone number, or address without leaving the dashboard.
            </p>
          </div>
        </div>
        <AdminLocationSearch />
      </AdminSectionCard>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="grid min-w-0 gap-4 md:grid-cols-2">
          {groups.map((g) => (
            <Link
              key={g.title}
              href={g.href}
              className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5 shadow-xl shadow-black/20 transition hover:border-rose-200/30 hover:bg-white/[0.065]"
            >
              <AdminStatusBadge tone="rose">{g.status}</AdminStatusBadge>
              <h3 className="mt-4 text-xl font-black text-white">{g.title}</h3>
              <p className="mt-2 text-sm leading-6 text-white/55">{g.desc}</p>
              {"helper" in g ? <p className="mt-2 text-xs font-bold text-white/40">{g.helper}</p> : null}
              <span className="mt-5 inline-flex rounded-full border border-white/10 px-3 py-1.5 text-xs font-black text-white/70">
                {g.title === "Machine Learning" ? "Open ML Dashboard" : "Open panel"}
              </span>
            </Link>
          ))}
        </section>
        <AdminSectionCard className="p-5">
          <h2 className="text-xl font-black text-white">Priority tasks</h2>
          <p className="mt-1 text-sm text-white/55">Operational queues that usually need daily attention.</p>
          <div className="mt-4 grid gap-2">
            {tasks.map(([label, href]) => (
              <Link
                key={label}
                href={href}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-bold text-white/75 hover:border-rose-200/30 hover:text-white"
              >
                <span>{label}</span>
                <span className="text-rose-200">Open</span>
              </Link>
            ))}
          </div>
        </AdminSectionCard>
      </div>
    </AdminPageShell>
  );
}
