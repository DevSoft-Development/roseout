import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";

export const metadata: Metadata = {
  title: "Location Layout | TheOutHaven Reserve",
  description:
    "Business-friendly reservation layout editor for TheOutHaven Reserve.",
};

type PageProps = {
  searchParams?:
    | Promise<Record<string, string | string[] | undefined>>
    | Record<string, string | string[] | undefined>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ReserveDashboardLocationLayoutPage({
  searchParams,
}: PageProps = {}) {
  const params = searchParams ? await searchParams : {};
  await requireAdminRole(ADMIN_PAGE_ACCESS.reservationLayouts);

  const next = new URLSearchParams({ tab: "settings", section: "layout" });
  for (const key of [
    "locationId",
    "adminLocationId",
    "type",
    "demo",
    "fromDemoCenter",
  ] as const) {
    const value = firstParam(params[key]);
    if (value) next.set(key, value);
  }
  redirect(`/reserve/dashboard?${next.toString()}`);
}
