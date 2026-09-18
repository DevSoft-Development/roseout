import type { Metadata } from "next";
import Link from "next/link";

import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { HostingDrTestPanel } from "@/components/admin/HostingDrTestPanel";
import { WebsiteHostingTabs } from "@/components/admin/WebsiteHostingTabs";

export const metadata: Metadata = {
  title: "Website Hosting Testing | Admin",
  description: "Run disaster-recovery simulations and guarded live hosting drills.",
};

export const dynamic = "force-dynamic";

export default async function WebsiteHostingTestingPage() {
  await requireAdminRole(["superadmin", "admin"]);

  return (
    <main className="min-h-screen bg-[#090706] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <header className="rounded-3xl border border-white/10 bg-[#120d0b] p-6 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[.26em] text-rose-300">Infrastructure</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black sm:text-4xl">Website Hosting Testing</h1>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-white/55">
                Disaster-recovery simulation, readiness evidence, and explicitly controlled live DR testing for TheOutHaven hosting infrastructure.
              </p>
            </div>
            <div className="flex gap-2">
              <Link href="/admin/dashboard/website-hosting" className="rounded-xl border border-white/15 px-4 py-2 text-sm font-black">Hosting Overview</Link>
              <Link href="/admin/dashboard/website-hosting/testing" className="rounded-xl bg-white px-4 py-2 text-sm font-black text-black">Refresh</Link>
            </div>
          </div>
        </header>

        <WebsiteHostingTabs active="testing" />
        <HostingDrTestPanel />
      </div>
    </main>
  );
}
