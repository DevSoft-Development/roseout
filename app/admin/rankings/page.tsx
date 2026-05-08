"use client";

import { useState } from "react";
import AdminTopBar from "@/app/admin/components/AdminTopBar";

export const dynamic = "force-dynamic";

export default function AdminRankingsPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function recalculateRankings() {
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/admin/rankings/recalculate", {
        method: "POST",
      });

      const data = await res.json();
      setResult(data);
    } catch {
      setResult({
        success: false,
        error: "Failed to run ranking engine.",
      });
    }

    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-[#080407] text-white">
      <AdminTopBar />

      <section className="mx-auto max-w-7xl px-6 py-10">
        <p className="text-xs font-black uppercase tracking-[0.35em] text-rose-300">
          TheOutHaven Intelligence
        </p>

        <h1 className="mt-3 text-5xl font-black tracking-tight">
          Ranking Engine
        </h1>

        <p className="mt-4 max-w-2xl text-sm leading-7 text-white/55">
          Recalculate TheOutHaven scores, trend scores, conversion scores, and
          ranking badges from real user activity.
        </p>

        <button
          onClick={recalculateRankings}
          disabled={loading}
          className="mt-8 rounded-full bg-rose-500 px-7 py-3 text-sm font-black text-white shadow-lg shadow-rose-500/25 hover:bg-rose-400 disabled:opacity-50"
        >
          {loading ? "Running Ranking Engine..." : "Run Ranking Engine"}
        </button>

        {result && (
          <div className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.05] p-6">
            <h2 className="text-2xl font-black">
              {result.success ? "Ranking Complete" : "Ranking Result"}
            </h2>

            <pre className="mt-4 overflow-x-auto rounded-2xl bg-black/40 p-4 text-sm text-white/70">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </section>
    </main>
  );
}