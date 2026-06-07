"use client";

import { useState } from "react";

export function ConfirmClient({ token }: { token: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [reviewUrl, setReviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(action: "went" | "did_not_go") {
    setLoading(true);
    setMessage(null);
    const res = await fetch(`/api/outings/confirm/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setMessage(data.message || data.error || "We could not save your response.");
      return;
    }
    if (action === "went") {
      setMessage("Thanks for letting us know. Want to share how everything went?");
      setReviewUrl(data.reviewUrl || null);
    } else {
      setMessage("Thanks for letting us know.");
    }
  }

  return (
    <div className="mt-8 grid gap-3">
      <button disabled={loading} onClick={() => submit("went")} className="rounded-full bg-rose-500 px-6 py-4 font-black disabled:opacity-60">I went</button>
      <button disabled={loading} onClick={() => submit("did_not_go")} className="rounded-full border border-white/15 px-6 py-4 font-black disabled:opacity-60">I didn’t make it</button>
      <a className="rounded-full border border-white/15 px-6 py-4 font-black" href="/create">View my plan</a>
      {message ? <p className="mt-4 text-white/80">{message}</p> : null}
      {reviewUrl ? <a className="rounded-full bg-white px-6 py-4 font-black text-black" href={reviewUrl}>Leave a review</a> : null}
    </div>
  );
}
