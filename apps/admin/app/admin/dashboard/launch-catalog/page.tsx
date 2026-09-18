import type { Metadata } from "next";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { getLaunchCatalogHealth } from "@/lib/admin/location-launch-health";
import LaunchCatalogClient from "./LaunchCatalogClient";

export const metadata: Metadata = {
  title: "Launch Catalog Health | TheOutHaven Admin",
  description:
    "Launch readiness, cleanup blockers, and factual description backfill for TheOutHaven locations.",
};

export const dynamic = "force-dynamic";

export default async function LaunchCatalogPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.dataQuality);
  const health = await getLaunchCatalogHealth();

  return (
    <main className="admin-page min-h-screen px-4 pb-14 pt-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <header className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-rose-300">
            Location Data Quality
          </p>
          <h1 className="mt-2 text-3xl font-black">Launch Catalog Health</h1>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-white/55">
            Verify public launch blockers, track description coverage, and run
            factual Google-structured description backfill before expanding to
            hidden inventory.
          </p>
        </header>
        <LaunchCatalogClient initialHealth={health} />
      </div>
    </main>
  );
}
