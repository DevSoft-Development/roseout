"use client";

import Link from "next/link";
import { formatReservationTime, getReservationGuestName } from "@/lib/reservations/ui";
import { dedupeFloorResources, getFloorSnapshotState, resourceCapacity, resourceName } from "@/lib/reservations/floorSnapshot";
import { getReserveVocabulary, type ReserveVocabulary } from "@/lib/reservations/reserveVocabulary";

const statusStyles: Record<string, string> = {
  Open: "border-white/12 bg-white/[0.025] text-slate-300",
  Reserved: "border-green-400/45 bg-green-500/10 text-green-300",
  Confirmed: "border-green-400/45 bg-green-500/10 text-green-300",
  Pending: "border-rose-400/45 bg-rose-500/10 text-rose-300",
  Waiting: "border-blue-400/45 bg-blue-500/10 text-blue-300",
  "Ready sent": "border-amber-400/50 bg-amber-500/10 text-amber-300",
  Seated: "border-purple-400/50 bg-purple-500/10 text-purple-300",
  Blocked: "border-red-400/50 bg-red-500/10 text-red-300",
  Closed: "border-white/10 bg-white/[0.02] text-slate-500",
};

function stateLabel(status: string, vocab: ReserveVocabulary) {
  if (status === "Seated") return vocab.seatedStatus;
  if (status === "Ready sent") return `${vocab.resource} ready sent`;
  return status;
}

function normalizedType(resource: any) {
  return String(resource?.item_type || resource?.type || "").toLowerCase().replaceAll(" ", "_");
}

function isBarResource(resource: any) {
  return ["bar", "bar_seat", "counter", "counter_seat"].includes(normalizedType(resource));
}

function chairStyle(index: number, capacity: number) {
  const side = index % 4;
  const positionIndex = Math.floor(index / 4);
  const countOnSide = Math.ceil(Math.max(0, capacity - side) / 4);
  const pct = `${((positionIndex + 1) / (countOnSide + 1)) * 100}%`;

  if (side === 0) return { left: pct, top: "2px", transform: "translate(-50%, -50%)" };
  if (side === 1) return { right: "2px", top: pct, transform: "translate(50%, -50%)" };
  if (side === 2) return { left: pct, bottom: "2px", transform: "translate(-50%, 50%)" };
  return { left: "2px", top: pct, transform: "translate(-50%, -50%)" };
}

function TableDiagram({ name, capacity, status }: { name: string; capacity: number; status: string }) {
  const chairSize = capacity <= 8 ? "h-2.5 w-2.5" : capacity <= 12 ? "h-2 w-2" : "h-1.5 w-1.5";

  return (
    <div className="relative mx-auto h-[76px] w-[104px]" aria-label={`${name}, ${capacity || 0} seats`}>
      {Array.from({ length: capacity }).map((_, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={`absolute rounded-[3px] border border-current/45 bg-current/30 ${chairSize}`}
          style={chairStyle(index, capacity)}
        />
      ))}
      <div className="absolute inset-x-[18px] inset-y-[16px] flex flex-col items-center justify-center rounded-xl border border-current/45 bg-black/35 px-1 shadow-inner">
        <span className="max-w-full truncate text-[11px] font-black text-white">{name}</span>
        <span className="mt-0.5 text-[9px] font-black uppercase tracking-[0.08em] opacity-85">{status}</span>
      </div>
    </div>
  );
}

function BarDiagram({ resource, reservations, assigningReservation, onReservationSelect, onResourceSelect }: { resource: any; reservations: any[]; assigningReservation?: any; onReservationSelect?: (reservation: any) => void; onResourceSelect?: (resource: any) => void }) {
  const capacity = Math.max(1, resourceCapacity(resource) || 1);
  const name = resourceName(resource);
  const type = normalizedType(resource).startsWith("counter") ? "counter_seat" : "bar_seat";

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/20 p-3 sm:p-4">
      <div className="min-w-[520px]">
        <div className="relative mx-auto max-w-5xl">
          <div className="h-5 rounded-t-[28px] border border-white/15 border-b-white/5 bg-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]" />
          <div className="flex min-h-[78px] items-center justify-center border-x border-white/10 bg-gradient-to-b from-white/[0.055] to-white/[0.025] px-6 text-center shadow-inner">
            <div>
              <p className="text-sm font-black tracking-wide text-white">{name}</p>
              <p className="mt-1 text-[10px] font-black uppercase tracking-[0.18em] reserve-muted">Bar · {capacity} stools</p>
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
              };
              const state = getFloorSnapshotState(synthetic, reservations);
              const disabled = Boolean(assigningReservation && !state.available);
              return (
                <button
                  key={seatLabel}
                  type="button"
                  disabled={disabled}
                  title={`${seatLabel} · ${state.status}`}
                  onClick={() => state.reservation ? onReservationSelect?.(state.reservation) : onResourceSelect?.(synthetic)}
                  className={`group flex min-h-[62px] flex-col items-center justify-start pt-1 transition disabled:cursor-not-allowed disabled:opacity-45 ${assigningReservation && state.available ? "rounded-xl ring-2 ring-emerald-500/55" : ""}`}
                >
                  <span className="h-4 w-1 rounded-full bg-white/20" aria-hidden="true" />
                  <span className={`grid h-8 w-8 place-items-center rounded-full border text-[10px] font-black shadow-md ${statusStyles[state.status] || statusStyles.Open}`}>
                    {seatNumber}
                  </span>
                  <span className="mt-1 max-w-[52px] truncate text-[8px] font-black uppercase tracking-[0.08em] opacity-75">{state.status}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <p className="mt-2 text-center text-[9px] reserve-muted">Tap a stool to assign; parties receive adjacent available stools automatically.</p>
    </div>
  );
}

function TableFloor({ resources, reservations, assigningReservation, vocabulary, onReservationSelect, onResourceSelect }: { resources: any[]; reservations: any[]; assigningReservation?: any; vocabulary: ReserveVocabulary; onReservationSelect?: (reservation: any) => void; onResourceSelect?: (resource: any) => void }) {
  if (!resources.length) return null;
  const scrollingClass = resources.length > 12 ? "max-h-[min(58vh,520px)] overflow-y-auto overscroll-contain pr-1" : "";

  return (
    <div className="mt-5 border-t border-white/10 pt-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/45">Dining Floor</p>
          <p className="mt-1 text-xs reserve-muted">Tables, booths, rooms, and other assignable spaces.</p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-black text-white/55">{resources.length}</span>
      </div>
      <div className={scrollingClass}>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(116px,1fr))] gap-2.5">
          {resources.map((r) => {
            const state = getFloorSnapshotState(r, reservations);
            const disabled = Boolean(assigningReservation && !state.available);
            const capacity = Math.max(0, resourceCapacity(r) || 0);
            const name = resourceName(r);
            const label = stateLabel(state.status, vocabulary);
            return (
              <button
                type="button"
                key={r.id || r.layout_item_id || name}
                disabled={disabled}
                onClick={() => state.reservation ? onReservationSelect?.(state.reservation) : onResourceSelect?.(r)}
                className={`min-w-0 rounded-xl border px-2 py-2 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${statusStyles[state.status] || statusStyles.Open} ${assigningReservation && state.available ? "ring-2 ring-emerald-500/55" : ""}`}
              >
                <TableDiagram name={name} capacity={capacity} status={label} />
                {state.reservation ? (
                  <div className="mt-1 min-w-0 border-t border-current/10 pt-1.5">
                    <p className="truncate text-[11px] font-bold text-white">{getReservationGuestName(state.reservation)} · {vocabulary.partyLabel} {state.reservation.party_size || "—"}</p>
                    {state.reservation?.reservation_time ? <p className="text-[10px] reserve-muted">{formatReservationTime(state.reservation.reservation_time)}</p> : null}
                  </div>
                ) : assigningReservation && state.available ? (
                  <p className="mt-1 border-t border-current/10 pt-1.5 text-[10px] font-bold text-emerald-300">Tap to assign</p>
                ) : capacity ? (
                  <p className="mt-1 border-t border-current/10 pt-1.5 text-[10px] reserve-muted">{capacity} seats</p>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function ReserveFloorSnapshot({ resources, reservations, onReservationSelect, onResourceSelect, assigningReservation, settingsHref = "/reserve/dashboard?tab=settings&section=layout", vocabulary }: { resources: any[]; reservations: any[]; onReservationSelect?: (reservation: any) => void; onResourceSelect?: (resource: any) => void; assigningReservation?: any; settingsHref?: string; vocabulary?: ReserveVocabulary }) {
  const floorResources = dedupeFloorResources(resources);
  const vocab = vocabulary || getReserveVocabulary(null, floorResources[0]?.item_type || floorResources[0]?.type);
  const barResources = floorResources.filter(isBarResource);
  const tableResources = floorResources.filter((resource) => !isBarResource(resource));

  return (
    <section className="reserve-card rounded-2xl p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black">{vocab.floorTitle}</h2>
          <p className="mt-1 text-xs reserve-muted">Bar seating is shown across the top; dining tables and spaces are arranged below.</p>
          {assigningReservation && <p className="mt-1 text-xs font-bold text-[var(--reserve-primary)]">{vocab.chooseResource} for {getReservationGuestName(assigningReservation)}.</p>}
        </div>
        <Link href={settingsHref} className="reserve-soft shrink-0 rounded-full px-3 py-2 text-xs font-black">{vocab.floorView}</Link>
      </div>

      {floorResources.length ? (
        <div className="mt-4">
          {barResources.length ? (
            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/45">Bar Seating</p>
                  <p className="mt-1 text-xs reserve-muted">Full-width bar rail with individually assignable stools.</p>
                </div>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-black text-white/55">{barResources.length}</span>
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
          <p className="font-black">No {vocab.resourcePlural.toLowerCase()} are set up yet.</p>
          <p className="mt-1 text-sm reserve-muted">Set up a layout to assign reservations to real {vocab.resourcePlural.toLowerCase()}.</p>
          <Link className="mt-3 inline-block reserve-primary rounded-full px-4 py-2 text-sm font-black" href={settingsHref}>Set up layout</Link>
        </div>
      )}
    </section>
  );
}
