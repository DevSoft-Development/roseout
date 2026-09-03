"use client";

import Link from "next/link";

export default function PrintToolbar({
  batchId,
  mode,
  staging = false,
  production = false,
  proofItemId = "",
}: {
  batchId: string;
  mode: string;
  staging?: boolean;
  production?: boolean;
  proofItemId?: string;
}) {
  const base = `/admin/dashboard/operations/mailing-batches/${batchId}/print`;
  const proofQuery = proofItemId
    ? staging
      ? `&staging=1&item=${encodeURIComponent(proofItemId)}`
      : production
        ? `&production=1&item=${encodeURIComponent(proofItemId)}`
        : ""
    : "";
  const label = production ? "Live production proof" : staging ? "Staging test" : null;

  return (
    <>
      <style>{`
        @media print {
          /*
           * WebKit/Safari can create an extra blank sheet when an exact-size
           * 6x4 element also forces break-after: page. Paginate by breaking
           * before every postcard after the first instead. This is also safe
           * in Chromium and preserves one physical sheet per postcard side.
           */
          .print-stack > .postcard-page {
            box-sizing: border-box !important;
            break-before: auto !important;
            page-break-before: auto !important;
            break-after: auto !important;
            page-break-after: auto !important;
          }
          .print-stack > .postcard-page + .postcard-page {
            break-before: page !important;
            page-break-before: always !important;
          }
          main {
            min-height: 0 !important;
          }
          .print-stack {
            display: block !important;
            height: auto !important;
          }
        }
      `}</style>
      <div className="print:hidden sticky top-0 z-50 border-b border-white/10 bg-[#080706]/95 px-4 py-3 text-white backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/admin/dashboard/operations/mailing-batches/${batchId}`} className="rounded-lg border border-white/10 px-3 py-2 text-sm font-black text-white/70">← Batch</Link>
            {label ? <span className={production ? "rounded-full border border-emerald-300/30 bg-emerald-500/15 px-3 py-1.5 text-xs font-black uppercase tracking-[0.12em] text-emerald-100" : "rounded-full border border-amber-300/30 bg-amber-500/15 px-3 py-1.5 text-xs font-black uppercase tracking-[0.12em] text-amber-100"}>{label}</span> : null}
            {[["duplex", "Duplex"], ["fronts", "Fronts only"], ["backs", "Backs only"]].map(([value, itemLabel]) => (
              <Link key={value} href={`${base}?mode=${value}${proofQuery}`} className={mode === value ? "rounded-lg bg-white px-3 py-2 text-sm font-black text-black" : "rounded-lg border border-white/10 px-3 py-2 text-sm font-black text-white/70"}>{itemLabel}</Link>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-white/45 md:block">6×4 landscape · 100% scale · no margins</span>
            <button type="button" onClick={() => window.print()} className="rounded-lg bg-emerald-300 px-4 py-2 text-sm font-black text-black">{production ? "Print live proof" : staging ? "Print staging test" : "Print"}</button>
          </div>
        </div>
      </div>
    </>
  );
}
