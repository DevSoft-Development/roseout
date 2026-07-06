"use client";

import { formatReservationTime, getReservationGuestName, getReservationPrimaryNextAction, getReservationStatusLabel } from "@/lib/reservations/ui";
import { getAssignedReservationResourceLabel, hasAssignedReservationResource } from "@/lib/reservations/floorSnapshot";
import { getReserveVocabulary, type ReserveVocabulary } from "@/lib/reservations/reserveVocabulary";
import ReserveQuickActionButton from "./ReserveQuickActionButton";
import ReserveStatusBadge from "./ReserveStatusBadge";
import { canAssignReservationResource, isTerminalReservationStatus } from "@/lib/reservations/status";

function assigned(r: any) { return getAssignedReservationResourceLabel(r); }
function duration(r: any) { return r.duration_minutes || r.default_duration_minutes || 90; }
function canTextReady(r: any) { return (r.status === "checked_in" || r.status === "waiting" || r.status === "arrived") && hasAssignedReservationResource(r) && r.customer_phone && !r.table_ready_sms_sent; }

const accent: Record<string, string> = { pending: "bg-rose-500", confirmed: "bg-blue-500", checked_in: "bg-amber-500", waiting: "bg-amber-500", arrived: "bg-amber-500", seated: "bg-purple-500", completed: "bg-emerald-500", cancelled: "bg-red-500", no_show: "bg-red-500" };

export default function ReserveTimeline({ reservations, selectedId, onSelect, onStatus, onAssign, onTableReady, updatingId, vocabulary }: { reservations: any[]; selectedId?: string; onSelect: (r: any) => void; onStatus: (r: any, s: string) => void; onAssign?: (r: any) => void; onTableReady?: (r: any) => void; updatingId?: string; vocabulary?: ReserveVocabulary }) {
  const vocab = vocabulary || getReserveVocabulary();
  return (
    <div className="space-y-2">
      {reservations.map((r) => {
        const action = getReservationPrimaryNextAction(r.status, vocab);
        const selected = selectedId === r.id;
        const guestName = getReservationGuestName(r);
        const hasResource = hasAssignedReservationResource(r);
        const isTerminal = isTerminalReservationStatus(r.status);
        const canAssign = canAssignReservationResource(r.status) && !isTerminal;
        const showPrimaryAction = Boolean(action.targetStatus) && !isTerminal && !(action.targetStatus === "seated" && !hasResource);
        return (
          <button type="button" key={r.id} onClick={() => onSelect(r)} className={`reserve-timeline-row group relative w-full overflow-hidden rounded-2xl border bg-[var(--reserve-card-strong)] px-3 py-3 text-left transition hover:border-[var(--reserve-border-strong)] ${selected ? "border-[var(--reserve-primary)]/50 shadow-[0_0_0_1px_rgba(225,6,42,.16),0_10px_28px_rgba(0,0,0,.22)]" : "border-[var(--reserve-border)]"}`}>
            <span className={`absolute inset-y-3 left-0 w-1 rounded-r-full ${accent[r.status] || "bg-rose-500"}`} />
            <div className="reserve-timeline-grid grid gap-3">
              <div className="shrink-0 pl-2"><p className="whitespace-nowrap text-sm font-black">{formatReservationTime(r.reservation_time)}</p><p className="whitespace-nowrap text-[11px] reserve-muted">{duration(r)}m</p></div>
              <div className="reserve-timeline-content min-w-0">
                <h3 className="min-w-0 truncate text-sm font-black leading-tight md:text-[15px]" title={guestName}>{guestName}</h3>
                <div className="mt-1 flex min-w-0 flex-col items-start gap-1.5">
                  <ReserveStatusBadge status={r.status} label={r.table_ready_sms_sent ? `${vocab.resource} ready sent` : getReservationStatusLabel(r.status, vocab)} />
                  <p className="max-w-full truncate text-xs reserve-muted">{vocab.partyLabel} {r.party_size || "—"} · {assigned(r)}</p>
                </div>
              </div>
              <div className="reserve-timeline-actions flex shrink-0 flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                {canTextReady(r) && onTableReady && <ReserveQuickActionButton disabled={updatingId === r.id} onClick={() => onTableReady(r)}>{updatingId === r.id ? "Sending…" : vocab.readyAction}</ReserveQuickActionButton>}
                {showPrimaryAction && <ReserveQuickActionButton disabled={updatingId === r.id || !!action.disabledReason} title={action.disabledReason} onClick={() => action.targetStatus && onStatus(r, action.targetStatus)}>{updatingId === r.id ? "Updating…" : action.label}</ReserveQuickActionButton>}
                {onAssign && canAssign && <ReserveQuickActionButton onClick={() => onAssign(r)}>{vocab.assignResource}</ReserveQuickActionButton>}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
