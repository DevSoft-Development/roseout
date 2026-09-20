import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import ReserveCommandCenterPage from "@/components/reserve/ReserveCommandCenterPage";
import ReserveOverviewPage from "@/components/reserve/ReserveOverviewPage";
import ReservationDateNavRepair from "@/components/reserve/ReservationDateNavRepair";
import ReservationCommunicationCenter from "@/components/locations/ReservationCommunicationCenter";
import { createClient } from "@/lib/supabase-server";
import { getLocationOwnerAccess } from "@/lib/auth/locationOwnerAccess";
import { ADMIN_DEMO_HANDOFF_COOKIE } from "@theouthaven/auth/admin-demo-handoff";
import { signBusinessReserveHandoff } from "@theouthaven/auth/business-reserve-handoff";
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

function buildSettingsHref(params: Record<string, SearchValue>) {
  const query = new URLSearchParams();
  const legacySection = first(params.section) || "";
  const sectionMap: Record<string, string> = {
    layout: "layout",
    hours: "hours",
    reminders: "reminders",
    deposits: "policies",
    booking: "distribution",
    embed: "distribution",
    qr: "qr",
    team: "team",
  };

  for (const [key, value] of Object.entries(params)) {
    if (["tab", "section", "host"].includes(key) || value === undefined) continue;
    if (Array.isArray(value)) value.forEach((item) => query.append(key, item));
    else query.set(key, value);
  }
  if (sectionMap[legacySection]) query.set("section", sectionMap[legacySection]);

  const qs = query.toString();
  return `/locations/dashboard/reservations/settings${qs ? `?${qs}` : ""}`;
}

export default async function LocationWorkspaceReservationsPage({
  searchParams,
}: {
  searchParams?: Promise<DemoSearchParams>;
}) {
  const params = searchParams ? await searchParams : {};
  const rawParams = params as Record<string, SearchValue>;

  if (first(rawParams.tab) === "settings") {
    redirect(buildSettingsHref(rawParams));
  }

  const parsedDemo = parseDemoOwnerParams(params);
  const hostMode = first(rawParams.host) === "1";
  const requestedTab = first(rawParams.tab) || "";
  const showOverview = !hostMode && (!requestedTab || requestedTab === "overview");
  const selectedLocationId =
    first(params.adminLocationId) || first(params.locationId) || "";
  const reserveOrigin = String(
    process.env.NEXT_PUBLIC_RESERVE_SITE_URL ||
      process.env.RESERVE_SITE_URL ||
      "https://reserve.theouthaven.com",
  ).replace(/\/$/, "");

  if (parsedDemo.demo || first(params.fromDemoCenter) === "1") {
    await requireDemoOwnerLocation(params);

    if (hostMode && selectedLocationId) {
      const query = new URLSearchParams({
        adminLocationId: selectedLocationId,
        locationId: selectedLocationId,
        demo: "1",
        fromDemoCenter: "1",
      });
      const destination = `/reserve/dashboard?${query.toString()}`;
      const cookieStore = await cookies();
      const adminDemoToken = cookieStore.get(ADMIN_DEMO_HANDOFF_COOKIE)?.value;

      if (adminDemoToken) {
        redirect(
          `${reserveOrigin}/api/internal/admin-demo-handoff?token=${encodeURIComponent(
            adminDemoToken,
          )}&next=${encodeURIComponent(destination)}`,
        );
      }

      redirect(`${reserveOrigin}${destination}`);
    }
  } else {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login?next=/locations/dashboard/reservations");
    }

    const access = await getLocationOwnerAccess(user.id, user.email ?? null);

    if (
      selectedLocationId &&
      !access.isAdmin &&
      !access.ownedLocationIds.includes(selectedLocationId) &&
      !access.ownedSourceLocationIds.includes(selectedLocationId)
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

    if (hostMode) {
      const handoffLocationId =
        selectedLocationId ||
        access.ownedLocationIds[0] ||
        access.ownedSourceLocationIds[0] ||
        "";

      if (!handoffLocationId) {
        redirect("/locations/dashboard");
      }

      const token = signBusinessReserveHandoff({
        userId: user.id,
        email: user.email ?? null,
        locationId: handoffLocationId,
      });
      const query = new URLSearchParams({ locationId: handoffLocationId });
      const destination = `/reserve/dashboard?${query.toString()}`;

      redirect(
        `${reserveOrigin}/api/internal/business-reserve-handoff?token=${encodeURIComponent(
          token,
        )}&next=${encodeURIComponent(destination)}`,
      );
    }
  }

  return (
    <div className="location-workspace-reserve min-w-0 bg-[#050607] text-white">
      <ReservationDateNavRepair />
      {!parsedDemo.demo ? (
        <div className="px-4 pt-5 sm:px-6 lg:px-8">
          <ReservationCommunicationCenter
            locationId={selectedLocationId || null}
          />
        </div>
      ) : null}
      {showOverview ? <ReserveOverviewPage /> : <ReserveCommandCenterPage />}
    </div>
  );
}
