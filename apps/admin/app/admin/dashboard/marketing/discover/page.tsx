import type { Metadata } from "next";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import DiscoverMerchandisingClient from "./DiscoverMerchandisingClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Discover Merchandising | TheOutHaven Admin" },
  description: "Manage curated and sponsored content for the Discover experience.",
};

export default async function DiscoverMerchandisingPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.marketing);

  return (
    <main className="min-h-screen bg-[#090706] px-4 pb-12 pt-4 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px]">
        <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.24),transparent_34%),linear-gradient(135deg,#170b0b,#090706_58%,#14100c)] p-6 shadow-2xl sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.32em] text-rose-300">Marketing · Discover</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">Merchandise the Discover experience.</h1>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-white/60 sm:text-base">
            Curate complete outings and partner placements here. Trending, popular searches, trending areas, and most-saved content refresh automatically every morning from real TheOutHaven activity.
          </p>
          <div className="mt-5 flex flex-wrap gap-2 text-xs font-black uppercase tracking-wide">
            <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-emerald-200">Daily auto refresh</span>
            <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-white/60">Curated content stays manual</span>
            <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-white/60">Sponsored placements labeled</span>
          </div>
        </section>

        <DiscoverMerchandisingClient />
      </div>
    </main>
  );
}
