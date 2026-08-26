import { redirect } from "next/navigation";
import ReserveSettingsControlCenter from "@/components/reserve/ReserveSettingsControlCenter";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationOwnerAccess } from "@/lib/auth/locationOwnerAccess";
import {
  parseDemoOwnerParams,
  requireDemoOwnerLocation,
  type DemoSearchParams,
} from "@/lib/demo/owner-context";

export const dynamic = "force-dynamic";

type SearchValue = string | string[] | undefined;

function first(value: SearchValue) {
  return Array.isArray(value) ? value[0] : value;
}

function reservationType(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .includes("activ")
    ? "activity"
    : "restaurant";
}

export default async function ReservationSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<DemoSearchParams>;
}) {
  const params = searchParams ? await searchParams : {};
  const parsedDemo = parseDemoOwnerParams(params);
  const requestedLocationId =
    first(params.adminLocationId) || first(params.locationId) || "";

  let resolvedLocationId = requestedLocationId;
  let location: any = null;

  if (parsedDemo.demo || first(params.fromDemoCenter) === "1") {
    const demoContext = await requireDemoOwnerLocation(params);
    if (!demoContext.locationId || !demoContext.location) {
      redirect("/admin/dashboard/settings/demo-center");
    }
    resolvedLocationId = demoContext.locationId;
    location = demoContext.location;
  } else {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const query = new URLSearchParams();
      if (requestedLocationId) query.set("locationId", requestedLocationId);
      redirect(
        `/login?next=${encodeURIComponent(
          `/locations/dashboard/reservations/settings${
            query.toString() ? `?${query.toString()}` : ""
          }`,
        )}`,
      );
    }

    const access = await getLocationOwnerAccess(user.id, user.email ?? null);
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

    resolvedLocationId =
      requestedLocationId ||
      access.ownedLocationIds[0] ||
      access.ownedSourceLocationIds[0] ||
      "";

    if (!resolvedLocationId) redirect("/locations/dashboard");

    const { data } = await supabaseAdmin
      .from("locations")
      .select(
        "id,name,restaurant_name,activity_name,location_type,type,primary_category,is_demo,demo_key",
      )
      .eq("id", resolvedLocationId)
      .maybeSingle();
    location = data || null;
  }

  const locationType = reservationType(
    first(params.type) ||
      location?.location_type ||
      location?.type ||
      location?.primary_category,
  );
  const locationName =
    location?.name ||
    location?.restaurant_name ||
    location?.activity_name ||
    "TheOutHaven location";

  return (
    <main className="reserve-command-center reserve-theme-dark min-h-screen bg-[#050607] text-white">
      <ReserveSettingsControlCenter
        locationId={resolvedLocationId}
        locationType={locationType}
        locationName={locationName}
        adminLocationId={first(params.adminLocationId) || ""}
        demo={parsedDemo.demo}
        fromDemoCenter={first(params.fromDemoCenter) === "1"}
      />
    </main>
  );
}
