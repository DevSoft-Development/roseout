"use client";

import { useState } from "react";
import { FriendlyKeyValueList, JsonDeveloperDetails } from "@/components/admin/FriendlyJsonView";

export const dynamic = "force-dynamic";

export default function AdminSearchQaPage() {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<any>(null);

  async function runSearchQa() {
    setLoading(true);
    setReport(null);

    try {
      const res = await fetch("/api/admin/search-qa", { method: "POST" });
      const data = await res.json();
      setReport(data);
    } catch {
      setReport({ success: false, error: "Failed to run search QA." });
    }

    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-[#080407] px-6 py-10 text-white">
      <section className="mx-auto max-w-7xl">
        <p className="text-xs font-black uppercase tracking-[0.35em] text-rose-300">TheOutHaven Intelligence</p>
        <h1 className="mt-3 text-5xl font-black tracking-tight">Search QA Report</h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-white/60">
          Run semantic + rules + analytics ranking checks across key intent combinations.
          Use this report to quickly identify false positives and rule-tuning opportunities.
        </p>

        <button
          onClick={runSearchQa}
          disabled={loading}
          className="mt-8 rounded-full bg-rose-500 px-7 py-3 text-sm font-black text-white shadow-lg shadow-rose-500/25 hover:bg-rose-400 disabled:opacity-50"
        >
          {loading ? "Running Search QA..." : "Run Search QA"}
        </button>

        {report && (
          <div className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.05] p-6">
            <h2 className="text-2xl font-black">{report.success ? "Search QA Complete" : "Search QA Result"}</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-4"><Metric label="Total tests" value={report.total ?? report.totalTests ?? report.summary?.total} /><Metric label="Passed" value={report.passed ?? report.summary?.passed} /><Metric label="Failed" value={report.failed ?? report.summary?.failed} /><Metric label="Warnings" value={report.warnings?.length ?? report.summary?.warnings} /></div>
            <div className="mt-4"><FriendlyKeyValueList data={report.summary || report.results || report} /></div>
            <div className="mt-4"><JsonDeveloperDetails data={report} title="Developer JSON" /></div>
          </div>
        )}
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: unknown }) { return <div className="rounded-2xl border border-white/10 bg-black/25 p-4"><p className="text-xs font-black uppercase tracking-widest text-white/40">{label}</p><p className="mt-2 text-2xl font-black text-white">{String(value ?? "—")}</p></div>; }
