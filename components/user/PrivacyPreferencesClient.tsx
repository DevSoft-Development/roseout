"use client";

import { useState } from "react";

export default function PrivacyPreferencesClient({
  initialEnabled,
}: {
  initialEnabled: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function update(next: boolean) {
    if (saving) return;
    const previous = enabled;
    setEnabled(next);
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/user/privacy-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personalizationEnabled: next }),
      });
      if (!response.ok) throw new Error("update_failed");
      setMessage(next ? "Personalized recommendations are on." : "Personalized recommendations are off.");
    } catch {
      setEnabled(previous);
      setMessage("We couldn’t update this setting. Your previous choice is unchanged.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-2xl">
          <h2 className="text-xl font-black text-white">Personalized recommendations</h2>
          <p className="mt-2 text-sm leading-6 text-white/60">
            Allow prior saves, clicks, reservations, and completed OUTings to improve future suggestions.
          </p>
          <p className="mt-2 text-xs leading-5 text-white/40">
            Turning this off stops prior account activity from being used for search personalization. Search still works normally.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={saving}
          onClick={() => void update(!enabled)}
          className={`relative h-12 w-24 shrink-0 rounded-full border transition ${enabled ? "border-emerald-300/40 bg-emerald-500/20" : "border-white/15 bg-white/[0.05]"} disabled:opacity-50`}
        >
          <span className={`absolute top-1.5 h-8 w-8 rounded-full bg-white transition ${enabled ? "left-[3.55rem]" : "left-1.5"}`} />
          <span className="sr-only">{enabled ? "Turn off personalization" : "Turn on personalization"}</span>
        </button>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className={`rounded-full px-3 py-1 text-xs font-black ${enabled ? "bg-emerald-500/15 text-emerald-200" : "bg-white/[0.06] text-white/55"}`}>
          {enabled ? "On" : "Off"}
        </span>
        {saving ? <span className="text-xs font-bold text-white/40">Saving…</span> : null}
        {message ? <span className="text-xs font-semibold text-white/55">{message}</span> : null}
      </div>
    </div>
  );
}
