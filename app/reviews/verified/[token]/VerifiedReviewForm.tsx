"use client";

import { useState } from "react";

export function VerifiedReviewForm({ token, locationId }: { token: string; locationId: string }) {
  const [name, setName] = useState("");
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewToken: token, location_id: locationId, customer_name: name, rating, review_text: text }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setMessage(data.message || data.error || "Review could not be submitted.");
      return;
    }
    setText("");
    setMessage("Thanks — your review was submitted for moderation.");
  }

  return (
    <form className="mt-8 grid gap-4" onSubmit={submit}>
      <label className="grid gap-2 text-sm font-bold">Name optional<input className="rounded-xl border border-white/10 bg-black/30 p-3" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="grid gap-2 text-sm font-bold">Rating<input className="rounded-xl border border-white/10 bg-black/30 p-3" type="number" min="1" max="5" value={rating} onChange={(e) => setRating(Number(e.target.value))} /></label>
      <label className="grid gap-2 text-sm font-bold">Review<textarea className="min-h-36 rounded-xl border border-white/10 bg-black/30 p-3" value={text} onChange={(e) => setText(e.target.value)} placeholder="Tell us what worked, what didn’t, and who this place is best for." /></label>
      <button disabled={loading} className="rounded-full bg-rose-500 px-6 py-4 font-black disabled:opacity-60">Submit review</button>
      {message ? <p className="text-sm text-white/70">{message}</p> : null}
    </form>
  );
}
