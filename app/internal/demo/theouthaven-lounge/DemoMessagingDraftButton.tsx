"use client";

import { useState } from "react";

export default function DemoMessagingDraftButton({
  locationId,
}: {
  locationId: string;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function createDraft() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/business/messaging/campaigns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          locationId,
          adminLocationId: locationId,
          demoLocationId: locationId,
          type: "restaurant",
          demo: true,
          fromDemoCenter: true,
          channel: "email",
          name: "TheOutHaven Lounge demo campaign",
          subject: "Demo campaign preview",
          body: "This is a safe TheOutHaven Lounge campaign draft created through the production messaging pipeline. It must never send to real recipients.",
        }),
      });
      const json = await response.json().catch(() => ({}));
      setMessage(
        json.message ||
          (response.ok ? "Demo campaign draft created." : "Campaign draft failed."),
      );
    } catch {
      setMessage("Campaign draft failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={createDraft}
        disabled={busy}
        className="inline-flex rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-sm font-black text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-50"
      >
        {busy ? "Creating draft…" : "Create safe campaign draft"}
      </button>
      {message ? (
        <p className="mt-2 text-xs font-bold text-white/55">{message}</p>
      ) : null}
    </div>
  );
}
