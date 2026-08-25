"use client";

import { getReservationGuestName } from "@/lib/reservations/ui";
import { guestInitials } from "@/lib/reservations/reservationFormatting";
import {
  getReserveVocabulary,
  type ReserveVocabulary,
} from "@/lib/reservations/reserveVocabulary";
import ReserveQuickActionButton from "./ReserveQuickActionButton";

function statusLabel(status: string | undefined, vocab: ReserveVocabulary) {
  if (status === "notified") return `${vocab.resource} offered`;
  if (status === "booked" || status === "converted") return "Reservation created";
  if (status === "expired") return "Offer expired";
  if (status === "cancelled") return "Removed";
  return "Waiting";
}

export default function ReserveWaitlistPanel({
  entries,
  onAdd,
  onOffer,
  onViewAll,
  updatingId,
  vocabulary,
}: {
  entries: any[];
  onAdd?: () => void;
  onOffer?: (entry: any) => void;
  onViewAll?: () => void;
  updatingId?: string;
  vocabulary?: ReserveVocabulary;
}) {
  const vocab = vocabulary || getReserveVocabulary();

  return (
    <section className="reserve-card rounded-2xl p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black">Waitlist</h2>
          <p className="mt-0.5 text-xs reserve-muted">
            {entries.length} {entries.length === 1 ? "party" : "parties"} waiting
          </p>
        </div>
        <button
          type="button"
          onClick={onViewAll}
          disabled={!onViewAll}
          title={!onViewAll ? "The full waitlist is not available from this view." : undefined}
          className="text-xs font-black text-[var(--reserve-primary)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          View all
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {entries.length ? (
          entries.slice(0, 5).map((entry) => {
            const guestName = getReservationGuestName(entry);
            const finished = entry.status === "booked" || entry.status === "converted";

            return (
              <div
                key={entry.id}
                className="flex items-center gap-3 rounded-xl border border-[var(--reserve-border)] bg-[var(--reserve-card-strong)] p-2.5"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--reserve-primary-soft)] text-xs font-black text-[var(--reserve-primary)]">
                  {guestInitials(guestName)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black">{guestName}</p>
                  <p className="truncate text-[11px] reserve-muted">
                    {vocab.partyLabel} {entry.party_size || 2} ·{" "}
                    {entry.reservation_time
                      ? String(entry.reservation_time).slice(0, 5)
                      : "Flexible time"}{" "}
                    · {statusLabel(entry.status, vocab)}
                  </p>
                </div>
                <ReserveQuickActionButton
                  disabled={!onOffer || finished || updatingId === entry.id}
                  title={
                    !onOffer
                      ? "Availability cannot be offered from this view."
                      : finished
                        ? "A reservation has already been created for this guest."
                        : undefined
                  }
                  onClick={() => onOffer?.(entry)}
                >
                  {updatingId === entry.id
                    ? "Updating…"
                    : entry.status === "notified"
                      ? "Create reservation"
                      : "Offer availability"}
                </ReserveQuickActionButton>
              </div>
            );
          })
        ) : (
          <div className="rounded-xl border border-dashed border-[var(--reserve-border)] p-4">
            <p className="text-sm font-black">No one is waiting right now.</p>
            <p className="mt-1 text-xs reserve-muted">
              New waitlist guests will appear here automatically.
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={onAdd}
          disabled={!onAdd}
          title={!onAdd ? "Adding a guest is not available from this view." : undefined}
          className="w-full rounded-xl border border-dashed border-[var(--reserve-border-strong)] p-3 text-sm font-black text-[var(--reserve-muted-strong)] transition hover:border-[var(--reserve-primary)]/40 hover:text-white disabled:opacity-50"
        >
          + Add guest to waitlist
        </button>
      </div>
    </section>
  );
}
