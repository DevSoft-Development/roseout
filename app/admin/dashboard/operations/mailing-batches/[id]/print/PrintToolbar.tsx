"use client";

import Link from "next/link";

export default function PrintToolbar({ batchId, mode }: { batchId: string; mode: string }) {
  const base = `/admin/dashboard/operations/mailing-batches/${batchId}/print`;
  return (
    <div className="print:hidden sticky top-0 z-50 border-b border-white/10 bg-[#080706]/95 px-4 py-3 text-white backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/admin/dashboard/operations/mailing-batches/${batchId}`} className="rounded-lg border border-white/10 px-3 py-2 text-sm font-black text-white/70">← Batch</Link>
          {[
            ["duplex", "Duplex"],
            ["fronts", "Fronts only"],
            ["backs", "Backs only"],
          ].map(([value, label]) => (
            <Link
              key={value}
              href={`${base}?mode=${value}`}
              className={mode === value ? "rounded-lg bg-white px-3 py-2 text-sm font-black text-black" : "rounded-lg border border-white/10 px-3 py-2 text-sm font-black text-white/70"}
            >
              {label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-white/45 md:block">6×4 landscape · 100% scale · no margins</span>
          <button type="button" onClick={() => window.print()} className="rounded-lg bg-emerald-300 px-4 py-2 text-sm font-black text-black">Print</button>
        </div>
      </div>
    </div>
  );
}
