import type { Metadata } from "next";
import AdminPageTabs from "@/components/admin/AdminPageTabs";
import { adminReservationTabs } from "@/components/admin/reservationTabs";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import ReserveCommandCenterPage from "@/components/reserve/ReserveCommandCenterPage";

export const metadata: Metadata = {
  title: "Reservation List | TheOutHaven Admin",
  description: "Admin reservation list and operational filters.",
};

export default async function AdminReservationListPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.reservations);

  return (
    <main className="min-h-screen bg-[#090706] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1600px] space-y-5">
        <section className="rounded-[1.75rem] border border-white/10 bg-[#120d0b] p-5 shadow-2xl">
          <h1 className="text-3xl font-black tracking-tight">Reservations</h1>
          <p className="mt-2 text-sm text-white/60">
            Review and manage every reservation from the operations list.
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
