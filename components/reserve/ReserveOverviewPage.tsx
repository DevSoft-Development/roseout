"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, RefreshCw, UsersRound } from "lucide-react";
import ReserveCommandCenterShell from "./ReserveCommandCenterShell";
import ReserveMetricCard from "./ReserveMetricCard";
import ReserveFloorSnapshot from "./ReserveFloorSnapshot";
import ReserveWaitlistPanel from "./ReserveWaitlistPanel";
import ReserveStatusBadge from "./ReserveStatusBadge";
import ReserveEmptyState from "./ReserveEmptyState";
import {
  formatReservationTime,
  getReservationGuestName,
} from "@/lib/reservations/ui";
import { formatShortDate } from "@/lib/reservations/reservationFormatting";
import { getAssignedReservationResourceLabel } from "@/lib/reservations/floorSnapshot";
import { getReserveDashboardUrl } from "@/lib/reservations/reserveLinks";
import { getReserveVocabulary } from "@/lib/reservations/reserveVocabulary";
import { getTodayLocalDate } from "@/lib/reservations/timeSlots";

type OverviewMetrics = {
  reservations: number;
  guests: number;
  needsAction: number;
  seatedNow: number;
  trailingReservations: number;
  trailingGuests: number;
  noShowRate: number;
  cancellationRate: number;
  futureReservations: number;
  futureGuests: number;
};

type OverviewPayload = {
  locationId?: string;
  locationName?: string;
  locationType?: string;
  selectedDate?: string;
  metrics?: OverviewMetrics;
  range?: { trailingStart?: string; futureEnd?: string };
};

const emptyMetrics: OverviewMetrics = {
  reservations: 0,
  guests: 0,
  needsAction: 0,
  seatedNow: 0,
  trailingReservations: 0,
  trailingGuests: 0,
  noShowRate: 0,
  cancellationRate: 0,
  futureReservations: 0,
  futureGuests: 0,
};

function normalizeType(value: unknown) {
  const type = String(value || "").toLowerCase();
  return type === "activities" ? "activity" : type || "restaurant";
}

function hostViewHref({
  locationId,
  adminLocationId,
  locationType,
  selectedDate,
  demo,
  fromDemoCenter,
}: {
  locationId: string;
  adminLocationId: string;
  locationType: string;
  selectedDate: string;
  demo?: string;
  fromDemoCenter?: string;
}) {
  const query = new URLSearchParams({ tab: "today", host: "1", date: selectedDate });
  if (adminLocationId) query.set("adminLocationId", adminLocationId);
  else if (locationId) query.set("locationId", locationId);
  if (locationType) query.set("type", locationType);
  if (demo) query.set("demo", demo);
  if (fromDemoCenter) query.set("fromDemoCenter", fromDemoCenter);
  return `/locations/dashboard/reservations?${query.toString()}`;
}

export default function ReserveOverviewPage() {
  return (
    <Suspense
      fallback={
        <main className="reserve-command-center reserve-theme-dark min-h-screen p-8 text-sm font-bold reserve-muted">
          Loading reservation overview…
        </main>
      }
    >
      <ReserveOverviewContent />
    </Suspense>
  );
}

function ReserveOverviewContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const adminLocationId = searchParams.get("adminLocationId") || "";
  const requestedLocationId = searchParams.get("locationId") || "";
  const locationId = adminLocationId || requestedLocationId;
  const suppliedType = normalizeType(searchParams.get("type"));
  const selectedDate =
    searchParams.get("date") || getTodayLocalDate("America/New_York");
  const demo = searchParams.get("demo") || undefined;
  const fromDemoCenter = searchParams.get("fromDemoCenter") || undefined;

  const [overview, setOverview] = useState<OverviewPayload>({});
  const [reservations, setReservations] = useState<any[]>([]);
  const [resources, setResources] = useState<any[]>([]);
  const [waitlist, setWaitlist] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const resolvedLocationId = overview.locationId || locationId;
  const locationType = normalizeType(overview.locationType || suppliedType);
  const locationName = overview.locationName || "Reservation overview";
  const metrics = overview.metrics || emptyMetrics;
  const vocab = getReserveVocabulary(
    locationType,
    resources[0]?.item_type || resources[0]?.type,
  );

  const context = useMemo(
    () => ({
      adminLocationId: adminLocationId || undefined,
      locationId: !adminLocationId ? resolvedLocationId || undefined : undefined,
      type: locationType || undefined,
      date: selectedDate,
      demo,
      fromDemoCenter,
    }),
    [
      adminLocationId,
      resolvedLocationId,
      locationType,
      selectedDate,
      demo,
      fromDemoCenter,
    ],
  );

  function dashboardHref(tab: string) {
    return getReserveDashboardUrl(tab, undefined, context);
  }

  function settingsHref(section?: string) {
    return getReserveDashboardUrl("settings", section, context);
  }

  function switchTab(tab: string) {
    router.replace(dashboardHref(tab), { scroll: false });
  }

  async function load() {
    if (!locationId) {
      setLoading(false);
      setError("Choose a location to view reservation performance.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const common = new URLSearchParams({
        locationId,
        date: selectedDate,
      });
      if (adminLocationId) common.set("adminLocationId", adminLocationId);
      if (suppliedType) common.set("type", suppliedType);

      const reservationsQuery = new URLSearchParams(common);
      reservationsQuery.set("filter", "date");

      const [overviewResponse, reservationsResponse, resourcesResponse, waitlistResponse] =
        await Promise.all([
          fetch(`/api/reserve/portal/overview?${common.toString()}`, {
            cache: "no-store",
          }),
          fetch(`/api/reserve/portal/reservations?${reservationsQuery.toString()}`, {
            cache: "no-store",
          }),
          fetch(`/api/reserve/portal/resources?${common.toString()}`, {
            cache: "no-store",
          }),
          fetch(`/api/reserve/portal/waitlist?${common.toString()}`, {
            cache: "no-store",
          }),
        ]);

      const [overviewData, reservationData, resourceData, waitlistData] =
        await Promise.all([
          overviewResponse.json(),
          reservationsResponse.json(),
          resourcesResponse.json(),
          waitlistResponse.json(),
        ]);

      if (!overviewResponse.ok) {
        throw new Error(overviewData.error || "We could not load reservation KPIs.");
      }
      if (!reservationsResponse.ok) {
        throw new Error(
          reservationData.error || "We could not load today's reservations.",
        );
      }

      setOverview(overviewData || {});
      setReservations(reservationData.reservations || []);
      setResources(resourcesResponse.ok ? resourceData.resources || [] : []);
      setWaitlist(waitlistResponse.ok ? waitlistData.waitlist || [] : []);
      setLastUpdated(new Date());
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "We could not load the reservation overview.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId, selectedDate, adminLocationId, suppliedType]);

  const activeReservations = reservations.filter(
    (reservation) =>
      !["cancelled", "declined"].includes(
        String(reservation.status || "").toLowerCase(),
      ),
  );
  const upcomingService = [...activeReservations]
    .sort((a, b) =>
      String(a.reservation_time || "").localeCompare(
        String(b.reservation_time || ""),
      ),
    )
    .slice(0, 8);

  const hostHref = hostViewHref({
    locationId: resolvedLocationId,
    adminLocationId,
    locationType,
    selectedDate,
    demo,
    fromDemoCenter,
  });

  return (
    <ReserveCommandCenterShell
      locationName={locationName}
      locationId={resolvedLocationId}
      locationType={locationType}
      activeTab="overview"
      activeSection=""
      onTabChange={switchTab}
      setupEnabled={Boolean(resolvedLocationId && (resources.length || reservations.length))}
      userLabel={adminLocationId ? "Admin access" : "Owner access"}
      actingContext={{
        adminLocationId: adminLocationId || undefined,
        type: locationType || undefined,
      }}
      actions={
        <>
          <Link
            href={hostHref}
            className="reserve-primary inline-flex h-10 items-center gap-2 rounded-full px-4 text-xs font-black"
          >
            Open Host View <ArrowRight size={14} />
          </Link>
          <button
            type="button"
            onClick={() => void load()}
            className="reserve-soft inline-flex h-10 items-center gap-2 rounded-full px-4 text-xs font-black"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </>
      }
    >
      <section className="mb-4 overflow-hidden rounded-[1.75rem] border border-[var(--reserve-border)] bg-[var(--reserve-panel)] shadow-[0_18px_60px_rgba(0,0,0,.18)]">
        <div className="bg-[radial-gradient(circle_at_top_right,rgba(225,6,42,.16),transparent_42%)] p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--reserve-primary)]">
                Owner & manager view
              </p>
              <h2 className="mt-1 text-2xl font-black sm:text-3xl">
                Reservation overview
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 reserve-muted">
                See reservation performance and the live service picture together. Use Host View when your team needs the full shift workflow.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs reserve-muted">
              <span className="reserve-soft rounded-full px-3 py-2 font-black">
                {formatShortDate(new Date(`${selectedDate}T12:00:00`))}
              </span>
              <span>
                {lastUpdated ? "Updated just now" : loading ? "Loading…" : "Ready"}
              </span>
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <div className="mb-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm font-bold text-red-100">
          {error}
        </div>
      ) : null}

      <section className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ReserveMetricCard
          label="Reservations"
          value={metrics.reservations}
          hint="Selected day"
          onClick={() => switchTab("today")}
        />
        <ReserveMetricCard
          label="Guests"
          value={metrics.guests}
          hint="Expected guests"
          onClick={() => switchTab("today")}
        />
        <ReserveMetricCard
          label="Needs action"
          value={metrics.needsAction}
          hint="Confirm or prepare"
          onClick={() => switchTab("today")}
        />
        <ReserveMetricCard
          label="Waitlist"
          value={waitlist.length}
          hint="Parties waiting"
          onClick={() => switchTab("waitlist")}
        />
        <ReserveMetricCard
          label="30-day reservations"
          value={metrics.trailingReservations}
          hint="Through selected day"
        />
        <ReserveMetricCard
          label="30-day guests"
          value={metrics.trailingGuests}
          hint="Reserved covers"
        />
        <ReserveMetricCard
          label="No-show rate"
          value={`${metrics.noShowRate}%`}
          hint="Completed + no-show outcomes"
        />
        <ReserveMetricCard
          label="Next 30 days"
          value={metrics.futureReservations}
          hint={`${metrics.futureGuests} expected guests`}
          onClick={() => switchTab("calendar")}
        />
      </section>

      <section className="mb-4 grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(330px,.75fr)]">
        <ReserveFloorSnapshot
          vocabulary={vocab}
          resources={resources}
          reservations={reservations}
          settingsHref={settingsHref("layout")}
          onReservationSelect={() => switchTab("today")}
        />
        <ReserveWaitlistPanel
          vocabulary={vocab}
          entries={waitlist}
          onViewAll={() => switchTab("waitlist")}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,.7fr)]">
        <div className="reserve-card rounded-2xl p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black">Today’s service</h2>
              <p className="mt-1 text-xs reserve-muted">
                A quick view of the next reservations your host team is working from.
              </p>
            </div>
            <Link
              href={dashboardHref("today")}
              className="text-xs font-black text-[var(--reserve-primary)]"
            >
              Open Today
            </Link>
          </div>

          {loading ? (
            <div className="mt-4">
              <ReserveEmptyState
                title="Loading service…"
                message="We’re checking the latest reservation list."
              />
            </div>
          ) : upcomingService.length ? (
            <div className="mt-4 divide-y divide-[var(--reserve-border)]">
              {upcomingService.map((reservation) => {
                const assigned = getAssignedReservationResourceLabel(reservation);
                return (
                  <Link
                    key={reservation.id}
                    href={dashboardHref("today")}
                    className="grid gap-2 py-3 transition hover:bg-white/[0.025] sm:grid-cols-[90px_minmax(0,1fr)_100px_150px] sm:items-center sm:px-2"
                  >
                    <p className="text-sm font-black text-[var(--reserve-primary)]">
                      {formatReservationTime(reservation.reservation_time)}
                    </p>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black">
                        {getReservationGuestName(reservation)}
                      </p>
                      <p className="truncate text-xs reserve-muted">
                        {assigned || `Any ${vocab.resource.toLowerCase()}`}
                      </p>
                    </div>
                    <p className="inline-flex items-center gap-1 text-xs font-bold reserve-muted">
                      <UsersRound size={13} /> {reservation.party_size || 1}
                    </p>
                    <ReserveStatusBadge status={reservation.status} />
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="mt-4">
              <ReserveEmptyState
                title="No reservations for this day"
                message="New reservations will appear here automatically."
              />
            </div>
          )}
        </div>

        <div className="reserve-card rounded-2xl p-4">
          <h2 className="text-lg font-black">Performance snapshot</h2>
          <p className="mt-1 text-xs leading-5 reserve-muted">
            Operational rates use the 30-day period ending on the selected day.
          </p>
          <div className="mt-4 space-y-3">
            <div className="reserve-soft rounded-xl p-3">
              <p className="text-xs font-black uppercase tracking-[0.12em] reserve-muted">
                Cancellation rate
              </p>
              <p className="mt-1 text-2xl font-black">
                {metrics.cancellationRate}%
              </p>
            </div>
            <div className="reserve-soft rounded-xl p-3">
              <p className="text-xs font-black uppercase tracking-[0.12em] reserve-muted">
                Seated now
              </p>
              <p className="mt-1 text-2xl font-black">{metrics.seatedNow}</p>
            </div>
            <div className="reserve-soft rounded-xl p-3">
              <p className="text-xs font-black uppercase tracking-[0.12em] reserve-muted">
                Future guests
              </p>
              <p className="mt-1 text-2xl font-black">{metrics.futureGuests}</p>
              <p className="mt-1 text-xs reserve-muted">Next 30 days</p>
            </div>
          </div>
        </div>
      </section>
    </ReserveCommandCenterShell>
  );
}
