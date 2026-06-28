import type { Metadata } from "next";
import AdminPageTabs from "@/components/admin/AdminPageTabs";
import { adminReservationTabs } from "@/components/admin/reservationTabs";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import ReserveCommandCenterPage from "@/components/reserve/ReserveCommandCenterPage";

export const metadata: Metadata = {
  title: "Reservations",
  description: "Admin reservation operations dashboard.",
};

export default async function AdminReservationsPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.reservations);

  return (
    <main className="min-h-screen bg-[#090706] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1600px] space-y-5">
        <section className="rounded-[1.75rem] border border-white/10 bg-[#120d0b] p-5 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-200/70">
            TheOutHaven Admin
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">
            Reservations
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">
            Manage live reservations, reservation list, location layout, and
            customer-facing layout.
          </p>
          <div className="mt-4">
            <AdminPageTabs tabs={adminReservationTabs} />
          </div>
        </section>
        <ReserveCommandCenterPage />
      </div>
    </main>
  );
}
