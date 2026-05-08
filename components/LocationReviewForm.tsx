"use client";

import { useRef, useState } from "react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";

type LocationReviewFormProps = {
  locationId: string;
  locationName?: string;
  onReviewSubmitted?: (data: any) => void;
};

const ratingOptions = [
  { value: 5, label: "🌸🌸🌸🌸🌸 Amazing" },
  { value: 4, label: "🌸🌸🌸🌸 Great" },
  { value: 3, label: "🌸🌸🌸 Good" },
  { value: 2, label: "🌸🌸 Okay" },
  { value: 1, label: "🌸 Not good" },
];

export default function LocationReviewForm({
  locationId,
  locationName = "this location",
  onReviewSubmitted,
}: LocationReviewFormProps) {
  const turnstileRef = useRef<TurnstileInstance>(null);

  const [customerName, setCustomerName] = useState("");
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState("");

  async function submitReview(e: React.FormEvent) {
    e.preventDefault();

    if (submitted) return;

    setMessage("");

    if (reviewText.trim().length < 30) {
      setMessage("Please type your review in full sentences with more detail.");
      return;
    }

    if (!turnstileToken) {
      setMessage("Please complete the verification before submitting.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          location_id: locationId,
          customer_name: customerName || "TheOutHaven Guest",
          rating,
          review_text: reviewText,
          turnstileToken,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.error || "Something went wrong.");
        turnstileRef.current?.reset();
        setTurnstileToken("");
        setLoading(false);
        return;
      }

      setMessage("Thank you — your review helped update this TheOutHaven score.");

      onReviewSubmitted?.({
        ...data,
        customer_name: customerName || "TheOutHaven Guest",
        rating,
        review_text: reviewText,
      });

      setCustomerName("");
      setRating(5);
      setReviewText("");
      setTurnstileToken("");
      setSubmitted(true);
      turnstileRef.current?.reset();
    } catch {
      setMessage("Something went wrong. Please try again.");
      turnstileRef.current?.reset();
      setTurnstileToken("");
    }

    setLoading(false);
  }

  return (
    <form
      onSubmit={submitReview}
      className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#100607] shadow-2xl"
    >
      <div className="border-b border-white/10 bg-gradient-to-r from-red-950/70 via-black to-black px-6 py-5">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-red-300">
          TheOutHaven Review
        </p>

        <h3 className="mt-2 text-3xl font-black tracking-tight text-white">
          Review {locationName}
        </h3>

        <p className="mt-2 text-sm leading-6 text-white/60">
          Type in full sentences. Tell us about the food, service, music,
          atmosphere, wait time, and whether it worked for a date night.
        </p>
      </div>

      <div className="space-y-4 p-6">
        <input
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          placeholder="Your name (optional)"
          disabled={submitted}
          className="w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-red-400"
        />

        <select
          value={rating}
          onChange={(e) => setRating(Number(e.target.value))}
          disabled={submitted}
          className="w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-bold text-white outline-none transition focus:border-red-400"
        >
          {ratingOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <textarea
          value={reviewText}
          onChange={(e) => setReviewText(e.target.value)}
          required
          minLength={30}
          rows={6}
          disabled={submitted}
          placeholder="Example: The restaurant felt romantic and upscale, the food was amazing, and the service was friendly. The music was a little loud, but it still felt perfect for a fun date night."
          className="w-full rounded-2xl border border-white/10 bg-black px-4 py-4 text-sm leading-6 text-white outline-none transition placeholder:text-white/35 focus:border-red-400"
        />

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <p className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-white/40">
            Verification
          </p>

          {process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ? (
            <Turnstile
              ref={turnstileRef}
              siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
              options={{
                theme: "dark",
                size: "normal",
              }}
              onSuccess={(token) => setTurnstileToken(token)}
              onExpire={() => setTurnstileToken("")}
              onError={() => {
                setTurnstileToken("");
                setMessage("Verification failed. Please try again.");
              }}
            />
          ) : (
            <p className="text-sm text-red-200">
              Missing NEXT_PUBLIC_TURNSTILE_SITE_KEY.
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading || submitted || !turnstileToken}
          className="w-full rounded-full bg-white px-6 py-4 text-sm font-black text-black shadow-xl transition hover:bg-red-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitted
            ? "Review Submitted ✓"
            : loading
              ? "Submitting..."
              : "Submit Review"}
        </button>

        {message && (
          <p className="rounded-2xl border border-white/10 bg-black/50 px-4 py-3 text-sm leading-6 text-white/70">
            {message}
          </p>
        )}
      </div>
    </form>
  );
}