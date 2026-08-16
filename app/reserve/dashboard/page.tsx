import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";

export const metadata: Metadata = {
  title: "Reservations | TheOutHaven Location Workspace",
  description: "Manage bookings, floor flow, guests, waitlist, and reservation setup inside the location workspace.",
};

export const dynamic = "force-dynamic";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;
};

function appendParam(query: URLSearchParams, key: string, value: string | string[] | undefined) {
  if (Array.isArray(value)) value.forEach((item) => query.append(key, item));
  else if (value) query.set(key, value);
}

export default async function ReserveDashboardPage({ searchParams }: Props) {
  await requireAdminRole(ADMIN_PAGE_ACCESS.reservations);
  const params = searchParams ? await searchParams : {};
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => appendParam(query, key, value));
  if (!query.has("tab")) query.set("tab", "today");
  const qs = query.toString();
  redirect(`/locations/dashboard/reservations${qs ? `?${qs}` : ""}`);
}
