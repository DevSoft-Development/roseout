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
import { supabaseAdmin } from "@/lib/supabase-admin";

export const metadata: Metadata = {
  title: "Admin Dashboard",
  description: "Central admin overview for TheOutHaven.",
};

const todayKey = () => new Date().toISOString().split("T")[0];
const format = (v: number | null | undefined) =>
  Number(v || 0).toLocaleString();

export default async function CentralDashboardPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.dashboard);
  const today = todayKey();
  const [
    restaurants,
    activities,
    reservations,
    todayReservations,
    openTicketsResult,
  ] = await Promise.all([
    supabaseAdmin
      .from("restaurants")
      .select("id", { count: "exact", head: true }),
    supabaseAdmin
      .from("activities")
      .select("id", { count: "exact", head: true }),
    supabaseAdmin
      .from("location_reservations")
      .select("id", { count: "exact", head: true }),
    supabaseAdmin
      .from("location_reservations")
      .select("id", { count: "exact", head: true })
      .eq("reservation_date", today),
    supabaseAdmin
      .from("support_tickets")
      .select("id", { count: "exact", head: true })
      .not("status", "in", "(closed,resolved)"),
  ]);

  const totalLocations = (restaurants.count || 0) + (activities.count || 0);
  const groups = [
    {
      title: "Search health",
      desc: "Validate discovery, parser output, and search QA.",
      href: "/admin/dashboard/search-health",
      status: "Monitor",
    },
    {
      title: "Photo enrichment",
      desc: "Improve listing quality with Google enrichment and missing-photo queues.",
      href: "/admin/dashboard/locations/google-enrichment",
      status: "Improve",
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
  ];
  const tasks = [
    ["Needs review", "/admin/dashboard/data-quality"],
    ["Missing Google Place ID", "/admin/dashboard/locations/google-enrichment"],
    ["Claim not sent", "/admin/dashboard/crm?view=claim-not-sent"],
    ["Payment pending", "/admin/dashboard/crm?view=payment-pending"],
    ["Giveaway entries", "/admin/dashboard/giveaway"],
  ];

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="TheOutHaven Admin"
        title="Admin Overview"
        subtitle="Monitor TheOutHaven operations, partners, search health, claims, and growth."
        actions={
          <>
            <AdminActionButton href="/admin/dashboard/reports">
              View Reports
            </AdminActionButton>
            <AdminActionButton href="/admin/dashboard/settings">
              Settings
            </AdminActionButton>
            <AdminActionButton href="/admin/dashboard" variant="primary">
              Refresh
            </AdminActionButton>
          </>
        }
      />

      <AdminKpiGrid>
        <AdminKpiCard
          label="Total locations"
          value={totalLocations}
          helper="Restaurants + activities"
        />
        <AdminKpiCard
          label="Restaurants"
          value={restaurants.count || 0}
          helper="Inventory source"
        />
        <AdminKpiCard
          label="Activities"
          value={activities.count || 0}
          helper="Inventory source"
        />
        <AdminKpiCard
          label="Reservations"
          value={reservations.count || 0}
          helper="All-time reservation records"
        />
        <AdminKpiCard
          label="Today"
          value={todayReservations.count || 0}
          helper="Reservations scheduled today"
        />
        <AdminKpiCard
          label="Open tickets"
          value={openTicketsResult.count || 0}
          helper="Support requiring attention"
        />
      </AdminKpiGrid>

      <AdminSectionCard className="p-5">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-rose-200">
              Quick Admin Search
            </p>
            <h2 className="mt-1 text-2xl font-black text-white">
              Search locations, owners, and CRM records
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-white/55">
              Find records by location name, owner email, phone number, or
              address without leaving the dashboard.
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
              <span className="mt-5 inline-flex rounded-full border border-white/10 px-3 py-1.5 text-xs font-black text-white/70">
                Open panel
              </span>
            </Link>
          ))}
        </section>
        <AdminSectionCard className="p-5">
          <h2 className="text-xl font-black text-white">Priority tasks</h2>
          <p className="mt-1 text-sm text-white/55">
            Operational queues that usually need daily attention.
          </p>
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
