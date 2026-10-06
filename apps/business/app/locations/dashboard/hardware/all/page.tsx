import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import {
  getLocationOwnerAccess,
  hasLocationPermission,
  resolveLocationAccessContext,
} from "@/lib/auth/locationOwnerAccess";
import { getLocationName } from "@/lib/locationName";
import { listLocationHardware } from "@/lib/pos/hardware/device-registry";

export const dynamic = "force-dynamic";

type LocationHardwareSummary = {
  locationId: string;
  locationName: string;
  total: number;
  ready: number;
  attention: number;
  offline: number;
  unavailable: boolean;
};

export default async function AllLocationsHardwarePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/business/login?next=/locations/dashboard/hardware/all");
  }

  const ownerAccess = await getLocationOwnerAccess(user.id, user.email);
  const candidateIds = Array.from(
    new Set([
      ...ownerAccess.ownedLocationIds,
      ...ownerAccess.ownedSourceLocationIds,
    ]),
  ).slice(0, 100);

  const summaries: LocationHardwareSummary[] = [];
  const seenCanonicalIds = new Set<string>();

  for (const candidateId of candidateIds) {
    const access = await resolveLocationAccessContext({
      userId: user.id,
      userEmail: user.email,
      locationId: candidateId,
    });
    if (
      !access.canonicalLocationId ||
      seenCanonicalIds.has(access.canonicalLocationId) ||
      !hasLocationPermission(access, "hardware.view")
    ) {
      continue;
    }

    seenCanonicalIds.add(access.canonicalLocationId);

    try {
      const hardware = await listLocationHardware(access.canonicalLocationId);
      summaries.push({
        locationId: access.canonicalLocationId,
        locationName: getLocationName(access.location || {}, "Location"),
        total: hardware.length,
        ready: hardware.filter((item) => item.device.health_status === "ready").length,
        attention: hardware.filter((item) =>
          ["paper_out", "cover_open", "error", "degraded"].includes(
            item.device.health_status,
          ),
        ).length,
        offline: hardware.filter((item) => item.device.health_status === "offline").length,
        unavailable: false,
      });
    } catch {
      summaries.push({
        locationId: access.canonicalLocationId,
        locationName: getLocationName(access.location || {}, "Location"),
        total: 0,
        ready: 0,
        attention: 0,
        offline: 0,
        unavailable: true,
      });
    }
  }

  summaries.sort((a, b) => a.locationName.localeCompare(b.locationName));

  const totals = summaries.reduce(
    (acc, location) => {
      acc.devices += location.total;
      acc.ready += location.ready;
      acc.attention += location.attention;
      acc.offline += location.offline;
      return acc;
    },
    { devices: 0, ready: 0, attention: 0, offline: 0 },
  );

  return (
    <main className="min-h-screen bg-[var(--business-bg)] px-4 py-8 text-[var(--business-text)] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <Link
          href="/locations/dashboard/hardware"
          className="text-sm font-black text-[var(--business-muted)] hover:text-[var(--business-text)]"
        >
          ← Hardware & POS
        </Link>

        <header className="mt-5">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#ff6b86]">
            All Locations
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-4xl">
            Hardware across your business
          </h1>
          <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-[var(--business-muted)]">
            See which locations are ready and which need attention without opening each location individually.
          </p>
        </header>

        <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Devices", totals.devices, "Across all locations"],
            ["Ready", totals.ready, "Working normally"],
            ["Needs attention", totals.attention, "Paper, cover, or device issue"],
            ["Offline", totals.offline, "Automatic reconnect in progress"],
          ].map(([label, value, note]) => (
            <div
              key={label}
              className="rounded-[1.25rem] border border-[var(--business-border)] bg-[var(--business-panel)] p-5"
            >
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--business-muted)]">
                {label}
              </p>
              <p className="mt-2 text-3xl font-black">{value}</p>
              <p className="mt-1 text-xs font-semibold text-[var(--business-muted)]">{note}</p>
            </div>
          ))}
        </section>

        <section className="mt-6 space-y-3">
          {summaries.length ? (
            summaries.map((location) => (
              <Link
                key={location.locationId}
                href={`/locations/dashboard/hardware?locationId=${encodeURIComponent(location.locationId)}`}
                className="grid gap-4 rounded-[1.35rem] border border-[var(--business-border)] bg-[var(--business-panel)] p-5 transition hover:border-[#ff2142]/35 md:grid-cols-[minmax(0,1fr)_repeat(4,minmax(90px,auto))] md:items-center"
              >
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-black">{location.locationName}</h2>
                  <p className="mt-1 text-xs font-semibold text-[var(--business-muted)]">
                    {location.unavailable ? "Status temporarily unavailable" : "Open location hardware"}
                  </p>
                </div>
                {[
                  ["Devices", location.total],
                  ["Ready", location.ready],
                  ["Attention", location.attention],
                  ["Offline", location.offline],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-black/15 px-3 py-2">
                    <p className="text-[9px] font-black uppercase tracking-[0.12em] text-[var(--business-muted)]">{label}</p>
                    <p className="mt-1 text-lg font-black">{value}</p>
                  </div>
                ))}
              </Link>
            ))
          ) : (
            <div className="rounded-[1.5rem] border border-dashed border-[var(--business-border)] bg-[var(--business-panel)] p-8 text-center">
              <h2 className="text-2xl font-black">No managed locations found.</h2>
              <p className="mt-2 text-sm font-semibold text-[var(--business-muted)]">
                Locations you own or manage will appear here automatically.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
