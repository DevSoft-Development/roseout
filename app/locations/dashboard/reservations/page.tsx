import { redirect } from "next/navigation";
import ReserveCommandCenterPage from "@/components/reserve/ReserveCommandCenterPage";
import { createClient } from "@/lib/supabase-server";
import { getLocationOwnerAccess } from "@/lib/auth/locationOwnerAccess";
import {
  parseDemoOwnerParams,
  requireDemoOwnerLocation,
  type DemoSearchParams,
} from "@/lib/demo/owner-context";

export const dynamic = "force-dynamic";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LocationWorkspaceReservationsPage({
  searchParams,
}: {
  searchParams?: Promise<DemoSearchParams>;
}) {
  const params = searchParams ? await searchParams : {};
  const parsedDemo = parseDemoOwnerParams(params);

  if (parsedDemo.demo || first(params.fromDemoCenter) === "1") {
    await requireDemoOwnerLocation(params);
  } else {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login?next=/locations/dashboard/reservations");
    }

    const access = await getLocationOwnerAccess(user.id, user.email ?? null);
    const requestedLocationId =
      first(params.adminLocationId) || first(params.locationId) || "";

    if (
      requestedLocationId &&
      !access.isAdmin &&
      !access.ownedLocationIds.includes(requestedLocationId) &&
      !access.ownedSourceLocationIds.includes(requestedLocationId)
    ) {
      redirect("/locations/dashboard");
    }

    if (
      !access.isAdmin &&
      access.ownedLocationIds.length === 0 &&
      access.ownedSourceLocationIds.length === 0
    ) {
      redirect("/create");
    }
  }

  return (
    <div className="location-workspace-reserve min-w-0 bg-[#050607] text-white">
      <ReserveCommandCenterPage />
    </div>
  );
}
