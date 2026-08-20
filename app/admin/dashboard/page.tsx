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
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { BUSINESS_PRO_MONTHLY_CENTS, isBusinessProPlan } from "@/lib/billing/plans";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const metadata: Metadata = {
  title: "Admin Dashboard",
  description: "Central admin overview for TheOutHaven.",
};

const todayKey = () => new Date().toISOString().split("T")[0];
const format = (v: number | null | undefined) => Number(v || 0).toLocaleString();
const money = (cents: number | null | undefined) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(cents || 0) / 100);

function subscriptionAmount(row: Record<string, any>) {
  return Number(
    row.subscription_amount_cents ||
      (isBusinessProPlan(row.subscription_plan) && row.subscription_status === "active"
        ? BUSINESS_PRO_MONTHLY_CENTS
        : 0),
  );
}

export default async function CentralDashboardPage() {
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.dashboard);
  const today = todayKey();
  const now = new Date();
  const sevenDaysOut = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();

  const [
    restaurants,
    activities,
    reservations,
    todayReservations,
    upcomingReservations,
    activeEvents,
    activeExperiences,
    eventOrders30d,
    experienceBookings30d,
    experiencePrices,
    billingLocations,
    paymentLogs30d,
    openTicketsResult,
    mlScored,
    mlIntentRows,
    mlPairRows,
    mlLastRun,
    generatedSites,
    liveGeneratedSites,
    hostingNodes,
    healthyHostingNodes,
  ] = await Promise.all([
    supabaseAdmin.from("restaurants").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("activities").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("location_reservations").select("id", { count: "exact", head: true }),
    supabaseAdmin
      .from("location_reservations")
      .select("id", { count: "exact", head: true })
      .eq("reservation_date", today)
      .not("status", "in", "(cancelled,declined)"),
    supabaseAdmin
      .from("location_reservations")
      .select("id", { count: "exact", head: true })
      .gte("reservation_date", today)
      .lte("reservation_date", sevenDaysOut)
      .not("status", "in", "(cancelled,declined)"),
    supabaseAdmin
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("source_kind", "native")
      .eq("status", "scheduled")
      .eq("searchable", true),
    supabaseAdmin
      .from("experiences")
      .select("id", { count: "exact", head: true })
      .eq("status", "published")
      .eq("searchable", true),
    supabaseAdmin
      .from("event_ticket_orders")
      .select("id,quantity,status,payment_status,ticket_subtotal_cents,total_cents,platform_fee_cents,created_at")
      .gte("created_at", thirtyDaysAgo)
      .limit(5000),
    supabaseAdmin
      .from("experience_bookings")
      .select("id,experience_id,party_size,status,created_at")
      .gte("created_at", thirtyDaysAgo)
      .limit(5000),
    supabaseAdmin.from("experiences").select("id,price_per_person").limit(5000),
    supabaseAdmin
      .from("locations")
      .select("id,subscription_plan,subscription_status,subscription_amount_cents,subscription_interval")
      .limit(5000),
    supabaseAdmin
      .from("payment_logs")
      .select("id,event_type,amount_paid_cents,created_at")
      .gte("created_at", thirtyDaysAgo)
      .eq("event_type", "invoice.payment_succeeded")
      .limit(5000),
    supabaseAdmin
      .from("support_tickets")
      .select("id", { count: "exact", head: true })
      .not("status", "in", "(closed,resolved)"),
    supabaseAdmin.from("location_ml_features").select("location_id", { count: "exact", head: true }),
    supabaseAdmin.from("location_intent_ml_features").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("location_pair_ml_features").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("location_ml_score_runs").select("created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from("business_websites").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("business_websites").select("id", { count: "exact", head: true }).eq("status", "live"),
    supabaseAdmin.from("website_hosting_nodes").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("website_hosting_nodes").select("id", { count: "exact", head: true }).eq("status", "healthy"),
  ]);

  const totalLocations = (restaurants.count || 0) + (activities.count || 0);

  const paidEventOrders = (eventOrders30d.data || []).filter(
    (row) =>
      row.status !== "refunded" &&
      row.status !== "cancelled" &&
      (row.payment_status === "paid" || row.status === "confirmed"),
  );
  const eventOrders = paidEventOrders.length;
  const eventTickets = paidEventOrders.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const eventSalesCents = paidEventOrders.reduce(
    (sum, row) => sum + Number(row.ticket_subtotal_cents || row.total_cents || 0),
    0,
  );
  const eventPlatformRevenueCents = paidEventOrders.reduce(
    (sum, row) => sum + Number(row.platform_fee_cents || 0),
    0,
  );

  const activeExperienceBookings = (experienceBookings30d.data || []).filter(
    (row) => !["cancelled", "refunded"].includes(String(row.status || "").toLowerCase()),
  );
  const experienceBookingCount = activeExperienceBookings.length;
  const experienceGuests = activeExperienceBookings.reduce(
    (sum, row) => sum + Number(row.party_size || 0),
    0,
  );
  const priceByExperience = new Map(
    (experiencePrices.data || []).map((row) => [String(row.id), Number(row.price_per_person || 0)]),
  );
  const experienceEstimatedValueCents = activeExperienceBookings.reduce(
    (sum, row) =>
      sum + Math.round(Number(row.party_size || 0) * Number(priceByExperience.get(String(row.experience_id)) || 0) * 100),
    0,
  );

  const billingRows = billingLocations.error ? [] : billingLocations.data || [];
  const activePaidLocations = billingRows.filter(
    (row) =>
      ["active", "grace_period", "comped"].includes(String(row.subscription_status || "")) &&
      isBusinessProPlan(row.subscription_plan),
  );
  const mrrCents = activePaidLocations.reduce((sum, row) => {
    const amount = subscriptionAmount(row);
    return sum + (row.subscription_interval === "year" || row.subscription_interval === "annual" ? Math.round(amount / 12) : amount);
  }, 0);
  const subscriptionCollected30dCents = paymentLogs30d.error
    ? 0
    : (paymentLogs30d.data || []).reduce((sum, row) => sum + Number(row.amount_paid_cents || 0), 0);
  const trackedPlatformRevenue30dCents = subscriptionCollected30dCents + eventPlatformRevenueCents;

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
      status: `${format(generatedSites.count)} sites · ${format(hostingNodes.count)} nodes`,
      helper: `${format(liveGeneratedSites.count)} live · ${format(healthyHostingNodes.count)} healthy nodes`,
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
      status: `${format(mlScored.count)} scored · ${format(mlIntentRows.count)} intents · ${format(mlPairRows.count)} pairs`,
      helper: mlLastRun.data?.created_at ? `Last run ${new Date(mlLastRun.data.created_at).toLocaleDateString()}` : "No ML run yet",
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
    { label: "Reservations today", value: format(todayReservations.count), detail: `${format(upcomingReservations.count)} next 7 days`, href: "/admin/dashboard/reservations" },
    { label: "Active events", value: format(activeEvents.count), detail: `${format(eventOrders)} orders · ${format(eventTickets)} tickets / 30d`, href: "/admin/dashboard/events-experiences" },
    { label: "Event sales · 30d", value: money(eventSalesCents), detail: `${money(eventPlatformRevenueCents)} platform fees`, href: "/admin/dashboard/events-experiences" },
    { label: "Active experiences", value: format(activeExperiences.count), detail: `${format(experienceBookingCount)} bookings / 30d`, href: "/admin/dashboard/events-experiences" },
    { label: "Experience guests · 30d", value: format(experienceGuests), detail: `${money(experienceEstimatedValueCents)} est. booking value`, href: "/admin/dashboard/events-experiences" },
    { label: "Paying locations", value: format(activePaidLocations.length), detail: `${money(mrrCents)} MRR`, href: "/admin/dashboard/billing" },
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
        <AdminKpiCard label="Generated sites" value={generatedSites.count || 0} helper={`${liveGeneratedSites.count || 0} live on managed hosting`} />
        <AdminKpiCard label="Hosting nodes" value={hostingNodes.count || 0} helper={`${healthyHostingNodes.count || 0} currently healthy`} />
        <AdminKpiCard label="Reservations" value={reservations.count || 0} helper="All-time reservation records" />
        <AdminKpiCard label="Today" value={todayReservations.count || 0} helper="Reservations scheduled today" />
        <AdminKpiCard label="Open tickets" value={openTicketsResult.count || 0} helper="Support requiring attention" />
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
