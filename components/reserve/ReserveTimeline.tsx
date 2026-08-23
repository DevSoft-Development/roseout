"use client";

import { FormEvent, useState } from "react";
import { formatReservationTime, getReservationGuestName, getReservationPrimaryNextAction, getReservationStatusLabel } from "@/lib/reservations/ui";
import { getAssignedReservationResourceLabel, hasAssignedReservationResource } from "@/lib/reservations/floorSnapshot";
import { getReserveVocabulary, type ReserveVocabulary } from "@/lib/reservations/reserveVocabulary";
import ReserveQuickActionButton from "./ReserveQuickActionButton";
import ReserveStatusBadge from "./ReserveStatusBadge";
import ReserveConversationThread from "./ReserveConversationThread";
import { canAssignReservationResource, isTerminalReservationStatus } from "@/lib/reservations/status";

function assigned(r: any) { return getAssignedReservationResourceLabel(r); }
function duration(r: any) { return r.duration_minutes || r.default_duration_minutes || r.reservation_duration_minutes || r.turn_time_minutes || 90; }
function canTextReady(r: any) { return (r.status === "checked_in" || r.status === "waiting" || r.status === "arrived") && hasAssignedReservationResource(r) && r.customer_phone && !r.table_ready_sms_sent; }
function value(v: any, fallback = "—") { return v === undefined || v === null || v === "" ? fallback : String(v); }

const templates = [
  "Your reservation is confirmed.",
  "Your table/space is ready.",
  "We need a few more minutes.",
  "Please reply if you need to cancel or change your time.",
];

const accent: Record<string, string> = { pending: "bg-rose-500", confirmed: "bg-blue-500", checked_in: "bg-amber-500", waiting: "bg-amber-500", arrived: "bg-amber-500", seated: "bg-purple-500", completed: "bg-emerald-500", cancelled: "bg-red-500", no_show: "bg-red-500" };

export default function ReserveTimeline({ reservations, selectedId, onSelect, onStatus, onAssign, onTableReady, updatingId, vocabulary }: { reservations: any[]; selectedId?: string; onSelect: (r: any) => void; onStatus: (r: any, s: string) => void; onAssign?: (r: any) => void; onTableReady?: (r: any) => void; updatingId?: string; vocabulary?: ReserveVocabulary }) {
  const vocab = vocabulary || getReserveVocabulary();
  const [expandedId, setExpandedId] = useState("");
  const [messageId, setMessageId] = useState("");
  const [messageBusyId, setMessageBusyId] = useState("");
  const [messageNotice, setMessageNotice] = useState<Record<string, string>>({});
  const [threadRefresh, setThreadRefresh] = useState<Record<string, number>>({});
  const [readReservationIds, setReadReservationIds] = useState<Set<string>>(new Set());

  function markConversationRead(reservationId: string) {
    setReadReservationIds((prev) => {
      if (prev.has(reservationId)) return prev;
      const next = new Set(prev);
      next.add(reservationId);
      return next;
    });
  }

  function selectReservation(r: any) {
    onSelect(r);
    window.dispatchEvent(new CustomEvent("reserve:reservation-selected", {
      detail: {
        reservationId: r.id,
        bookableItemName: r.bookable_item_name || "",
      },
    }));
  }

  async function submitMessage(e: FormEvent<HTMLFormElement>, r: any) {
    e.preventDefault();
    e.stopPropagation();
    const fd = new FormData(e.currentTarget);
    setMessageBusyId(r.id);
    setMessageNotice((prev) => ({ ...prev, [r.id]: "" }));
    try {
      const response = await fetch("/api/reserve/portal/reservations/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservation_id: r.id,
          location_id: r.location_id,
          location_type: r.location_type,
          channel: fd.get("channel"),
          message: fd.get("message"),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Message could not be sent.");
      setMessageNotice((prev) => ({ ...prev, [r.id]: data.message || "Message sent." }));
      setMessageId("");
      setThreadRefresh((prev) => ({ ...prev, [r.id]: (prev[r.id] || 0) + 1 }));
    } catch (error) {
      setMessageNotice((prev) => ({ ...prev, [r.id]: error instanceof Error ? error.message : "Message could not be sent." }));
    } finally {
      setMessageBusyId("");
    }
  }

  return (
    <div className="space-y-2">
      {reservations.map((r) => {
        const action = getReservationPrimaryNextAction(r.status, vocab);
        const selected = selectedId === r.id;
        const expanded = expandedId === r.id;
        const guestName = getReservationGuestName(r);
        const hasResource = hasAssignedReservationResource(r);
        const isTerminal = isTerminalReservationStatus(r.status);
        const canAssign = canAssignReservationResource(r.status) && !isTerminal;
        const showPrimaryAction = Boolean(action.targetStatus) && !isTerminal && !(action.targetStatus === "seated" && !hasResource);
        const notes = r.special_request || r.notes || r.special_requests || "No notes on this reservation.";
        const hasPhone = Boolean(String(r.customer_phone || "").trim());
        const hasEmail = Boolean(String(r.customer_email || "").trim());
        const canMessage = hasPhone || hasEmail;
        const defaultChannel = hasPhone && hasEmail ? "both" : hasPhone ? "sms" : "email";
        const serverUnreadCount = Number(r.conversation_unread_count || 0);
        const unreadCount = readReservationIds.has(r.id) ? 0 : serverUnreadCount;
        return (
          <div key={r.id} className={`reserve-timeline-row relative overflow-hidden rounded-2xl border bg-[var(--reserve-card-strong)] transition hover:border-[var(--reserve-border-strong)] ${selected ? "border-[var(--reserve-primary)]/50 shadow-[0_0_0_1px_rgba(225,6,42,.16),0_10px_28px_rgba(0,0,0,.22)]" : "border-[var(--reserve-border)]"}`}>
            <span className={`absolute inset-y-3 left-0 w-1 rounded-r-full ${accent[r.status] || "bg-rose-500"}`} />
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={`reservation-details-${r.id}`}
              onClick={() => {
                setExpandedId(expanded ? "" : r.id);
                if (!expanded) selectReservation(r);
              }}
              className="w-full px-3 py-3 text-left"
            >
              <div className="reserve-timeline-grid grid gap-3">
                <div className="shrink-0 pl-2"><p className="whitespace-nowrap text-sm font-black">{formatReservationTime(r.reservation_time)}</p><p className="whitespace-nowrap text-[11px] reserve-muted">{duration(r)}m</p></div>
                <div className="reserve-timeline-content min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <h3 className="min-w-0 truncate text-sm font-black leading-tight md:text-[15px]" title={guestName}>{guestName}</h3>
                    {unreadCount > 0 ? (
                      <span className="shrink-0 rounded-full border border-amber-400/35 bg-amber-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.06em] text-amber-300">
                        {unreadCount === 1 ? "New reply" : `${unreadCount} new replies`}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 flex min-w-0 flex-col items-start gap-1.5">
                    <ReserveStatusBadge status={r.status} label={r.table_ready_sms_sent ? `${vocab.resource} ready sent` : getReservationStatusLabel(r.status, vocab)} />
                    <p className="max-w-full truncate text-xs reserve-muted">{vocab.partyLabel} {r.party_size || "—"} · {assigned(r)}</p>
                  </div>
                </div>
              </div>
            </button>

            {expanded && (
              <div id={`reservation-details-${r.id}`} className="border-t border-white/10 px-4 pb-4 pt-3">
                <div className="grid gap-2 text-xs sm:grid-cols-2">
                  <div className="reserve-soft rounded-xl p-3"><p className="reserve-muted">Phone</p><p className="mt-1 break-words font-bold text-white">{value(r.customer_phone, "No phone")}</p></div>
                  <div className="reserve-soft rounded-xl p-3"><p className="reserve-muted">Email</p><p className="mt-1 break-words font-bold text-white">{value(r.customer_email, "No email")}</p></div>
                  <div className="reserve-soft rounded-xl p-3"><p className="reserve-muted">Party & seating</p><p className="mt-1 font-bold text-white">{vocab.partyLabel} {r.party_size || "—"} · {assigned(r)}</p></div>
                  <div className="reserve-soft rounded-xl p-3"><p className="reserve-muted">Reservation</p><p className="mt-1 font-bold text-white">{formatReservationTime(r.reservation_time)} · {duration(r)} min</p></div>
                </div>
                <div className="reserve-soft mt-2 rounded-xl p-3 text-xs">
                  <p className="reserve-muted">Notes / special request</p>
                  <p className="mt-1 whitespace-pre-wrap font-medium text-white">{notes}</p>
                </div>

                <ReserveConversationThread
                  reservation={r}
                  refreshKey={threadRefresh[r.id] || 0}
                  onRead={() => markConversationRead(r.id)}
                />

                {messageNotice[r.id] ? <p className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3 text-xs font-bold">{messageNotice[r.id]}</p> : null}

                <div className="mt-3 flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                  {canTextReady(r) && onTableReady && <ReserveQuickActionButton disabled={updatingId === r.id} onClick={() => onTableReady(r)}>{updatingId === r.id ? "Sending…" : vocab.readyAction}</ReserveQuickActionButton>}
                  {showPrimaryAction && <ReserveQuickActionButton disabled={updatingId === r.id || !!action.disabledReason} title={action.disabledReason} onClick={() => action.targetStatus && onStatus(r, action.targetStatus)}>{updatingId === r.id ? "Updating…" : action.label}</ReserveQuickActionButton>}
                  {onAssign && canAssign && <ReserveQuickActionButton onClick={() => onAssign(r)}>{vocab.assignResource}</ReserveQuickActionButton>}
                  <ReserveQuickActionButton disabled={!canMessage} title={!canMessage ? "Add a phone number or email address before messaging this guest." : undefined} onClick={() => setMessageId(messageId === r.id ? "" : r.id)}>Reply to guest</ReserveQuickActionButton>
                </div>

                {messageId === r.id && canMessage ? (
                  <form onSubmit={(e) => submitMessage(e, r)} onClick={(e) => e.stopPropagation()} className="reserve-soft mt-3 grid gap-3 rounded-2xl p-3">
                    <div className="grid gap-2 sm:grid-cols-[180px_1fr] sm:items-center">
                      <label className="text-xs font-bold">Send by</label>
                      <select name="channel" defaultValue={defaultChannel} className="rounded-xl bg-black/20 px-3 py-2 text-sm">
                        {hasPhone ? <option value="sms">SMS</option> : null}
                        {hasEmail ? <option value="email">Email</option> : null}
                        {hasPhone && hasEmail ? <option value="both">SMS and email</option> : null}
                      </select>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {templates.map((template) => (
                        <button key={template} type="button" onClick={(e) => {
                          const textarea = e.currentTarget.form?.elements.namedItem("message") as HTMLTextAreaElement | null;
                          if (textarea) textarea.value = template;
                        }} className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-bold">{template}</button>
                      ))}
                    </div>
                    <textarea name="message" required rows={3} placeholder="Write a reservation message…" className="rounded-xl bg-black/20 px-3 py-2 text-sm" />
                    <button disabled={messageBusyId === r.id} className="reserve-primary rounded-full px-4 py-2 text-sm font-black">{messageBusyId === r.id ? "Sending…" : "Send reply"}</button>
                  </form>
                ) : null}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
