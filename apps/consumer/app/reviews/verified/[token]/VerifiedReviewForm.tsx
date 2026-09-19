"use client";

import { Star } from "lucide-react";
import { useState } from "react";

function RatingPicker({ value, onChange, label }: { value: number; onChange: (value: number) => void; label: string }) {
  return (
    <div>
      <p className="text-sm font-black text-white">{label}</p>
      <div className="mt-2 flex gap-2" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((score) => (
          <button
            key={score}
            type="button"
            role="radio"
            aria-checked={value === score}
            aria-label={`${score} star${score === 1 ? "" : "s"}`}
            onClick={() => onChange(score)}
            className={`grid h-11 w-11 place-items-center rounded-xl border transition ${score <= value ? "border-rose-300/45 bg-rose-500/15 text-rose-200" : "border-white/10 bg-white/[0.035] text-white/25 hover:text-white/60"}`}
          >
            <Star className={`h-5 w-5 ${score <= value ? "fill-current" : ""}`} />
          </button>
        ))}
      </div>
    </div>
  );
}

export function VerifiedReviewForm({ token, locationId, locationName = "this location" }: { token: string; locationId: string; locationName?: string }) {
  const [name, setName] = useState("");
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [platformRating, setPlatformRating] = useState(5);
  const [platformFeedback, setPlatformFeedback] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reviewToken: token,
        location_id: locationId,
        customer_name: name,
        rating,
        review_text: text,
        platform_rating: platformRating,
        platform_feedback: platformFeedback,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setMessage(data.message || data.error || "Review could not be submitted.");
      return;
    }
    setSubmitted(true);
    setMessage("Thanks — your verified review was submitted for moderation.");
  }

  if (submitted) {
    return (
      <div className="mt-8 rounded-2xl border border-emerald-300/20 bg-emerald-500/10 p-5">
        <p className="font-black text-emerald-100">Thank you for the feedback.</p>
        <p className="mt-1 text-sm leading-6 text-white/60">Your location review is in moderation, and your TheOutHaven experience feedback was recorded with it.</p>
      </div>
    );
  }

  return (
    <form className="mt-8 grid gap-6" onSubmit={submit}>
      <section className="rounded-2xl border border-white/10 bg-black/20 p-4 sm:p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200">The place</p>
        <h2 className="mt-1 text-xl font-black text-white">How was {locationName}?</h2>
        <div className="mt-5 grid gap-5">
          <RatingPicker value={rating} onChange={setRating} label={`Rate ${locationName}`} />
          <label className="grid gap-2 text-sm font-bold text-white">
            Tell us about the location
            <textarea
              className="min-h-32 rounded-xl border border-white/10 bg-black/35 p-3 text-white outline-none placeholder:text-white/30 focus:border-rose-300/50 focus:ring-4 focus:ring-rose-300/10"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What stood out? How was the food, service, activity, atmosphere, or value?"
              required
            />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-rose-300/15 bg-rose-500/[0.055] p-4 sm:p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200">TheOutHaven</p>
        <h2 className="mt-1 text-xl font-black text-white">How was the planning and booking experience?</h2>
        <div className="mt-5 grid gap-5">
          <RatingPicker value={platformRating} onChange={setPlatformRating} label="Rate your TheOutHaven experience" />
          <label className="grid gap-2 text-sm font-bold text-white">
            Anything we should improve? <span className="font-semibold text-white/40">Optional</span>
            <textarea
              className="min-h-24 rounded-xl border border-white/10 bg-black/35 p-3 text-white outline-none placeholder:text-white/30 focus:border-rose-300/50 focus:ring-4 focus:ring-rose-300/10"
              value={platformFeedback}
              onChange={(e) => setPlatformFeedback(e.target.value)}
              placeholder="Search results, planning flow, reminders, reservations, or anything else."
              maxLength={2000}
            />
          </label>
        </div>
      </section>

      <label className="grid gap-2 text-sm font-bold text-white">
        Your name <span className="font-semibold text-white/40">Optional</span>
        <input className="rounded-xl border border-white/10 bg-black/30 p-3 text-white outline-none focus:border-rose-300/50 focus:ring-4 focus:ring-rose-300/10" value={name} onChange={(e) => setName(e.target.value)} />
      </label>

      <button disabled={loading} className="min-h-12 rounded-xl bg-rose-500 px-6 py-3 font-black text-white shadow-lg shadow-rose-950/25 transition hover:bg-rose-400 disabled:opacity-60">
        {loading ? "Submitting…" : "Submit feedback"}
      </button>
      {message ? <p className="text-sm font-bold text-white/70">{message}</p> : null}
    </form>
  );
}
