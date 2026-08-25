"use client";

import { FormEvent, useState } from "react";
import ReserveQuickActionButton from "./ReserveQuickActionButton";
import ReserveStatusBadge from "./ReserveStatusBadge";
import {
  formatReservationTime,
  getReservationGuestName,
  getReservationPrimaryNextAction,
  getReservationStatusLabel,
} from "@/lib/reservations/ui";
import {
  formatReservationDateTime,
  formatReservationDuration,
} from "@/lib/reservations/reservationFormatting";
import {
  getAssignedReservationResourceLabel,
  hasAssignedReservationResource,
} from "@/lib/reservations/floorSnapshot";
import {
  getReserveVocabulary,
  type ReserveVocabulary,
} from "@/lib/reservations/reserveVocabulary";
import {
  canAssignReservationResource,
  canSeatReservation,
  isTerminalReservationStatus,
} from "@/lib/reservations/status";

function value(input: any, fallback = "—") {
  return input === undefined || input === null || input === ""
    ? fallback
    : String(input);
}

export default function ReserveGuestDetails({
  reservation,
  onStatus,
  onAssign,
  onTableReady,
  onRefresh,
  updatingId,
  vocabulary,
}: {
  reservation: any;
  onStatus: (reservation: any, status: string) => void;
  onAssign?: (reservation: any) => void;
  onTableReady?: (reservation: any) => void;
  onRefresh?: () => void;
  updatingId?: string;
  vocabulary?: ReserveVocabulary;
}) {
  const vocab = vocabulary || getReserveVocabulary();
  const [panel, setPanel] = useState<"" | "move" | "message" | "editContact">(
    "",
  );
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  if (!reservation) {
    return (
      <section className="reserve-card rounded-2xl p-4">
        <h2 className="text-lg font-black">Guest details</h2>
        <p className="mt-4 reserve-muted">
          Select a reservation to view guest details.
        </p>
      </section>
    );
  }

  const action = getReservationPrimaryNextAction(reservation.status, vocab);
  const guestName = getReservationGuestName(reservation);
  const duration =
    reservation.duration_minutes ||
    reservation.default_duration_minutes ||
    reservation.reservation_duration_minutes ||
    reservation.turn_time_minutes ||
    90;
  const assigned = getAssignedReservationResourceLabel(reservation);
  const hasResource = hasAssignedReservationResource(reservation);
  const isTerminal = isTerminalReservationStatus(reservation.status);
  const canAssign = canAssignReservationResource(reservation.status) && !isTerminal;
  const canSeat = canSeatReservation(reservation.status) && !isTerminal;
  const canTextReady =
    canSeat &&
    hasResource &&
    reservation.customer_phone &&
    !reservation.table_ready_sms_sent;
  const showPrimary =
    Boolean(action.targetStatus) &&
    !(action.targetStatus === "seated" && !(canSeat && hasResource)) &&
    !isTerminal;

  const messageTemplates = [
    "Your reservation is confirmed.",
    `Your ${vocab.resource.toLowerCase()} is ready.`,
    "We need a few more minutes. We’ll let you know as soon as we’re ready for you.",
    "Please reply if you need to cancel or change your reservation time.",
  ];

  async function submitMove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/reserve/portal/reservations/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservation_id: reservation.id,
          location_id: reservation.location_id,
          location_type: reservation.location_type,
          reservation_date: form.get("date"),
          reservation_time: form.get("time"),
          duration_minutes: Number(form.get("duration")),
          special_request: form.get("reason"),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "We could not change the reservation time.");
      }
      setNotice("Reservation updated.");
      setPanel("");
      onRefresh?.();
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "We could not change the reservation time.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitEditContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/reserve/portal/reservations/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservation_id: reservation.id,
          location_id: reservation.location_id,
          location_type: reservation.location_type,
          customer_phone: String(form.get("phone") || "").trim(),
          customer_email: String(form.get("email") || "").trim(),
          notes: String(form.get("notes") || "").trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "We could not update guest details.");
      }
      setNotice("Guest details updated.");
      setPanel("");
      onRefresh?.();
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "We could not update guest details.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/reserve/portal/reservations/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservation_id: reservation.id,
          location_id: reservation.location_id,
          location_type: reservation.location_type,
          channel: form.get("channel"),
          message: form.get("message"),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "We could not send this message.");
      }
      setNotice(data.message || "Message sent.");
      setPanel("");
      onRefresh?.();
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "We could not send this message.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="reserve-card rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-black">Guest details</h2>
          <p className="mt-2 truncate text-2xl font-black">{guestName}</p>
          <p className="mt-1 text-xs reserve-muted">
            {value(reservation.customer_phone, "No phone")} ·{" "}
            {value(reservation.customer_email, "No email")}
          </p>
        </div>
        <ReserveStatusBadge
          status={reservation.status}
          label={getReservationStatusLabel(reservation.status, vocab)}
        />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <div className="reserve-soft rounded-xl p-3">
          <dt className="text-[11px] reserve-muted">{vocab.partySizeLabel}</dt>
          <dd className="font-black">{value(reservation.party_size)}</dd>
        </div>
        <div className="reserve-soft rounded-xl p-3">
          <dt className="text-[11px] reserve-muted">{vocab.resource}</dt>
          <dd className="truncate font-black">{assigned}</dd>
        </div>
        <div className="reserve-soft rounded-xl p-3">
          <dt className="text-[11px] reserve-muted">Reservation time</dt>
          <dd className="font-black">
            {formatReservationTime(reservation.reservation_time)} ·{" "}
            {formatReservationDuration(duration)}
          </dd>
        </div>
        <div className="reserve-soft rounded-xl p-3">
          <dt className="text-[11px] reserve-muted">Booked on</dt>
          <dd className="truncate font-black">
            {formatReservationDateTime(
              reservation.booked_at ||
                reservation.created_at ||
                reservation.converted_at,
            )}
          </dd>
        </div>
      </dl>

      <div className="reserve-soft mt-3 rounded-xl p-3">
        <p className="text-[11px] font-black uppercase tracking-[0.08em] reserve-muted">
          Guest notes
        </p>
        <p className="mt-1 text-sm">
          {reservation.special_request ||
            reservation.notes ||
            reservation.special_requests ||
            "No guest notes for this reservation."}
        </p>
      </div>

      {notice ? (
        <p className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3 text-sm font-bold">
          {notice}
        </p>
      ) : null}

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {showPrimary ? (
          <ReserveQuickActionButton
            disabled={
              updatingId === reservation.id ||
              Boolean(action.disabledReason) ||
              !action.targetStatus
            }
            title={action.disabledReason}
            onClick={() =>
              action.targetStatus && onStatus(reservation, action.targetStatus)
            }
          >
            {updatingId === reservation.id ? "Updating…" : action.label}
          </ReserveQuickActionButton>
        ) : null}

        {onTableReady ? (
          <ReserveQuickActionButton
            disabled={!canTextReady || updatingId === reservation.id}
            title={
              !reservation.customer_phone
                ? "Add a phone number before sending a ready text."
                : !canTextReady
                  ? `Check in and assign a ${vocab.resource.toLowerCase()} before sending the ready message.`
                  : undefined
            }
            onClick={() => onTableReady(reservation)}
          >
            {reservation.table_ready_sms_sent ? "Ready message sent" : vocab.readyAction}
          </ReserveQuickActionButton>
        ) : null}

        {onAssign && canAssign ? (
          <ReserveQuickActionButton onClick={() => onAssign(reservation)}>
            {vocab.assignResource}
          </ReserveQuickActionButton>
        ) : null}

        <ReserveQuickActionButton
          onClick={() => setPanel(panel === "editContact" ? "" : "editContact")}
        >
          Edit guest
        </ReserveQuickActionButton>
        {!isTerminal ? (
          <ReserveQuickActionButton
            onClick={() => setPanel(panel === "move" ? "" : "move")}
          >
            Change time
          </ReserveQuickActionButton>
        ) : null}
        <ReserveQuickActionButton
          onClick={() => setPanel(panel === "message" ? "" : "message")}
        >
          Message guest
        </ReserveQuickActionButton>
        {!isTerminal ? (
          <ReserveQuickActionButton onClick={() => onStatus(reservation, "cancelled")}>
            Cancel reservation
          </ReserveQuickActionButton>
        ) : null}
        {!isTerminal && reservation.status !== "seated" ? (
          <ReserveQuickActionButton onClick={() => onStatus(reservation, "no_show")}>
            Mark no-show
          </ReserveQuickActionButton>
        ) : null}
      </div>

      {panel === "editContact" ? (
        <form
          onSubmit={submitEditContact}
          className="reserve-soft mt-4 grid gap-3 rounded-2xl p-4 sm:grid-cols-2"
        >
          <label className="text-sm font-bold">
            Phone
            <input
              name="phone"
              inputMode="tel"
              defaultValue={reservation.customer_phone || ""}
              className="mt-1 w-full rounded-xl bg-black/20 px-3 py-2"
            />
          </label>
          <label className="text-sm font-bold">
            Email
            <input
              name="email"
              type="email"
              defaultValue={reservation.customer_email || ""}
              className="mt-1 w-full rounded-xl bg-black/20 px-3 py-2"
            />
          </label>
          <label className="text-sm font-bold sm:col-span-2">
            Guest notes
            <textarea
              name="notes"
              rows={3}
              defaultValue={
                reservation.notes ||
                reservation.special_request ||
                reservation.special_requests ||
                ""
              }
              className="mt-1 w-full rounded-xl bg-black/20 px-3 py-2"
            />
          </label>
          <button
            disabled={busy}
            className="reserve-primary rounded-full px-4 py-2 font-black sm:col-span-2"
          >
            {busy ? "Saving…" : "Save guest details"}
          </button>
        </form>
      ) : null}

      {panel === "move" ? (
        <form
          onSubmit={submitMove}
          className="reserve-soft mt-4 grid gap-3 rounded-2xl p-4 sm:grid-cols-2"
        >
          <label className="text-sm font-bold">
            Date
            <input
              name="date"
              type="date"
              required
              defaultValue={reservation.reservation_date}
              className="mt-1 w-full rounded-xl bg-black/20 px-3 py-2"
            />
          </label>
          <label className="text-sm font-bold">
            Time
            <input
              name="time"
              type="time"
              required
              defaultValue={String(reservation.reservation_time || "").slice(0, 5)}
              className="mt-1 w-full rounded-xl bg-black/20 px-3 py-2"
            />
          </label>
          <label className="text-sm font-bold">
            Reservation length
            <input
              name="duration"
              type="number"
              min="15"
              step="15"
              defaultValue={duration}
              className="mt-1 w-full rounded-xl bg-black/20 px-3 py-2"
            />
            <span className="mt-1 block text-[10px] reserve-muted">minutes</span>
          </label>
          <label className="text-sm font-bold sm:col-span-2">
            Note for your team
            <textarea
              name="reason"
              rows={2}
              defaultValue={reservation.special_request || reservation.notes || ""}
              className="mt-1 w-full rounded-xl bg-black/20 px-3 py-2"
            />
          </label>
          <button
            disabled={busy}
            className="reserve-primary rounded-full px-4 py-2 font-black sm:col-span-2"
          >
            {busy ? "Saving…" : "Save new time"}
          </button>
        </form>
      ) : null}

      {panel === "message" ? (
        <form
          onSubmit={submitMessage}
          className="reserve-soft mt-4 grid gap-3 rounded-2xl p-4"
        >
          <p className="text-sm reserve-muted">
            Send to {reservation.customer_phone || "No phone"} ·{" "}
            {reservation.customer_email || "No email"}
          </p>
          <select
            name="channel"
            defaultValue={
              reservation.customer_phone && reservation.customer_email
                ? "both"
                : reservation.customer_phone
                  ? "sms"
                  : "email"
            }
            className="rounded-xl bg-black/20 px-3 py-2"
          >
            <option value="sms">Text message</option>
            <option value="email">Email</option>
            <option value="both">Text and email</option>
          </select>
          <div className="flex flex-wrap gap-2">
            {messageTemplates.map((template) => (
              <button
                key={template}
                type="button"
                onClick={(event) => {
                  const textarea = event.currentTarget.form?.elements.namedItem(
                    "message",
                  ) as HTMLTextAreaElement | null;
                  if (textarea) textarea.value = template;
                }}
                className="rounded-full border border-white/10 px-3 py-1 text-xs font-bold"
              >
                {template}
              </button>
            ))}
          </div>
          <textarea
            name="message"
            required
            rows={4}
            placeholder="Write a message to the guest…"
            className="rounded-xl bg-black/20 px-3 py-2"
          />
          <button
            disabled={busy}
            className="reserve-primary rounded-full px-4 py-2 font-black"
          >
            {busy ? "Sending…" : "Send message"}
          </button>
        </form>
      ) : null}
    </section>
  );
}
