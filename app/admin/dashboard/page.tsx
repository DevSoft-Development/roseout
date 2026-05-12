import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { supabase } from "@/lib/supabase";
import { listSupportTickets } from "@/lib/support";

const ADMIN_DASHBOARD_VERSION = "admin-dashboard-reserve-support-2026-05-12";

function formatNumber(value: number | null | undefined) {
  return Number(value || 0).toLocaleString();
}

function todayKey() {
  return new Date().toISOString().split("T")[0];
}

function isOpenTicket(status: string | null | undefined) {
  return !["closed", "resolved"].includes(String(status || "open").toLowerCase());
}

export default async function CentralDashboardPage() {
  await requireAdminRole(["superuser", "admin", "editor", "viewer"]);

  const today = todayKey();

  const [
    restaurantsResult,
    activitiesResult,
    claimedRestaurantsResult,
    claimedActivitiesResult,
    reservationsResult,
    todayReservationsResult,
    pendingReservationsResult,
    supportTickets,
  ] = await Promise.all([
    supabase.from("restaurants").select("id", { count: "exact", head: true }),
    supabase.from("activities").select("id", { count: "exact", head: true }),
    supabase
      .from("restaurants")
      .select("id", { count: "exact", head: true })
      .eq("claimed", true),
    supabase
      .from("activities")
      .select("id", { count: "exact", head: true })
      .eq("claimed", true),
    supabase
      .from("location_reservations")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("location_reservations")
      .select("id", { count: "exact", head: true })
      .eq("reservation_date", today),
    supabase
      .from("location_reservations")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    listSupportTickets(12),
  ]);

  const totalRestaurants = restaurantsResult.count;
  const totalActivities = activitiesResult.count;
  const claimedRestaurants = claimedRestaurantsResult.count;
  const claimedActivities = claimedActivitiesResult.count;
  const totalReservations = reservationsResult.count;
  const todayReservations = todayReservationsResult.count;
  const pendingReservations = pendingReservationsResult.count;
  const openTickets = supportTickets.filter((ticket) => isOpenTicket(ticket.status)).length;

  const totalLocations = Number(totalRestaurants || 0) + Number(totalActivities || 0);
  const totalClaimed = Number(claimedRestaurants || 0) + Number(claimedActivities || 0);

  const platformStats = [
    {
      label: "Locations",
      value: totalLocations,
      href: "/admin/dashboard/locations",
      tone: "text-white",
    },
    {
      label: "Reservations",
      value: totalReservations,
      href: "/admin/dashboard/reservations",
      tone: "text-rose-200",
    },
    {
      label: "Today",
      value: todayReservations,
      href: "/admin/dashboard/reservations/list?filter=today",
      tone: "text-amber-200",
    },
    {
      label: "Open Tickets",
      value: openTickets,
      href: "/admin/dashboard/support",
      tone: "text-emerald-300",
    },
  ];

  const navCards = [
    {
      eyebrow: "Inventory",
      title: "Locations",
      text: "Manage restaurants and activities from one unified admin page.",
      href: "/admin/dashboard/locations",
      cta: "Manage locations",
    },
    {
      eyebrow: "Inventory",
      title: "Add Location",
      text: "Create a restaurant or activity and generate claim QR fields.",
      href: "/admin/dashboard/locations/new",
      cta: "Add location",
    },
    {
      eyebrow: "Reserve",
      title: "Reservations",
      text: "Monitor bookings, pending requests, arrival flow, and live availability.",
      href: "/admin/dashboard/reservations",
      cta: "Open reserve",
    },
    {
      eyebrow: "Tickets",
      title: "Support Inbox",
      text: "Review customer issues, reply to conversations, and create internal tickets.",
      href: "/admin/dashboard/support",
      cta: "Open inbox",
    },
    {
      eyebrow: "Claims",
      title: "Claim Review",
      text: "Review business claims and connect owners to their locations.",
      href: "/admin/claims",
      cta: "Review claims",
    },
    {
      eyebrow: "Analytics",
      title: "Performance",
      text: "Track reservation health, engagement signals, and platform conversion.",
      href: "/admin/dashboard/analytics",
      cta: "View analytics",
    },
    {
      eyebrow: "Operations",
      title: "Import",
      text: "Run targeted Google imports for restaurants and activities by area, tag, and rating.",
      href: "/admin/dashboard/import",
      cta: "Open import",
    },
    {
      eyebrow: "Claims",
      title: "Print Claim QRs",
      text: "Print claim labels with QR codes, location names, and full addresses.",
      href: "/admin/dashboard/claim-qrs",
      cta: "Print QRs",
    },
    {
      eyebrow: "Customer Flow",
      title: "Create Plan",
      text: "Test how customers search, discover, and select outing plans.",
      href: "/create",
      cta: "Test flow",
    },
  ];

  return (
    <main
      data-page-version={ADMIN_DASHBOARD_VERSION}
      className="min-h-screen bg-[#090706] px-4 pb-12 pt-4 text-white sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-[1500px]">
        <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.24),transparent_34%),linear-gradient(135deg,#170b0b,#090706_58%,#14100c)] p-5 shadow-2xl sm:p-7">
          <div className="absolute right-[-60px] top-[-60px] h-64 w-64 rounded-full bg-rose-500/20 blur-3xl" />
          <div className="absolute bottom-[-70px] left-24 h-48 w-48 rounded-full bg-amber-300/10 blur-3xl" />

          <div className="relative z-10 grid gap-6 lg:grid-cols-[1.15fr_460px] lg:items-end">
            <div>
              <p className="mb-3 text-xs font-black uppercase tracking-[0.35em] text-rose-300">
                TheOutHaven Control Center
              </p>

              <h1 className="max-w-4xl text-4xl font-black tracking-tight sm:text-5xl">
                Central dashboard for Reserve, tickets, and operations.
              </h1>

              <p className="mt-4 max-w-2xl text-sm leading-6 text-white/60 sm:text-base">
                The latest admin hub is restored here: location inventory, live
                reservations, support tickets, claims, and customer-flow testing
                are all one click away.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/admin/dashboard/reservations"
                  className="rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-6 py-3 text-sm font-black text-white shadow-lg shadow-rose-950/30 transition hover:scale-[1.03]"
                >
                  Open Reserve
                </Link>

                <Link
                  href="/admin/dashboard/support"
                  className="rounded-full border border-white/10 bg-white/[0.07] px-6 py-3 text-sm font-black text-white/70 transition hover:bg-white/10 hover:text-white"
                >
                  Support Tickets
                </Link>

                <Link
                  href="/admin/dashboard/locations"
                  className="rounded-full border border-white/10 bg-white/[0.07] px-6 py-3 text-sm font-black text-white/70 transition hover:bg-white/10 hover:text-white"
                >
                  Manage Locations
                </Link>

                <Link
                  href="/admin/dashboard/locations/new"
                  className="rounded-full border border-white/10 bg-white/[0.07] px-6 py-3 text-sm font-black text-white/70 transition hover:bg-white/10 hover:text-white"
                >
                  Add Location
                </Link>

                <Link
                  href="/admin/dashboard/claim-qrs"
                  className="rounded-full border border-white/10 bg-white/[0.07] px-6 py-3 text-sm font-black text-white/70 transition hover:bg-white/10 hover:text-white"
                >
                  Print Claim QRs
                </Link>

                <Link
                  href="/admin/dashboard/import"
                  className="rounded-full border border-white/10 bg-white/[0.07] px-6 py-3 text-sm font-black text-white/70 transition hover:bg-white/10 hover:text-white"
                >
                  Import
                </Link>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.08] p-4 backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.25em] text-white/45">
                    Live Snapshot
                  </p>
                  <p className="mt-1 text-sm text-white/45">
                    Reserve + support health
                  </p>
                </div>
                {Number(pendingReservations || 0) > 0 && (
                  <Link
                    href="/admin/dashboard/reservations/list?status=pending"
                    className="rounded-full bg-amber-300 px-3 py-2 text-xs font-black text-black"
                  >
                    {formatNumber(pendingReservations)} pending
                  </Link>
                )}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                {platformStats.map((stat) => (
                  <Link
                    key={stat.label}
                    href={stat.href}
                    className="rounded-2xl bg-black/25 p-4 transition hover:bg-white/10"
                  >
                    <p className="text-[10px] font-black uppercase tracking-wide text-white/40">
                      {stat.label}
                    </p>
                    <p className={`mt-1 text-3xl font-black ${stat.tone}`}>
                      {formatNumber(stat.value)}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-4 md:grid-cols-4">
          <Link
            href="/admin/dashboard/locations"
            className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5 shadow-xl transition hover:-translate-y-1 hover:bg-white/[0.09]"
          >
            <p className="text-xs font-black uppercase tracking-[0.22em] text-white/45">
              Locations
            </p>
            <p className="mt-2 text-3xl font-black">
              {formatNumber(totalLocations)}
            </p>
          </Link>

          <Link
            href="/admin/dashboard/locations?type=restaurants&page=1"
            className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5 shadow-xl transition hover:-translate-y-1 hover:bg-white/[0.09]"
          >
            <p className="text-xs font-black uppercase tracking-[0.22em] text-white/45">
              Restaurants
            </p>
            <p className="mt-2 text-3xl font-black text-rose-200">
              {formatNumber(totalRestaurants)}
            </p>
          </Link>

          <Link
            href="/admin/dashboard/locations?type=activities&page=1"
            className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5 shadow-xl transition hover:-translate-y-1 hover:bg-white/[0.09]"
          >
            <p className="text-xs font-black uppercase tracking-[0.22em] text-white/45">
              Activities
            </p>
            <p className="mt-2 text-3xl font-black text-purple-200">
              {formatNumber(totalActivities)}
            </p>
          </Link>

          <Link
            href="/admin/dashboard/locations?claim=claimed&page=1"
            className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5 shadow-xl transition hover:-translate-y-1 hover:bg-white/[0.09]"
          >
            <p className="text-xs font-black uppercase tracking-[0.22em] text-white/45">
              Claimed
            </p>
            <p className="mt-2 text-3xl font-black text-emerald-300">
              {formatNumber(totalClaimed)}
            </p>
          </Link>
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[1fr_430px]">
          <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#f8f3ef] text-[#1b1210] shadow-2xl">
            <div className="border-b border-black/10 bg-white/75 p-5">
              <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-700">
                Latest Admin Tools
              </p>
              <h2 className="mt-2 text-2xl font-black">
                Manage the full TheOutHaven flow
              </h2>
            </div>

            <div className="grid gap-0 md:grid-cols-2 xl:grid-cols-3">
              {navCards.map((card) => (
                <Link
                  key={card.href}
                  href={card.href}
                  className="group border-b border-black/10 p-5 transition hover:bg-rose-50 md:border-r"
                >
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-black/35">
                    {card.eyebrow}
                  </p>

                  <h3 className="mt-2 text-xl font-black">{card.title}</h3>

                  <p className="mt-2 min-h-[72px] text-sm leading-6 text-black/50">
                    {card.text}
                  </p>

                  <span className="mt-5 inline-flex rounded-full bg-[#1b1210] px-4 py-2 text-xs font-black text-white transition group-hover:bg-rose-600">
                    {card.cta} →
                  </span>
                </Link>
              ))}
            </div>
          </div>

          <aside className="rounded-[2rem] border border-white/10 bg-[#120d0b] p-5 shadow-2xl">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-300">
              Ticket Pulse
            </p>

            <h2 className="mt-2 text-2xl font-black">
              Latest support activity
            </h2>

            <div className="mt-5 space-y-3">
              {supportTickets.slice(0, 5).map((ticket) => (
                <Link
                  key={ticket.id}
                  href={`/admin/dashboard/support/${ticket.id}`}
                  className="block rounded-[1.25rem] border border-white/10 bg-white/[0.06] p-4 transition hover:bg-white/[0.1]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-rose-200">
                        {ticket.ticket_number || ticket.id}
                      </p>
                      <p className="mt-1 font-black">{ticket.subject}</p>
                    </div>
                    <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black uppercase text-black">
                      {ticket.status || "open"}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-white/45">
                    {ticket.requester_name || "Guest"} · {ticket.requester_email}
                  </p>
                </Link>
              ))}

              {supportTickets.length === 0 && (
                <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.06] p-5 text-sm font-bold text-white/45">
                  No support tickets yet. New tickets will appear here as soon as
                  customers or admins create them.
                </div>
              )}
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
