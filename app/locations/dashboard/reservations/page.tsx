import Link from "next/link";
import { redirect } from "next/navigation";
import ReserveCommandCenterPage from "@/components/reserve/ReserveCommandCenterPage";
import ReserveOverviewPage from "@/components/reserve/ReserveOverviewPage";
import ReservationDateNavRepair from "@/components/reserve/ReservationDateNavRepair";
import ReservationCommunicationCenter from "@/components/locations/ReservationCommunicationCenter";
import { createClient } from "@/lib/supabase-server";
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

function buildWorkspaceHref(params: Record<string, SearchValue>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "host" || value === undefined) continue;
    if (Array.isArray(value)) value.forEach((item) => query.append(key, item));
    else query.set(key, value);
  }
  const qs = query.toString();
  return `/locations/dashboard/reservations${qs ? `?${qs}` : ""}`;
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
  }

  return (
    <div
      className={`location-workspace-reserve min-w-0 bg-[#050607] text-white ${
        hostMode ? "location-host-mode" : ""
      }`}
    >
      <ReservationDateNavRepair />
      {hostMode ? (
        <div className="sticky top-0 z-[60] flex min-h-12 items-center justify-between gap-3 border-b border-white/10 bg-[#07090d]/95 px-3 py-2 backdrop-blur-xl sm:px-5">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#ff6b86]">
              Host View
            </p>
            <p className="truncate text-sm font-black text-white">
              Full-screen reservation operations
            </p>
          </div>
          <Link
            href={buildWorkspaceHref(rawParams)}
            className="shrink-0 rounded-full border border-white/15 bg-white/[0.06] px-4 py-2 text-xs font-black text-white transition hover:bg-white/[0.1]"
          >
            Exit Host View
          </Link>
        </div>
      ) : null}
      {!hostMode && !parsedDemo.demo ? (
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
