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

export default function ReserveFloorSnapshot({ resources, reservations, onReservationSelect, onResourceSelect, assigningReservation, settingsHref = "/reserve/dashboard?tab=settings&section=layout", vocabulary }: { resources: any[]; reservations: any[]; onReservationSelect?: (reservation: any) => void; onResourceSelect?: (resource: any) => void; assigningReservation?: any; settingsHref?: string; vocabulary?: ReserveVocabulary }) {
  const floorResources = dedupeFloorResources(resources);
  const vocab = vocabulary || getReserveVocabulary(null, floorResources[0]?.item_type || floorResources[0]?.type);
  const scrollingClass = floorResources.length > 12 ? "max-h-[min(58vh,520px)] overflow-y-auto overscroll-contain pr-1" : "";

  return (
    <section className="reserve-card rounded-2xl p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black">{vocab.floorTitle}</h2>
          <p className="mt-1 text-xs reserve-muted">{floorResources.length} {floorResources.length === 1 ? vocab.resource.toLowerCase() : vocab.resourcePlural.toLowerCase()} · chairs show configured capacity</p>
          {assigningReservation && <p className="mt-1 text-xs font-bold text-[var(--reserve-primary)]">{vocab.chooseResource} for {getReservationGuestName(assigningReservation)}.</p>}
        </div>
        <Link href={settingsHref} className="reserve-soft shrink-0 rounded-full px-3 py-2 text-xs font-black">{vocab.floorView}</Link>
      </div>
      {floorResources.length ? (
        <div className={`mt-4 ${scrollingClass}`}>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(116px,1fr))] gap-2.5">
            {floorResources.map((r) => {
              const state = getFloorSnapshotState(r, reservations);
              const disabled = Boolean(assigningReservation && !state.available);
              const capacity = Math.max(0, resourceCapacity(r) || 0);
              const name = resourceName(r);
              const label = stateLabel(state.status, vocab);
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
                      <p className="truncate text-[11px] font-bold text-white">{getReservationGuestName(state.reservation)} · {vocab.partyLabel} {state.reservation.party_size || "—"}</p>
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
