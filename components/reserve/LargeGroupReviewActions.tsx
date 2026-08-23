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

function withoutReviewMarker(value: string) {
  return value
    .split("\n")
    .filter((line) => line.trim() !== REVIEW_MARKER)
    .join("\n")
    .trim();
}

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

  const moreInfoNeeded = String(currentSpecialRequest || "").includes(REVIEW_MARKER);

  async function submit(action: "approve" | "reject" | "more_info") {
    setBusy(action);
    setError("");

    try {
      const body: Record<string, unknown> = {
        reservation_id: reservationId,
        location_id: locationId,
        location_type: locationType,
        adminLocationId: adminLocationId || undefined,
      };

      if (action === "approve") body.status = "confirmed";
      if (action === "reject") body.status = "declined";
      if (action === "more_info") {
        const existing = withoutReviewMarker(String(currentSpecialRequest || ""));
        body.notes = [existing, REVIEW_MARKER].filter(Boolean).join("\n");
      }

      const response = await fetch("/api/reserve/portal/reservations/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to update this group booking.");

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update this group booking.");
    } finally {
      setBusy("");
    }
  }

  const finalStatus = ["confirmed", "declined", "cancelled", "completed", "no_show"].includes(currentStatus);

  return (
    <div className="min-w-[250px]">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={Boolean(busy) || currentStatus === "confirmed"}
          onClick={() => submit("approve")}
          className="rounded-full bg-emerald-500/15 px-3 py-1.5 text-xs font-black text-emerald-200 ring-1 ring-emerald-400/30 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {busy === "approve" ? "Approving…" : currentStatus === "confirmed" ? "Approved" : "Approve"}
        </button>
        <button
          type="button"
          disabled={Boolean(busy) || currentStatus === "declined"}
          onClick={() => submit("reject")}
          className="rounded-full bg-red-500/15 px-3 py-1.5 text-xs font-black text-red-200 ring-1 ring-red-400/30 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {busy === "reject" ? "Rejecting…" : currentStatus === "declined" ? "Rejected" : "Reject"}
        </button>
        <button
          type="button"
          disabled={Boolean(busy) || finalStatus || moreInfoNeeded}
          onClick={() => submit("more_info")}
          className="rounded-full bg-amber-500/15 px-3 py-1.5 text-xs font-black text-amber-100 ring-1 ring-amber-400/30 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {busy === "more_info" ? "Saving…" : moreInfoNeeded ? "More info needed" : "More info needed"}
        </button>
      </div>
      {error ? <p className="mt-2 text-xs font-bold text-red-300">{error}</p> : null}
    </div>
  );
}

export { REVIEW_MARKER };
