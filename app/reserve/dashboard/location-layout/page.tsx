import type { Metadata } from "next";
import { requireAdminRole } from "@/lib/admin-auth";
import LocationLayoutClient from "@/components/LocationLayoutClient";

import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
export const metadata: Metadata = {
  title: "Location Layout | TheOutHaven Reserve",
  description: "Business-friendly reservation layout editor for TheOutHaven Reserve.",
};

type PageProps = {
  searchParams?:
    | Promise<Record<string, string | string[] | undefined>>
    | Record<string, string | string[] | undefined>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeType(value?: string) {
  return value === "activity" || value === "activities" ? "activity" : "restaurant";
}

export default async function ReserveDashboardLocationLayoutPage({ searchParams }: PageProps = {}) {
  const params = searchParams ? await searchParams : {};
  const adminLocationId = firstParam(params.adminLocationId);
  const locationId = adminLocationId || firstParam(params.locationId);
  const fromDemoCenter = firstParam(params.fromDemoCenter) === "1";
  const demoMode = firstParam(params.demo) === "1" || fromDemoCenter;
  await requireAdminRole(ADMIN_PAGE_ACCESS.reservationLayouts);

  return (
    <LocationLayoutClient
      backHref={fromDemoCenter ? "/admin/dashboard/settings/demo-center" : "/reserve/dashboard"}
      adminMode={Boolean(adminLocationId || demoMode)}
      initialLocationId={locationId || ""}
      initialLocationType={normalizeType(firstParam(params.type))}
    />
  );
}
