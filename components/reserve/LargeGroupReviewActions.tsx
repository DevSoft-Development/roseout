"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  reservationId: string;
  locationId: string;
  locationType: string;
  adminLocationId?: string;
  currentStatus: string;
  currentSpecialRequest?: string | null;
};

const REVIEW_MARKER = "[Large group review: more information needed]";

export default function LargeGroupReviewActions({
  reservationId,
  locationId,
  locationType,
  adminLocationId,
  currentStatus,
  currentSpecialRequest,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<"approve" | "reject" | "more_info" | "">("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const moreInfoNeeded = String(currentSpecialRequest || "").includes(REVIEW_MARKER);

  async function submit(action: "approve" | "reject" | "more_info") {
    setBusy(action);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        "/api/reserve/portal/reservations/large-group-review",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reservation_id: reservationId,
            location_id: locationId,
            location_type: locationType,
            adminLocationId: adminLocationId || undefined,
            action,
          }),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "We could not update this large-party reservation.");
      }

      if (action === "approve") {
        const email = data.notifications?.email === "sent";
        const text = data.notifications?.sms === "sent";
        setNotice(
          currentStatus === "confirmed"
            ? `Confirmation resent${
                email && text
                  ? " by email and text"
                  : email
                    ? " by email"
                    : text
                      ? " by text"
                      : ""
              }.`
            : `Reservation approved${
                email && text
                  ? " and confirmations sent by email and text"
                  : email
                    ? " and an email confirmation was sent"
                    : text
                      ? " and a text confirmation was sent"
                      : ""
              }.`,
        );
      } else if (action === "reject") {
        setNotice("Reservation declined.");
      } else {
        setNotice("Waiting for more information from the guest.");
      }

      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "We could not update this large-party reservation.",
      );
    } finally {
      setBusy("");
    }
  }

  const finalStatus = ["declined", "cancelled", "completed", "no_show"].includes(
    currentStatus,
  );

  return (
    <div className="min-w-[250px]">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={Boolean(busy) || finalStatus}
          onClick={() => submit("approve")}
          className="rounded-full bg-emerald-500/15 px-3 py-1.5 text-xs font-black text-emerald-200 ring-1 ring-emerald-400/30 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {busy === "approve"
            ? currentStatus === "confirmed"
              ? "Resending…"
              : "Approving…"
            : currentStatus === "confirmed"
              ? "Resend confirmation"
              : "Approve reservation"}
        </button>
        <button
          type="button"
          disabled={
            Boolean(busy) ||
            currentStatus === "declined" ||
            currentStatus === "confirmed"
          }
          onClick={() => submit("reject")}
          className="rounded-full bg-red-500/15 px-3 py-1.5 text-xs font-black text-red-200 ring-1 ring-red-400/30 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {busy === "reject"
            ? "Declining…"
            : currentStatus === "declined"
              ? "Declined"
              : "Decline"}
        </button>
        <button
          type="button"
          disabled={
            Boolean(busy) || finalStatus || currentStatus === "confirmed" || moreInfoNeeded
          }
          onClick={() => submit("more_info")}
          className="rounded-full border border-[#e1062a]/25 bg-[#e1062a]/10 px-3 py-1.5 text-xs font-black text-[#ff8aa0] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {busy === "more_info" ? "Saving…" : "Request more information"}
        </button>
      </div>
      {notice ? (
        <p className="mt-2 text-xs font-bold text-emerald-200">{notice}</p>
      ) : null}
      {error ? <p className="mt-2 text-xs font-bold text-red-300">{error}</p> : null}
    </div>
  );
}

export { REVIEW_MARKER };
