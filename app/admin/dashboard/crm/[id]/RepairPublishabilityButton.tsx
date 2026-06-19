"use client";

import { useState } from "react";

export default function RepairPublishabilityButton({ locationId }: { locationId: string }) {
  const [status, setStatus] = useState<"idle" | "repairing" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function repair() {
    setStatus("repairing");
    setMessage(null);

    const response = await fetch(`/api/admin/locations/${locationId}/repair-publishability`, {
      method: "POST",
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.ok) {
      setStatus("error");
      setMessage(data.error || "Repair failed.");
      return;
    }

    setStatus("done");
    setMessage("Publishability repaired. Refreshing...");
    window.location.reload();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={repair}
        disabled={status === "repairing"}
        className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-black text-white/75 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === "repairing" ? "Repairing..." : "Repair publishability for this location"}
      </button>
      {message ? (
        <p className={`text-xs font-bold ${status === "error" ? "text-rose-200" : "text-emerald-200"}`}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
