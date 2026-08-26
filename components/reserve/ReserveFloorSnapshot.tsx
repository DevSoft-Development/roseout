"use client";

import Link from "next/link";
import {
  formatReservationTime,
  getReservationGuestName,
} from "@/lib/reservations/ui";
import {
  dedupeFloorResources,
  getFloorSnapshotState,
  resourceCapacity,
  resourceName,
} from "@/lib/reservations/floorSnapshot";
import {
  getReserveVocabulary,
  type ReserveVocabulary,
} from "@/lib/reservations/reserveVocabulary";

const statusStyles: Record<string, string> = {
  Open: "border-emerald-400/40 bg-emerald-500/10 text-emerald-300",
  "Reserved soon": "border-white/15 bg-white/[0.045] text-white/70",
  "Due now": "border-[#e1062a]/45 bg-[#e1062a]/12 text-[#ff8aa0]",
  Pending: "border-[#e1062a]/35 bg-[#e1062a]/10 text-[#ff8aa0]",
  Waiting: "border-[#e1062a]/35 bg-[#e1062a]/10 text-[#ff8aa0]",
  "Ready sent": "border-[#e1062a]/35 bg-[#e1062a]/10 text-[#ff8aa0]",
  Seated: "border-emerald-400/30 bg-emerald-500/[0.08] text-emerald-200",
  Blocked: "border-red-400/45 bg-red-500/10 text-red-300",
  Closed: "border-white/10 bg-white/[0.02] text-white/35",
};

const floorLegend = [
  { label: "Available now", className: statusStyles.Open },
  { label: "Reserved soon", className: statusStyles["Reserved soon"] },
  { label: "Waiting / ready", className: statusStyles.Waiting },
  { label: "In use", className: statusStyles.Seated },
  { label: "Unavailable", className: statusStyles.Blocked },
];

function normalizedType(resource: any) {
  return String(resource?.item_type || resource?.type || "")
    .toLowerCase()
    .replaceAll(" ", "_");
}

function isBarResource(resource: any) {
  return ["bar", "bar_seat", "counter", "counter_seat"].includes(
    normalizedType(resource),
  );
}

function resourceTurnMinutes(resource: any) {
  const value = Number(
    resource?.slot_duration_minutes ||
      resource?.duration_minutes ||
      resource?.default_duration_minutes ||
      resource?.reservation_duration_minutes ||
      resource?.turn_time_minutes ||
      90,
  );
  return Number.isFinite(value) && value > 0 ? value : 90;
}

function reservationStartMs(reservation: any) {
  const date = String(reservation?.reservation_date || "").trim();
  const time = String(reservation?.reservation_time || "").trim().slice(0, 5);
  if (!date || !time) return Number.NaN;
  const timestamp = new Date(`${date}T${time}:00`).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.NaN;
}

function operationalState(resource: any, reservations: any[], now = Date.now()) {
  const state = getFloorSnapshotState(resource, reservations);
  const reservation = state.reservation;
  const rawStatus = String(reservation?.status || "").toLowerCase();

  if (
    !reservation ||
    ["Seated", "Waiting", "Ready sent", "Pending", "Blocked", "Closed"].includes(
      state.status,
    )
  ) {
    return {
      ...state,
      displayStatus:
        state.status === "Open"
          ? "Available now"
          : state.status === "Ready sent"
            ? "Ready"
            : state.status,
      styleStatus: state.status,
      availableNow: state.available,
      upcomingOnly: false,
      conflictWindow: false,
    };
  }

  if (rawStatus !== "confirmed" && rawStatus !== "reserved") {
    return {
      ...state,
      displayStatus: state.status,
      styleStatus: state.status,
      availableNow: state.available,
      upcomingOnly: false,
      conflictWindow: false,
    };
  }

  const startMs = reservationStartMs(reservation);
  if (!Number.isFinite(startMs)) {
    return {
      ...state,
      displayStatus: "Reserved soon",
      styleStatus: "Reserved soon",
      availableNow: false,
      upcomingOnly: false,
      conflictWindow: true,
    };
  }

  const turnMinutes = resourceTurnMinutes(resource);
  const minutesUntil = Math.ceil((startMs - now) / 60_000);
  const endMs = startMs + turnMinutes * 60_000;

  if (startMs > now && minutesUntil > turnMinutes) {
    return {
      ...state,
      displayStatus: "Available now",
      styleStatus: "Open",
      availableNow: true,
      upcomingOnly: true,
      conflictWindow: false,
      minutesUntil,
      turnMinutes,
    };
  }

  if (startMs > now) {
    return {
      ...state,
      displayStatus: "Reserved soon",
      styleStatus: "Reserved soon",
      availableNow: false,
      upcomingOnly: false,
      conflictWindow: true,
      minutesUntil,
      turnMinutes,
    };
  }

  if (now <= endMs) {
    return {
      ...state,
      displayStatus: "Due now",
      styleStatus: "Due now",
      availableNow: false,
      upcomingOnly: false,
      conflictWindow: true,
      minutesUntil: 0,
      turnMinutes,
    };
  }

  return {
    ...state,
    displayStatus: "Available now",
    styleStatus: "Open",
    availableNow: true,
    upcomingOnly: false,
    conflictWindow: false,
    turnMinutes,
  };
}

function futureReservationNote(state: ReturnType<typeof operationalState>) {
  if (!state.reservation?.reservation_time) return null;
  const formatted = formatReservationTime(state.reservation.reservation_time);
  if (state.upcomingOnly) return `Next reservation · ${formatted}`;
  if (state.displayStatus === "Reserved soon") return `Reserved soon · ${formatted}`;
  if (state.displayStatus === "Due now") return `Reservation due · ${formatted}`;
  return null;
}

function chairStyle(index: number, capacity: number) {
  const side = index % 4;
  const positionIndex = Math.floor(index / 4);
  const countOnSide = Math.ceil(Math.max(0, capacity - side) / 4);
  const pct = `${((positionIndex + 1) / (countOnSide + 1)) * 100}%`;

  if (side === 0)
    return { left: pct, top: "2px", transform: "translate(-50%, -50%)" };
  if (side === 1)
    return { right: "2px", top: pct, transform: "translate(50%, -50%)" };
  if (side === 2)
    return { left: pct, bottom: "2px", transform: "translate(-50%, 50%)" };
  return { left: "2px", top: pct, transform: "translate(-50%, -50%)" };
}

function TableDiagram({
  name,
  capacity,
  status,
}: {
  name: string;
  capacity: number;
  status: string;
}) {
  const chairSize =
    capacity <= 8 ? "h-2.5 w-2.5" : capacity <= 12 ? "h-2 w-2" : "h-1.5 w-1.5";

  return (
    <div
      className="relative mx-auto h-[76px] w-[104px]"
      aria-label={`${name}, ${capacity || 0} seats`}
    >
      {Array.from({ length: capacity }).map((_, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={`absolute rounded-[3px] border border-current/45 bg-current/30 ${chairSize}`}
          style={chairStyle(index, capacity)}
        />
      ))}
      <div className="absolute inset-x-[18px] inset-y-[16px] flex flex-col items-center justify-center rounded-xl border border-current/45 bg-black/35 px-1 shadow-inner">
        <span className="max-w-full truncate text-[11px] font-black text-white">
          {name}
        </span>
        <span className="mt-0.5 text-[9px] font-black uppercase tracking-[0.08em] opacity-85">
          {status}
        </span>
      </div>
    </div>
  );
}

function BarDiagram({
  resource,
  reservations,
  assigningReservation,
  onReservationSelect,
  onResourceSelect,
}: {
  resource: any;
  reservations: any[];
  assigningReservation?: any;
  onReservationSelect?: (reservation: any) => void;
  onResourceSelect?: (resource: any) => void;
}) {
  const capacity = Math.max(1, resourceCapacity(resource) || 1);
  const name = resourceName(resource);
  const type = normalizedType(resource).startsWith("counter")
    ? "counter_seat"
    : "bar_seat";

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/20 p-3 sm:p-4">
      <div className="min-w-[520px]">
        <div className="relative mx-auto max-w-5xl">
          <div className="h-5 rounded-t-[28px] border border-white/15 border-b-white/5 bg-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]" />
          <div className="flex min-h-[78px] items-center justify-center border-x border-white/10 bg-gradient-to-b from-white/[0.055] to-white/[0.025] px-6 text-center shadow-inner">
            <div>
              <p className="text-sm font-black tracking-wide text-white">{name}</p>
              <p className="mt-1 text-[10px] font-black uppercase tracking-[0.18em] reserve-muted">
                Bar · {capacity} seats
              </p>
            </div>
          </div>
          <div className="h-3 rounded-b-xl border border-t-0 border-white/10 bg-white/[0.035]" />

          <div
            className="-mt-1 grid gap-2 px-5 pt-1"
            style={{ gridTemplateColumns: `repeat(${capacity}, minmax(38px, 1fr))` }}
            aria-label={`${name}, ${capacity} individual bar seats`}
          >
            {Array.from({ length: capacity }).map((_, index) => {
              const seatNumber = index + 1;
              const seatLabel = `${name} Seat ${seatNumber}`;
              const synthetic = {
                item_name: seatLabel,
                item_type: type,
                capacity: 1,
                capacity_max: 1,
                location_id: resource.location_id,
                slot_duration_minutes: resource.slot_duration_minutes,
                duration_minutes: resource.duration_minutes,
                default_duration_minutes: resource.default_duration_minutes,
                reservation_duration_minutes: resource.reservation_duration_minutes,
                turn_time_minutes: resource.turn_time_minutes,
              };
              const state = operationalState(synthetic, reservations);
              const note = futureReservationNote(state);
              const disabled = Boolean(assigningReservation && !state.availableNow);

              return (
                <button
                  key={seatLabel}
                  type="button"
                  disabled={disabled}
                  title={`${seatLabel} · ${state.displayStatus}${note ? ` · ${note}` : ""}`}
                  onClick={() =>
                    state.availableNow
                      ? onResourceSelect?.(synthetic)
                      : state.reservation
                        ? onReservationSelect?.(state.reservation)
                        : onResourceSelect?.(synthetic)
                  }
                  className={`group relative flex min-h-[66px] flex-col items-center justify-start pt-1 transition disabled:cursor-not-allowed disabled:opacity-45 ${
                    assigningReservation && state.availableNow
                      ? "rounded-xl ring-2 ring-emerald-500/55"
                      : ""
                  }`}
                >
                  {note ? (
                    <span
                      role="tooltip"
                      className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-30 hidden w-max max-w-[180px] -translate-x-1/2 rounded-lg border border-white/15 bg-black/95 px-2.5 py-1.5 text-center text-[10px] font-bold normal-case tracking-normal text-white shadow-xl group-hover:block group-focus-visible:block"
                    >
                      {note}
                    </span>
                  ) : null}
                  <span className="h-4 w-1 rounded-full bg-white/20" aria-hidden="true" />
                  <span
                    className={`grid h-8 w-8 place-items-center rounded-full border text-[10px] font-black shadow-md ${
                      statusStyles[state.styleStatus] || statusStyles.Open
                    }`}
                  >
                    {seatNumber}
                  </span>
                  <span className="mt-1 max-w-[64px] truncate text-[8px] font-black uppercase tracking-[0.05em] opacity-80">
                    {state.displayStatus}
                  </span>
                  {note ? (
                    <span className="mt-0.5 max-w-[78px] truncate text-[8px] font-bold opacity-65">
                      Upcoming
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <p className="mt-2 text-center text-[9px] reserve-muted">
        An upcoming reservation only makes a seat unavailable when using it now would overlap the next booking.
      </p>
    </div>
  );
}

function TableFloor({
  resources,
  reservations,
  assigningReservation,
  vocabulary,
  onReservationSelect,
  onResourceSelect,
}: {
  resources: any[];
  reservations: any[];
  assigningReservation?: any;
  vocabulary: ReserveVocabulary;
  onReservationSelect?: (reservation: any) => void;
  onResourceSelect?: (resource: any) => void;
}) {
  if (!resources.length) return null;
  const scrollingClass =
    resources.length > 12
      ? "max-h-[min(58vh,520px)] overflow-y-auto overscroll-contain pr-1"
      : "";

  return (
    <div className="mt-5 border-t border-white/10 pt-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/45">
            {vocabulary.resourcePlural}
          </p>
          <p className="mt-1 text-xs reserve-muted">
            Live availability for each {vocabulary.resource.toLowerCase()} you can assign to a reservation.
          </p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-black text-white/55">
          {resources.length}
        </span>
      </div>
      <div className={scrollingClass}>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(116px,1fr))] gap-2.5">
          {resources.map((r) => {
            const state = operationalState(r, reservations);
            const disabled = Boolean(assigningReservation && !state.availableNow);
            const capacity = Math.max(0, resourceCapacity(r) || 0);
            const name = resourceName(r);
            const note = futureReservationNote(state);

            return (
              <button
                type="button"
                key={r.id || r.layout_item_id || name}
                disabled={disabled}
                title={note || undefined}
                onClick={() =>
                  state.availableNow
                    ? onResourceSelect?.(r)
                    : state.reservation
                      ? onReservationSelect?.(state.reservation)
                      : onResourceSelect?.(r)
                }
                className={`group relative min-w-0 rounded-xl border px-2 py-2 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                  statusStyles[state.styleStatus] || statusStyles.Open
                } ${
                  assigningReservation && state.availableNow
                    ? "ring-2 ring-emerald-500/55"
                    : ""
                }`}
              >
                {note ? (
                  <span
                    role="tooltip"
                    className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-30 hidden w-max max-w-[220px] -translate-x-1/2 rounded-lg border border-white/15 bg-black/95 px-2.5 py-1.5 text-[10px] font-bold text-white shadow-xl group-hover:block group-focus-visible:block"
                  >
                    {note}
                  </span>
                ) : null}
                <TableDiagram name={name} capacity={capacity} status={state.displayStatus} />
                {state.reservation && !state.availableNow ? (
                  <div className="mt-1 min-w-0 border-t border-current/10 pt-1.5">
                    <p className="truncate text-[11px] font-bold text-white">
                      {getReservationGuestName(state.reservation)} · {vocabulary.partyLabel}{" "}
                      {state.reservation.party_size || "—"}
                    </p>
                    {note ? (
                      <p className="text-[10px] font-bold opacity-70">{note}</p>
                    ) : null}
                  </div>
                ) : assigningReservation && state.availableNow ? (
                  <p className="mt-1 border-t border-current/10 pt-1.5 text-[10px] font-bold text-emerald-300">
                    Select
                  </p>
                ) : note ? (
                  <p className="mt-1 border-t border-current/10 pt-1.5 text-[10px] reserve-muted">
                    {note}
                  </p>
                ) : capacity ? (
                  <p className="mt-1 border-t border-current/10 pt-1.5 text-[10px] reserve-muted">
                    Seats {capacity}
                  </p>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function ReserveFloorSnapshot({
  resources,
  reservations,
  onReservationSelect,
  onResourceSelect,
  assigningReservation,
  settingsHref = "/locations/dashboard/reservations/settings?section=layout",
  vocabulary,
}: {
  resources: any[];
  reservations: any[];
  onReservationSelect?: (reservation: any) => void;
  onResourceSelect?: (resource: any) => void;
  assigningReservation?: any;
  settingsHref?: string;
  vocabulary?: ReserveVocabulary;
}) {
  const floorResources = dedupeFloorResources(resources);
  const vocab =
    vocabulary ||
    getReserveVocabulary(
      null,
      floorResources[0]?.item_type || floorResources[0]?.type,
    );
  const barResources = floorResources.filter(isBarResource);
  const tableResources = floorResources.filter((resource) => !isBarResource(resource));

  return (
    <section className="reserve-floor-snapshot reserve-card rounded-2xl p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black">{vocab.floorTitle}</h2>
          <p className="mt-1 text-xs leading-5 reserve-muted">
            See what is available now, what is coming up, and what is currently in use.
          </p>
          {assigningReservation ? (
            <p className="mt-1 text-xs font-bold text-[var(--reserve-primary)]">
              {vocab.chooseResource} for {getReservationGuestName(assigningReservation)}.
            </p>
          ) : null}
        </div>
        <Link
          href={settingsHref}
          className="reserve-soft shrink-0 rounded-full px-3 py-2 text-xs font-black"
        >
          Manage layout
        </Link>
      </div>

      <div className="mt-3 flex flex-wrap gap-2" aria-label="Availability legend">
        {floorLegend.map((item) => (
          <span
            key={item.label}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black ${item.className}`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
            {item.label}
          </span>
        ))}
      </div>

      {floorResources.length ? (
        <div className="mt-4">
          {barResources.length ? (
            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/45">
                    Bar seating
                  </p>
                </div>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-black text-white/55">
                  {barResources.length}
                </span>
              </div>
              <div className="space-y-3">
                {barResources.map((resource) => (
                  <BarDiagram
                    key={resource.id || resource.layout_item_id || resourceName(resource)}
                    resource={resource}
                    reservations={reservations}
                    assigningReservation={assigningReservation}
                    onReservationSelect={onReservationSelect}
                    onResourceSelect={onResourceSelect}
                  />
                ))}
              </div>
            </div>
          ) : null}

          <TableFloor
            resources={tableResources}
            reservations={reservations}
            assigningReservation={assigningReservation}
            vocabulary={vocab}
            onReservationSelect={onReservationSelect}
            onResourceSelect={onResourceSelect}
          />
        </div>
      ) : (
        <div className="reserve-soft mt-4 rounded-2xl p-5">
          <p className="font-black">
            No {vocab.resourcePlural.toLowerCase()} have been added yet.
          </p>
          <p className="mt-1 text-sm leading-6 reserve-muted">
            Add your {vocab.resourcePlural.toLowerCase()} once, then your team can assign them while managing reservations.
          </p>
          <Link
            className="mt-3 inline-block reserve-primary rounded-full px-4 py-2 text-sm font-black"
            href={settingsHref}
          >
            Set up layout
          </Link>
        </div>
      )}

      <style jsx global>{`
        .reserve-floor-snapshot + div[class*="2xl:grid-cols-2"] > .reserve-card:first-child {
          display: none;
        }
      `}</style>
    </section>
  );
}
