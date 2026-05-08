"use client";

import { useState } from "react";

export default function ReviewsPage() {
  const [reviewText, setReviewText] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [locationId, setLocationId] = useState("");
  const [rating, setRating] = useState(5);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setLoading(true);
    setResult(null);
    setError("");

    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          location_id: locationId,
          customer_name: customerName || "Guest",
          rating,
          review_text: reviewText,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Review could not be submitted.");
      }

      setResult(data);
      setReviewText("");
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#120607] px-4 py-10 text-white">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 rounded-3xl border border-red-900/40 bg-black/40 p-6 shadow-2xl">
          <p className="mb-2 text-sm uppercase tracking-[0.3em] text-red-300">
            TheOutHaven Review AI
          </p>

          <h1 className="text-3xl font-bold md:text-5xl">
            Review Intelligence Tester
          </h1>

          <p className="mt-3 text-sm text-white/70">
            Submit a review and TheOutHaven will analyze the vibe, service, food,
            noise level, date-night fit, keywords, and score boost.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-red-900/40 bg-[#1a090b] p-6 shadow-xl"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm text-white/70">
                Location ID
              </label>
              <input
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                placeholder="Paste restaurant/location id"
                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none focus:border-red-400"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-white/70">
                Customer Name
              </label>
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Guest"
                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none focus:border-red-400"
              />
            </div>
          </div>

          <div className="mt-5">
            <label className="mb-2 block text-sm text-white/70">
              Rating
            </label>
            <select
              value={rating}
              onChange={(e) => setRating(Number(e.target.value))}
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none focus:border-red-400"
            >
              <option value={5}>5 — Amazing</option>
              <option value={4}>4 — Good</option>
              <option value={3}>3 — Okay</option>
              <option value={2}>2 — Bad</option>
              <option value={1}>1 — Terrible</option>
            </select>
          </div>

          <div className="mt-5">
            <label className="mb-2 block text-sm text-white/70">
              Review
            </label>

            <textarea
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              placeholder="Example: The restaurant was beautiful and romantic, the food was amazing, but the music was a little loud."
              rows={7}
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none focus:border-red-400"
            />
          </div>

          {error && (
            <p className="mt-4 rounded-2xl border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-100">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-6 w-full rounded-2xl bg-red-700 px-5 py-4 font-semibold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Analyzing Review..." : "Submit Review"}
          </button>
        </form>

        {result && (
          <section className="mt-8 rounded-3xl border border-red-900/40 bg-black/40 p-6">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-red-300">
                  Saved Successfully
                </p>
                <h2 className="text-2xl font-bold">Review Score Updated</h2>
              </div>

              <div className="rounded-2xl bg-red-700 px-5 py-3 text-center">
                <p className="text-xs text-white/70">Review Score</p>
                <p className="text-2xl font-bold">{result.review_score}</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <InfoCard label="Review Count" value={String(result.review_count)} />
              <InfoCard label="Location ID" value={String(result.location_id)} />
              <InfoCard label="Success" value={result.success ? "Yes" : "No"} />
            </div>

            {Array.isArray(result.keywords) && result.keywords.length > 0 && (
              <div className="mt-6">
                <h3 className="mb-3 text-lg font-semibold">Keywords</h3>
                <div className="flex flex-wrap gap-2">
                  {result.keywords.map((word: string, index: number) => (
                    <span
                      key={`${word}-${index}`}
                      className="rounded-full border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-100"
                    >
                      {word}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {result.ai && (
              <>
                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  <InfoCard label="Sentiment" value={result.ai.sentiment} />
                  <InfoCard label="Vibe" value={result.ai.vibe} />
                  <InfoCard label="Noise" value={result.ai.noise_level} />
                  <InfoCard label="Service" value={result.ai.service_quality} />
                  <InfoCard label="Food" value={result.ai.food_quality} />
                  <InfoCard
                    label="Ambiance"
                    value={result.ai.ambiance_quality}
                  />
                  <InfoCard label="Price" value={result.ai.price_feeling} />
                  <InfoCard label="Wait" value={result.ai.wait_time} />
                  <InfoCard
                    label="Boost"
                    value={`${result.ai.score_boost > 0 ? "+" : ""}${
                      result.ai.score_boost
                    }`}
                  />
                </div>
              </>
            )}

            <pre className="mt-6 overflow-auto rounded-2xl bg-black p-4 text-xs text-white/70">
              {JSON.stringify(result, null, 2)}
            </pre>
          </section>
        )}
      </div>
    </main>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#220c0f] p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-white/40">
        {label}
      </p>
      <p className="mt-2 break-words font-semibold capitalize text-white">
        {value}
      </p>
    </div>
  );
}