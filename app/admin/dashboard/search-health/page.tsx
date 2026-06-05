import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";

export const metadata = {
  title: "Search Health – Admin",
  description:
    "Monitor search issues, no-pair results, slow searches, and regression warnings.",
};

const cards = [
  {
    title: "Search Issues",
    description: "Track search errors and quality warnings once logging is connected.",
  },
  {
    title: "No Valid Pair Searches",
    description: "Review searches that did not produce valid restaurant and activity pairings.",
  },
  {
    title: "Slow Searches",
    description: "Surface slow search requests and timing outliers for investigation.",
  },
  {
    title: "Regression Status",
    description: "Monitor search regression warnings and dashboard readiness signals.",
  },
];

export default async function SearchHealthPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.searchHealth);

  return (
    <main className="min-h-screen bg-[#090706] px-4 pb-12 pt-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <section className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.14),transparent_30%),linear-gradient(135deg,#170b0b,#090706_58%,#14100c)] p-6">
          <p className="text-xs font-black uppercase tracking-[0.32em] text-rose-200">
            Admin Tools / System
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tight">Search Health</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65">
            Monitor search issues, no-pair results, slow searches, and regression warnings.
          </p>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <div
              key={card.title}
              className="rounded-3xl border border-white/10 bg-white/[0.05] p-5"
            >
              <p className="text-sm font-black text-white">{card.title}</p>
              <p className="mt-2 text-sm leading-6 text-white/60">{card.description}</p>
              <p className="mt-5 text-3xl font-black text-white/40">—</p>
            </div>
          ))}
        </section>

        <section className="rounded-3xl border border-white/10 bg-[#120d0b] p-6">
          <p className="text-sm leading-6 text-white/70">
            Search Health reporting will appear here once search_health_events logging is connected.
          </p>
        </section>
      </div>
    </main>
  );
}
