"use client";

import { getReservationPrimaryNextAction, formatReservationTime } from "@/lib/reservations/ui";
import ReserveStatusBadge from "./ReserveStatusBadge";

export type TimelineReservation = {
  id: string;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  reservation_date?: string | null;
  reservation_time?: string | null;
  party_size?: number | null;
  status?: string | null;
  reservable_item_name?: string | null;
  reservable_item_type?: string | null;
  special_request?: string | null;
};

export default function ReservationTimelineTable({ reservations, updatingId, onPrimaryAction, onCancel, onNoShow }: { reservations: TimelineReservation[]; updatingId?: string; onPrimaryAction?: (reservation: TimelineReservation, status: string) => void; onCancel?: (reservation: TimelineReservation) => void; onNoShow?: (reservation: TimelineReservation) => void }) {
  return <div className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#0d0908]">
    <div className="hidden grid-cols-[110px_1fr_100px_180px_150px_180px] gap-3 border-b border-white/10 px-4 py-3 text-xs font-black uppercase tracking-wide text-white/40 lg:grid"><span>Time</span><span>Guest</span><span>Party</span><span>Location/resource</span><span>Status</span><span>Next action</span></div>
    <div className="divide-y divide-white/10">
      {reservations.map(r => {
        const action = getReservationPrimaryNextAction(r.status);
        const disabled = updatingId === r.id || !action.targetStatus || Boolean(action.disabledReason);
        return <article key={r.id} className="grid gap-4 p-4 lg:grid-cols-[110px_1fr_100px_180px_150px_180px] lg:items-center">
          <div className="text-lg font-black text-rose-100">{formatReservationTime(r.reservation_time)}</div>
          <div><p className="font-black">{r.customer_name || "Guest"}</p><p className="text-xs text-white/45">{[r.customer_phone, r.customer_email].filter(Boolean).join(" · ") || "No contact listed"}</p>{r.special_request ? <p className="mt-2 rounded-xl bg-white/[0.05] px-3 py-2 text-xs text-white/60">Notes added</p> : null}</div>
          <div className="text-sm font-bold text-white/70">{r.party_size || 1} guests</div>
          <div className="text-sm text-white/60">{r.reservable_item_name || r.reservable_item_type || "Any available"}</div>
          <ReserveStatusBadge status={r.status}/>
          <div className="flex flex-wrap gap-2"><button disabled={disabled} onClick={() => action.targetStatus && onPrimaryAction?.(r, action.targetStatus)} className="rounded-full bg-rose-600 px-3 py-2 text-xs font-black text-white disabled:bg-white/10 disabled:text-white/35" title={action.disabledReason}>{updatingId === r.id ? "Working..." : action.label}</button>{["pending","confirmed","checked_in","arrived"].includes(String(r.status)) ? <button disabled={updatingId===r.id} onClick={() => onCancel?.(r)} className="rounded-full border border-white/10 px-3 py-2 text-xs font-black text-white/65 disabled:opacity-40">Cancel</button> : null}{["confirmed","checked_in","arrived","seated"].includes(String(r.status)) ? <button disabled={updatingId===r.id} onClick={() => onNoShow?.(r)} className="rounded-full border border-white/10 px-3 py-2 text-xs font-black text-white/65 disabled:opacity-40">No-show</button> : null}</div>
        </article>
      })}
    </div>
  </div>;
}
