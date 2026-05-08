import Link from "next/link";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Reserve Experiences",
  description:
    "Book restaurants, activities, and unforgettable experiences through TheOutHaven Reserve.",
  path: "/reserve",
});
export default function ReserveLandingPage() {
  return (
    <main className="min-h-screen bg-[#090706] px-4 pb-12 pt-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        {/* HEADER */}
        <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.25),transparent_35%),linear-gradient(135deg,#160b0b,#090706_55%,#140f0a)] p-8 shadow-2xl">
          <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-rose-500/20 blur-3xl" />

          <div className="relative z-10">
            <p className="mb-3 text-xs font-black uppercase tracking-[0.35em] text-rose-300">
              TheOutHaven Reserve
            </p>

            <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
              Book unforgettable experiences
            </h1>

            <p className="mt-4 max-w-2xl text-sm leading-6 text-white/60 sm:text-base">
              Discover restaurants, activities, and experiences — then reserve
              your time instantly with smart availability powered by
              TheOutHaven.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/create"
                className="rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-6 py-3 text-sm font-black text-white shadow-lg hover:scale-[1.03] transition"
              >
                Plan an outing
              </Link>

              <Link
                href="/locations"
                className="rounded-full border border-white/10 bg-white/[0.06] px-6 py-3 text-sm font-black text-white/70 hover:bg-white/[0.1] hover:text-white transition"
              >
                Browse locations
              </Link>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.06] p-6">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-white/45">
              Step 1
            </p>
            <h3 className="mt-2 text-lg font-black">Find a place</h3>
            <p className="mt-2 text-sm text-white/60">
              Search restaurants, activities, and curated experiences.
            </p>
          </div>

          <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.06] p-6">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-white/45">
              Step 2
            </p>
            <h3 className="mt-2 text-lg font-black">Pick your time</h3>
            <p className="mt-2 text-sm text-white/60">
              Only real available times are shown — no double booking.
            </p>
          </div>

          <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.06] p-6">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-white/45">
              Step 3
            </p>
            <h3 className="mt-2 text-lg font-black">Reserve instantly</h3>
            <p className="mt-2 text-sm text-white/60">
              Lock in your experience in seconds.
            </p>
          </div>
        </section>

        {/* CTA */}
        <section className="mt-10 text-center">
          <h2 className="text-2xl font-black">
            Ready to book your next experience?
          </h2>

          <p className="mt-2 text-sm text-white/60">
            Start by planning your outing or browsing locations.
          </p>

          <div className="mt-5 flex justify-center gap-3">
            <Link
              href="/create"
              className="rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-6 py-3 text-sm font-black text-white shadow-lg hover:scale-[1.03] transition"
            >
              Start Planning
            </Link>

            <Link
              href="/locations"
              className="rounded-full border border-white/10 bg-white/[0.06] px-6 py-3 text-sm font-black text-white/70 hover:bg-white/[0.1] hover:text-white transition"
            >
              Browse Locations
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
