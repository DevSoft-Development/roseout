"use client";

import { CheckCircle2, MapPin, XCircle } from "lucide-react";
import { useState } from "react";

type Stop = { name: string; detail?: string | null };

export default function AttendanceConfirm({ token, title, stops, existingReviewUrl }: { token: string; title: string; stops: Stop[]; existingReviewUrl?: string | null }) {
  const [loading, setLoading] = useState<"went" | "did_not_go" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(Boolean(existingReviewUrl));
  const [reviewUrl, setReviewUrl] = useState<string | null>(existingReviewUrl || null);

  async function answer(action: "went" | "did_not_go") {
    setLoading(action);
    setMessage(null);
    try {
      const response = await fetch(`/api/outings/confirm/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "We could not save your response.");
      if (action === "went" && payload.reviewUrl) {
        setReviewUrl(payload.reviewUrl);
        window.location.assign(payload.reviewUrl);
        return;
      }
      setDone(true);
      setMessage("Thanks for letting us know. We won’t ask you to review this outing.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "We could not save your response.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#12070a] px-4 py-8 text-white sm:px-6 sm:py-12">
      <section className="mx-auto max-w-2xl overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(244,63,94,0.14),transparent_38%),rgba(255,255,255,0.04)] p-5 shadow-2xl shadow-black/25 sm:p-8">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-rose-200">TheOutHaven follow-up</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Did you make it to your outing?</h1>
        <p className="mt-3 text-sm leading-6 text-white/60">We’ll only open reviews if you actually went. This keeps location feedback tied to real visits.</p>

        <div className="mt-6 rounded-2xl border border-white/10 bg-black/25 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">Your plan</p>
          <p className="mt-2 text-lg font-black text-white">{title}</p>
          <div className="mt-3 space-y-2">
            {stops.map((stop, index) => (
              <div key={`${stop.name}-${index}`} className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-rose-200" />
                <div className="min-w-0"><p className="truncate text-sm font-black text-white">{stop.name}</p>{stop.detail ? <p className="truncate text-xs text-white/40">{stop.detail}</p> : null}</div>
              </div>
            ))}
          </div>
        </div>

        {reviewUrl ? (
          <div className="mt-6 rounded-2xl border border-emerald-300/20 bg-emerald-500/10 p-4">
            <p className="font-black text-emerald-100">Attendance already confirmed.</p>
            <a href={reviewUrl} className="mt-3 inline-flex min-h-11 items-center justify-center rounded-xl bg-rose-500 px-4 text-sm font-black text-white">Continue to review</a>
          </div>
        ) : done ? (
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm font-bold text-white/70">{message}</div>
        ) : (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button disabled={Boolean(loading)} type="button" onClick={() => void answer("went")} className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-rose-500 px-5 text-base font-black text-white shadow-lg shadow-rose-950/25 transition hover:bg-rose-400 disabled:opacity-50"><CheckCircle2 className="h-5 w-5" /> {loading === "went" ? "Saving…" : "Yes, I went"}</button>
            <button disabled={Boolean(loading)} type="button" onClick={() => void answer("did_not_go")} className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-5 text-base font-black text-white/70 transition hover:text-white disabled:opacity-50"><XCircle className="h-5 w-5" /> {loading === "did_not_go" ? "Saving…" : "No, I didn’t go"}</button>
          </div>
        )}

        {message && !done ? <p className="mt-4 rounded-xl border border-rose-300/20 bg-rose-500/10 px-3 py-2 text-sm font-bold text-rose-100">{message}</p> : null}
      </section>
    </main>
  );
}
