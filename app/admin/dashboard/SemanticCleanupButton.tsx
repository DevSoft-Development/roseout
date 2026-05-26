"use client";

import { useState } from "react";

type CleanupState = {
  loading: boolean;
  success?: boolean;
  message?: string;
  processed?: number;
};

export default function SemanticCleanupButton() {
  const [state, setState] = useState<CleanupState>({ loading: false });

  async function runCleanup() {
    setState({ loading: true, message: "Running semantic cleanup..." });

    try {
      const response = await fetch("/api/admin/semantic-nightly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch_size: 50 }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.success === false) {
        throw new Error(data.error || data.failures?.[0]?.error || "Semantic cleanup failed.");
      }

      setState({
        loading: false,
        success: true,
        processed: Number(data.processed || 0),
        message: `Semantic cleanup complete. Processed ${Number(data.processed || 0).toLocaleString()} locations.`,
      });
    } catch (error) {
      setState({
        loading: false,
        success: false,
        message: error instanceof Error ? error.message : "Semantic cleanup failed.",
      });
    }
  }

  return (
    <div className="rounded-[1.5rem] border border-rose-300/20 bg-rose-500/10 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-rose-200">
            Semantic Search
          </p>
          <p className="mt-1 text-sm font-bold text-white/65">
            Refresh embeddings, intent tags, analytics scores, and recommendation scores.
          </p>
        </div>
        <button
          type="button"
          onClick={runCleanup}
          disabled={state.loading}
          className="rounded-full bg-gradient-to-r from-rose-500 to-rose-400 px-5 py-3 text-xs font-black text-white shadow-lg shadow-rose-950/30 transition hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
        >
          {state.loading ? "Running..." : "Run Semantic Cleanup"}
        </button>
      </div>

      {state.message && (
        <p className={`mt-3 text-xs font-bold ${state.success === false ? "text-red-200" : "text-emerald-200"}`}>
          {state.message}
          {typeof state.processed === "number" ? ` Processed count: ${state.processed}.` : ""}
        </p>
      )}
    </div>
  );
}
