"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Action = "enrich" | "repair" | "approve";

export default function PublishabilityRepairButton({
  locationId,
  eligible,
}: {
  locationId: string;
  eligible: boolean;
}) {
  const router = useRouter();
  const [busyAction, setBusyAction] = useState<Action | null>(null);
  const [msg, setMsg] = useState("");

  async function run(action: Action) {
    setBusyAction(action);
    setMsg("");
    try {
      const isEnrichment = action === "enrich";
      const response = await fetch(
        isEnrichment
          ? "/api/admin/locations/google-enrichment/single"
          : "/api/admin/locations/repair-publishability",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            isEnrichment ? { locationId } : { action, locationId },
          ),
        },
      );
      const data = await response.json().catch(() => ({}));
      setMsg(
        data.message ||
          (data.success
            ? isEnrichment
              ? "Google enrichment completed for this location."
              : "Updated publishability."
            : data.error || "Action failed"),
      );
      if (response.ok && data.success !== false) router.refresh();
    } catch {
      setMsg(
        action === "enrich"
          ? "Google enrichment failed for this location."
          : "The publishability request failed.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  const busy = busyAction !== null;

  return (
    <div className="flex max-w-xl flex-wrap items-center justify-end gap-2">
      <button
        disabled={busy}
        onClick={() => run("enrich")}
        className="rounded-full bg-blue-600 px-4 py-2 text-xs font-black text-white transition hover:bg-blue-500 disabled:opacity-50"
      >
        {busyAction === "enrich" ? "Enriching this location…" : "Run Google enrichment"}
      </button>
      <button
        disabled={busy}
        onClick={() => run("repair")}
        className="rounded-full border border-white/10 px-4 py-2 text-xs font-black text-white/80 disabled:opacity-50"
      >
        {busyAction === "repair" ? "Repairing…" : "Repair publishability"}
      </button>
      {eligible ? (
        <button
          disabled={busy}
          onClick={() => run("approve")}
          className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50"
        >
          {busyAction === "approve" ? "Approving…" : "Approve for search"}
        </button>
      ) : (
        <button
          disabled
          className="rounded-full bg-white/10 px-4 py-2 text-xs font-black text-white/40"
        >
          Needs Fix
        </button>
      )}
      {msg ? (
        <span className="basis-full text-right text-xs font-bold leading-5 text-white/70">
          {msg}
        </span>
      ) : null}
    </div>
  );
}
