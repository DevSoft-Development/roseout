"use client";

import { useState } from "react";

export function WebsitePublishControl({ locationId }: { locationId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function publish() {
    setBusy(true); setMessage("");
    const response = await fetch("/api/business/website", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ location_id: locationId }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setMessage(data?.error || "Unable to publish the website.");
    setMessage(`Published version ${data.version} to ${data.domain}.`);
  }

  return <section className="rounded-3xl border border-rose-200/15 bg-white/[0.04] p-5">
    <h3 className="text-lg font-black">Publish to Lightsail</h3>
    <p className="mt-2 text-sm leading-6 text-white/55">Publishing sends the latest saved version through the signed hosting gateway. A failed deployment does not replace the current live version.</p>
    <button type="button" onClick={publish} disabled={busy} className="mt-4 rounded-full bg-rose-600 px-5 py-3 text-sm font-black disabled:opacity-40">{busy ? "Publishing..." : "Publish website"}</button>
    {message ? <p className="mt-3 text-sm font-bold text-white/70">{message}</p> : null}
  </section>;
}
