"use client";

import { useState } from "react";

type FeedbackState = {
  rating: number;
  matched_vibe: boolean;
  would_go_again: boolean;
  feedback: string;
};

export function CompleteOutingModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (feedback: FeedbackState) => Promise<void>;
}) {
  const [feedback, setFeedback] = useState<FeedbackState>({
    rating: 5,
    matched_vibe: true,
    would_go_again: true,
    feedback: "",
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#121212] p-4 sm:p-5">
        <h4 className="text-lg font-black text-white">Complete Your Outing</h4>

        <div className="mt-3 space-y-3 text-sm font-bold text-white/85">
          <label className="block">
            Rating (1-5)
            <input
              type="number"
              min={1}
              max={5}
              value={feedback.rating}
              onChange={(e) =>
                setFeedback((prev) => ({ ...prev, rating: Number(e.target.value) }))
              }
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-3"
            />
          </label>

          <label className="block">
            Did this match your vibe?
            <select
              value={feedback.matched_vibe ? "yes" : "no"}
              onChange={(e) =>
                setFeedback((prev) => ({ ...prev, matched_vibe: e.target.value === "yes" }))
              }
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-3"
            >
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>

          <label className="block">
            Would you go again?
            <select
              value={feedback.would_go_again ? "yes" : "no"}
              onChange={(e) =>
                setFeedback((prev) => ({ ...prev, would_go_again: e.target.value === "yes" }))
              }
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-3"
            >
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>

          <textarea
            placeholder="Optional feedback"
            value={feedback.feedback}
            onChange={(e) => setFeedback((prev) => ({ ...prev, feedback: e.target.value }))}
            className="min-h-24 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-3"
          />
        </div>

        {success ? <p className="mt-3 text-xs font-bold text-emerald-300">Outing completed 🎉</p> : null}

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            className="w-full rounded-full bg-[#e1062a] px-4 py-3 text-sm font-black text-white disabled:opacity-70"
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              await onSubmit(feedback);
              setSuccess(true);
              setLoading(false);
              onClose();
            }}
          >
            {loading ? "Submitting..." : "Submit"}
          </button>
          <button
            className="w-full rounded-full border border-white/20 px-4 py-3 text-sm font-black text-white"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
