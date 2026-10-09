"use client";

import { useState } from "react";

export default function CrmCallButton({
  locationId,
  callHref,
  phone,
}: {
  locationId: string;
  callHref: string;
  phone: string;
}) {
  const [starting, setStarting] = useState(false);

  async function startCall() {
    if (starting) return;
    setStarting(true);
    try {
      await fetch("/api/admin/crm/calls/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId, phone }),
        keepalive: true,
      });
    } catch {
      // Do not block the user's call if activity logging is temporarily unavailable.
    } finally {
      window.location.href = callHref;
      window.setTimeout(() => setStarting(false), 1500);
    }
  }

  return (
    <button
      type="button"
      onClick={startCall}
      disabled={starting}
      className="rounded-full bg-rose-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-rose-950/30 disabled:opacity-60"
    >
      {starting ? "Opening 3CX…" : "Call now"}
    </button>
  );
}
