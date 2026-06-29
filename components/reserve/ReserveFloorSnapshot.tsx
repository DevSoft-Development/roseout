"use client";

import Link from "next/link";
import { formatReservationTime, getReservationGuestName } from "@/lib/reservations/ui";
import { dedupeFloorResources, getFloorSnapshotState, resourceCapacity, resourceName } from "@/lib/reservations/floorSnapshot";

const statusStyles: Record<string, string> = {
  Open: "border-white/12 bg-white/[0.025] text-slate-300",
  Reserved: "border-green-400/45 bg-green-500/10 text-green-300",
  Arrived: "border-blue-400/45 bg-blue-500/10 text-blue-300",
  "Table ready sent": "border-amber-400/50 bg-amber-500/10 text-amber-300",
  Seated: "border-purple-400/50 bg-purple-500/10 text-purple-300",
  Blocked: "border-red-400/50 bg-red-500/10 text-red-300",
  Closed: "border-white/10 bg-white/[0.02] text-slate-500",
};

export default function ReserveFloorSnapshot({
  resources,
  reservations,
  onReservationSelect,
  onResourceSelect,
  assigningReservation,
  settingsHref = "/reserve/dashboard?tab=settings&section=layout",
}: {
  resources: any[];
  reservations: any[];
  onReservationSelect?: (reservation: any) => void;
  onResourceSelect?: (resource: any) => void;
  assigningReservation?: any;
  settingsHref?: string;
}) {
  const floorResources = dedupeFloorResources(resources);

  return (
    <section className="reserve-card rounded-2xl p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black">Floor Snapshot</h2>
          {assigningReservation && <p className="mt-1 text-xs font-bold text-[var(--reserve-primary)]">Choose an open table for {getReservationGuestName(assigningReservation)}.</p>}
        </div>
        <Link href={settingsHref} className="reserve-soft rounded-full px-3 py-2 text-xs font-black">Open Full Floor View</Link>
      </div>
      {floorResources.length ? (
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">
          {floorResources.map((r) => {
            const state = getFloorSnapshotState(r, reservations);
            const disabled = Boolean(assigningReservation && !state.available);
            return (
              <button
                type="button"
                key={r.id || r.layout_item_id || resourceName(r)}
                disabled={disabled}
                onClick={() => state.reservation ? onReservationSelect?.(state.reservation) : onResourceSelect?.(r)}
                className={`min-h-[96px] rounded-2xl border p-3 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${statusStyles[state.status] || statusStyles.Open} ${assigningReservation && state.available ? "ring-2 ring-emerald-500/55" : ""}`}
              >
                <p className="truncate text-sm font-black text-white">{resourceName(r)}</p>
                <p className="text-[11px] reserve-muted">Cap {resourceCapacity(r) || "—"}</p>
                <span className="mt-2 inline-flex whitespace-nowrap rounded-full border border-current/20 px-2 py-0.5 text-[10px] font-black leading-none">{state.status}</span>
                {state.reservation ? (
                  <p className="mt-2 truncate text-xs font-bold text-white">{getReservationGuestName(state.reservation)} · {state.reservation.party_size || "—"}p</p>
                ) : assigningReservation && state.available ? (
                  <p className="mt-2 text-xs font-bold text-emerald-300">Click to assign</p>
                ) : null}
                {state.reservation?.reservation_time ? <p className="text-[11px] reserve-muted">{formatReservationTime(state.reservation.reservation_time)}</p> : null}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="reserve-soft mt-4 rounded-2xl p-5">
          <p className="font-black">No tables or bookable spaces are set up yet.</p>
          <p className="mt-1 text-sm reserve-muted">Set up a layout to assign reservations to real floor resources.</p>
          <Link className="mt-3 inline-block reserve-primary rounded-full px-4 py-2 text-sm font-black" href={settingsHref}>Set up layout</Link>
        </div>
      )}
    </section>
  );
}
