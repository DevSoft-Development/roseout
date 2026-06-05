import type { Metadata } from "next";
import { requireAdminRole } from "@/lib/admin-auth";
import LocationLayoutClient from "@/components/LocationLayoutClient";
import AdminPageTabs from "@/components/admin/AdminPageTabs";
import { adminReservationTabs } from "@/components/admin/reservationTabs";

import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
export const metadata: Metadata = {
  title: "Location Layout",
  description: "Admin visual reservation layout editor.",
};

export default async function AdminReservationLocationLayoutPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.reservationLayouts);

  return (
    <main className="min-h-screen bg-[#090706] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1600px] space-y-5">
        <section className="rounded-[1.75rem] border border-white/10 bg-[#120d0b] p-5 shadow-2xl">
          <h1 className="text-3xl font-black tracking-tight">Edit Layout</h1>
          <p className="mt-2 text-sm text-white/60">
            Configure the admin reservation floor and location layout tools.
          </p>
          <div className="mt-4">
            <AdminPageTabs tabs={adminReservationTabs} />
          </div>
        </section>
        <LocationLayoutClient
          backHref="/admin/dashboard/reservations"
          adminMode
        />
      </div>
    </main>
  );
}
