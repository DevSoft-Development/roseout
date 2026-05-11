import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { supabase } from "@/lib/supabase";

function formatNumber(value: number | null | undefined) {
  return Number(value || 0).toLocaleString();
}

export default async function CentralDashboardPage() {
  await requireAdminRole(["superuser", "admin", "editor", "reviewer", "viewer"]);

  const { count: totalRestaurants } = await supabase
    .from("restaurants")
    .select("id", { count: "exact", head: true });

  const { count: totalActivities } = await supabase
    .from("activities")
    .select("id", { count: "exact", head: true });

  const { count: totalReservations } = await supabase
    .from("reservations")
    .select("id", { count: "exact", head: true });

  const { count: claimedRestaurants } = await supabase
    .from("restaurants")
    .select("id", { count: "exact", head: true })
    .eq("claimed", true);

  const navCards = [
    {
      eyebrow: "Inventory",
      title: "Restaurants",
      text: "Manage restaurant listings, claims, images, scores, and edits.",
      href: "/admin/restaurants",
      cta: "Manage restaurants",
    },
    {
      eyebrow: "Inventory",
      title: "Activities",
      text: "Manage activities, experiences, booking durations, and status.",
      href: "/admin/activities",
      cta: "Manage activities",
    },
    {
      eyebrow: "Reserve",
      title: "Reservations",
      text: "View bookings, availability, live service flow, and requests.",
      href: "/reserve/dashboard",
      cta: "Open reserve",
    },
    {
      eyebrow: "Customer Flow",
      title: "Create Plan",
      text: "Test how customers search, discover, and select outing plans.",
      href: "/create",
      cta: "Test flow",
    },
    {
      eyebrow: "Support",
      title: "Tickets",
      text: "Submit, reply to, and view support tickets from the admin inbox.",
      href: "/admin/dashboard/support",
      cta: "Open support",
    },
  ];

  return (
    <main className="min-h-screen bg-[#090706] px-4 pb-12 pt-4 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px]">
        <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.24),transparent_34%),linear-gradient(135deg,#170b0b,#090706_58%,#14100c)] p-5 shadow-2xl sm:p-7">
          <div className="absolute right-[-60px] top-[-60px] h-64 w-64 rounded-full bg-rose-500/20 blur-3xl" />
          <div className="absolute bottom-[-70px] left-24 h-48 w-48 rounded-full bg-amber-300/10 blur-3xl" />

          <div className="relative z-10 grid gap-6 lg:grid-cols-[1.2fr_420px] lg:items-end">
            <div>
              <p className="mb-3 text-xs font-black uppercase tracking-[0.35em] text-rose-300">
                TheOutHaven Control Center
              </p>

              <h1 className="max-w-4xl text-4xl font-black tracking-tight sm:text-5xl">
                Central Dashboard
              </h1>

              <p className="mt-4 max-w-2xl text-sm leading-6 text-white/60 sm:text-base">
                A premium command center for managing locations, reservations,
                claims, and the full TheOutHaven customer journey.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/reserve/dashboard"
                  className="rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-6 py-3 text-sm font-black text-white shadow-lg shadow-rose-950/30 transition hover:scale-[1.03]"
                >
                  Open Reserve
                </Link>

                <Link
                  href="/create"
                  className="rounded-full border border-white/10 bg-white/[0.07] px-6 py-3 text-sm font-black text-white/70 transition hover:bg-white/10 hover:text-white"
                >
                  Test Customer Flow
                </Link>

                <Link
                  href="/admin/dashboard/support"
                  className="rounded-full border border-white/10 bg-white/[0.07] px-6 py-3 text-sm font-black text-white/70 transition hover:bg-white/10 hover:text-white"
                >
                  Support Tickets
                </Link>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.08] p-4 backdrop-blur">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-white/45">
                Platform Snapshot
              </p>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-black/25 p-4">
                  <p className="text-[10px] font-black uppercase tracking-wide text-white/40">
                    Restaurants
                  </p>
                  <p className="mt-1 text-3xl font-black">
                    {formatNumber(totalRestaurants)}
                  </p>
                </div>

                <div className="rounded-2xl bg-black/25 p-4">
                  <p className="text-[10px] font-black uppercase tracking-wide text-white/40">
                    Activities
                  </p>
                  <p className="mt-1 text-3xl font-black">
                    {formatNumber(totalActivities)}
                  </p>
                </div>

                <div className="rounded-2xl bg-black/25 p-4">
                  <p className="text-[10px] font-black uppercase tracking-wide text-white/40">
                    Reservations
                  </p>
                  <p className="mt-1 text-3xl font-black text-rose-200">
                    {formatNumber(totalReservations)}
                  </p>
                </div>

                <div className="rounded-2xl bg-black/25 p-4">
                  <p className="text-[10px] font-black uppercase tracking-wide text-white/40">
                    Claimed
                  </p>
                  <p className="mt-1 text-3xl font-black text-emerald-300">
                    {formatNumber(claimedRestaurants)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-4 md:grid-cols-4">
          <Link
            href="/admin/restaurants"
            className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5 shadow-xl transition hover:-translate-y-1 hover:bg-white/[0.09]"
          >
            <p className="text-xs font-black uppercase tracking-[0.22em] text-white/45">
              Restaurants
            </p>
            <p className="mt-2 text-3xl font-black">
              {formatNumber(totalRestaurants)}
            </p>
          </Link>

          <Link
            href="/admin/activities"
            className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5 shadow-xl transition hover:-translate-y-1 hover:bg-white/[0.09]"
          >
            <p className="text-xs font-black uppercase tracking-[0.22em] text-white/45">
              Activities
            </p>
            <p className="mt-2 text-3xl font-black">
              {formatNumber(totalActivities)}
            </p>
          </Link>

          <Link
            href="/reserve/dashboard"
            className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5 shadow-xl transition hover:-translate-y-1 hover:bg-white/[0.09]"
          >
            <p className="text-xs font-black uppercase tracking-[0.22em] text-white/45">
              Reservations
            </p>
            <p className="mt-2 text-3xl font-black text-rose-200">
              {formatNumber(totalReservations)}
            </p>
          </Link>

          <Link
            href="/admin/restaurants?claimed=true"
            className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5 shadow-xl transition hover:-translate-y-1 hover:bg-white/[0.09]"
          >
            <p className="text-xs font-black uppercase tracking-[0.22em] text-white/45">
              Claimed
            </p>
            <p className="mt-2 text-3xl font-black text-emerald-300">
              {formatNumber(claimedRestaurants)}
            </p>
          </Link>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-[1fr_420px]">
          <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#f8f3ef] text-[#1b1210] shadow-2xl">
            <div className="border-b border-black/10 bg-white/75 p-5">
              <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-700">
                Quick Actions
              </p>
              <h2 className="mt-2 text-2xl font-black">
                Manage your TheOutHaven flow
              </h2>
            </div>

            <div className="grid gap-0 md:grid-cols-2">
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

                  <p className="mt-2 min-h-[48px] text-sm leading-6 text-black/50">
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
              Next Best Moves
            </p>

            <h2 className="mt-2 text-2xl font-black">
              Keep building like a real platform
            </h2>

            <div className="mt-5 space-y-3">
              <Link
                href="/reserve/dashboard"
                className="block rounded-[1.25rem] border border-white/10 bg-white/[0.06] p-4 transition hover:bg-white/[0.1]"
              >
                <p className="font-black">Reservation System</p>
                <p className="mt-1 text-xs leading-5 text-white/45">
                  Manage live availability, bookings, and location duration
                  settings.
                </p>
              </Link>

              <Link
                href="/admin/activities"
                className="block rounded-[1.25rem] border border-white/10 bg-white/[0.06] p-4 transition hover:bg-white/[0.1]"
              >
                <p className="font-black">Location Inventory</p>
                <p className="mt-1 text-xs leading-5 text-white/45">
                  Keep restaurants and activities polished, approved, and ready
                  to book.
                </p>
              </Link>

              <Link
                href="/create"
                className="block rounded-[1.25rem] border border-white/10 bg-white/[0.06] p-4 transition hover:bg-white/[0.1]"
              >
                <p className="font-black">Customer Experience</p>
                <p className="mt-1 text-xs leading-5 text-white/45">
                  Test search results, plan cards, and the Reserve button flow.
                </p>
              </Link>

              <Link
                href="/admin/dashboard/support"
                className="block rounded-[1.25rem] border border-white/10 bg-white/[0.06] p-4 transition hover:bg-white/[0.1]"
              >
                <p className="font-black">Support Ticket System</p>
                <p className="mt-1 text-xs leading-5 text-white/45">
                  Submit support requests and manage customer replies from the
                  admin ticket inbox.
                </p>
              </Link>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}