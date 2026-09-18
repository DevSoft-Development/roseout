"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PostcardSocialFollowupForm({
  locationId,
  taskId,
  initialInstagram,
  initialFacebook,
  initialTikTok,
}: {
  locationId: string;
  taskId?: string | null;
  initialInstagram?: string | null;
  initialFacebook?: string | null;
  initialTikTok?: string | null;
}) {
  const router = useRouter();
  const [instagram, setInstagram] = useState(initialInstagram || "");
  const [facebook, setFacebook] = useState(initialFacebook || "");
  const [tiktok, setTikTok] = useState(initialTikTok || "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/marketing/postcard-followups/${locationId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          instagram_url: instagram,
          facebook_url: facebook,
          tiktok_url: tiktok,
          task_id: taskId || null,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not save follow-up.");
      setMessage("Verified social accounts saved and the follow-up task was completed.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save follow-up.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">Verified social accounts</h2>
      <p className="mt-1 text-sm text-neutral-500">Search each network, follow the location from the approved TheOutHaven account, then save the exact profile URLs here.</p>
      <div className="mt-5 space-y-4">
        <label className="block space-y-1 text-sm font-medium">Instagram<input className="min-h-12 w-full rounded-xl border px-3 text-base" value={instagram} onChange={(event) => setInstagram(event.target.value)} placeholder="https://instagram.com/..." /></label>
        <label className="block space-y-1 text-sm font-medium">Facebook<input className="min-h-12 w-full rounded-xl border px-3 text-base" value={facebook} onChange={(event) => setFacebook(event.target.value)} placeholder="https://facebook.com/..." /></label>
        <label className="block space-y-1 text-sm font-medium">TikTok<input className="min-h-12 w-full rounded-xl border px-3 text-base" value={tiktok} onChange={(event) => setTikTok(event.target.value)} placeholder="https://tiktok.com/@..." /></label>
      </div>
      {message ? <div className="mt-4 rounded-xl bg-neutral-50 p-3 text-sm font-medium">{message}</div> : null}
      <button type="button" disabled={busy} onClick={() => void save()} className="mt-5 min-h-12 rounded-xl bg-neutral-950 px-5 font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save & Complete Follow-up"}</button>
    </section>
  );
}
