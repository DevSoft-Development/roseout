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

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminReservationLocationLayoutPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireAdminRole(ADMIN_PAGE_ACCESS.reservationLayouts);
  const params = await searchParams;
  const locationId = firstParam(params.locationId);
  const rawType = firstParam(params.type);
  const type = rawType === "activity" ? "activity" : rawType === "restaurant" ? "restaurant" : undefined;

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
          initialLocationId={locationId}
          initialLocationType={type}
        />
      </div>
    </main>
  );
}
