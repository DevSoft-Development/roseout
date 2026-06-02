import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { canAdminViewLocation, requireAdminOrSupport } from "@/lib/admin/admin-access";
import { getReserveAccessForLocation, type ReservationAccess } from "@/lib/reserve-access";

export type AdminActingAsLocationContext = {
  adminLocationId: string;
  location: Record<string, any>;
  locationName: string;
  reservationAccess: ReservationAccess;
};

export function getAdminSelectedLocation(searchParams?: URLSearchParams | Record<string, string | string[] | undefined> | null) {
  if (!searchParams) return "";
  if (searchParams instanceof URLSearchParams) return searchParams.get("adminLocationId") || "";
  const value = searchParams.adminLocationId;
  return Array.isArray(value) ? value[0] || "" : value || "";
}

export function buildAdminLocationScopedUrl(path: string, locationId: string) {
  const url = new URL(path, "https://theouthaven.local");
  url.searchParams.set("adminLocationId", locationId);
  return `${url.pathname}${url.search}`;
}

export function getDisplayLocationName(location: Record<string, any> | null | undefined) {
  return (
    location?.name ||
    location?.restaurant_name ||
    location?.activity_name ||
    location?.business_name ||
    "Unnamed location"
  );
}

export async function getAdminActingAsLocationContext(locationId: string): Promise<AdminActingAsLocationContext | null> {
  if (!locationId) return null;
  const admin = await requireAdminOrSupport();
  if (!canAdminViewLocation(admin, locationId)) return null;

  const { data: location } = await supabaseAdmin.from("locations").select("*").eq("id", locationId).maybeSingle();
  if (!location) return null;

  return {
    adminLocationId: locationId,
    location,
    locationName: getDisplayLocationName(location),
    reservationAccess: await getReserveAccessForLocation(locationId),
  };
}
