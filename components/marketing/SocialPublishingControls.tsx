"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const controls = [
  ["social_publishing_global_pause", "Pause all social publishing"],
  ["social_publishing_pause_instagram", "Pause Instagram"],
  ["social_publishing_pause_facebook", "Pause Facebook"],
  ["social_publishing_pause_tiktok", "Pause TikTok"],
  ["social_publishing_pause_youtube", "Pause YouTube"],
] as const;

export default function SocialPublishingControls({ initial }: { initial: Record<string, boolean> }) {
  const router = useRouter();
  const [settings, setSettings] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function save(next: Record<string, boolean>) {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/marketing/social/publishing-settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not update publishing settings.");
      setMessage("Publishing controls updated.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update publishing settings.");
    } finally {
      setSaving(false);
    }
  }

  function toggle(key: string) {
    const next = { ...settings, [key]: !settings[key] };
    setSettings(next);
    void save({ [key]: next[key] });
  }

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold">Publishing safety controls</h2>
        <p className="mt-1 text-sm text-neutral-500">Pause the entire publisher or one network without disconnecting its OAuth account.</p>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {controls.map(([key, label]) => (
          <button key={key} type="button" disabled={saving} onClick={() => toggle(key)} className={`min-h-16 rounded-xl border px-4 text-left text-sm font-semibold ${settings[key] ? "border-red-300 bg-red-50 text-red-800" : "bg-white text-neutral-900"}`}>
            <span className="block text-xs font-medium uppercase tracking-wide opacity-60">{settings[key] ? "Paused" : "Active"}</span>
            <span className="mt-1 block">{label}</span>
          </button>
        ))}
      </div>
      {message ? <p className="mt-3 text-sm font-medium">{message}</p> : null}
    </section>
  );
}
