import type { Metadata } from "next";
import { requireAdminRole } from "@/lib/admin-auth";
import AdminReserveLiveClient from "./AdminReserveLiveClient";
import AdminPageTabs from "@/components/admin/AdminPageTabs";
import { adminReservationTabs } from "@/components/admin/reservationTabs";

import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
export const metadata: Metadata = {
  title: "Live Reserve Operations | TheOutHaven Admin",
  description:
    "Admin-wide live reservation, waitlist, occupancy, and floor operations dashboard for every TheOutHaven location.",
};

export default async function AdminReservePage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.reservations);

  return (
    <main className="min-h-screen bg-[#090706] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1600px] space-y-5">
        <section className="rounded-[1.75rem] border border-white/10 bg-[#120d0b] p-5 shadow-2xl">
          <h1 className="text-3xl font-black tracking-tight">View Layout</h1>
          <p className="mt-2 text-sm text-white/60">
            Monitor customer-facing reservation availability and live floor
            state.
          </p>
          <div className="mt-4">
            <AdminPageTabs tabs={adminReservationTabs} />
          </div>
        </section>
        <AdminReserveLiveClient />
      </div>
    </main>
  );
}
