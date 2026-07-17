"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function PublishabilityRepairButton({
  locationId,
  eligible,
}: {
  locationId: string;
  eligible: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function run(action: "repair" | "approve") {
    setBusy(true);
    setMsg("");
    try {
      const response = await fetch("/api/admin/locations/repair-publishability", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, locationId }),
      });
      const data = await response.json();
      setMsg(
        data.message ||
          (data.success
            ? "Updated publishability."
            : data.error || "Action failed"),
      );
      router.refresh();
    } catch {
      setMsg("The publishability repair request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        disabled={busy}
        onClick={() => run("repair")}
        className="rounded-full border border-white/10 px-4 py-2 text-xs font-black text-white/80 disabled:opacity-50"
      >
        Repair publishability for this location
      </button>
      {eligible ? (
        <button
          disabled={busy}
          onClick={() => run("approve")}
          className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50"
        >
          Approve for search
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
        <span className="max-w-xl text-xs font-bold text-white/70">{msg}</span>
      ) : null}
    </div>
  );
}
