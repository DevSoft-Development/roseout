"use client";

import { useMemo, useState } from "react";

type LabelItem = {
  id: string;
  assetTag: string;
  serialNumber: string;
  label: string;
  qr: string;
};

export default function PosInventoryLabelPrinter({
  items,
}: {
  items: LabelItem[];
}) {
  const [selected, setSelected] = useState<string[]>(items.map((item) => item.id));
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  }

  return (
    <>
      <div className="print:hidden">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelected(items.map((item) => item.id))}
            className="rounded-full border border-white/15 px-4 py-2 text-xs font-black text-white/80"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={() => setSelected([])}
            className="rounded-full border border-white/15 px-4 py-2 text-xs font-black text-white/80"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={!selected.length}
            className="rounded-full bg-[#e1062a] px-4 py-2 text-xs font-black text-white disabled:opacity-40"
          >
            Print {selected.length} label{selected.length === 1 ? "" : "s"}
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 print:grid-cols-3 print:gap-2">
        {items.map((item) => {
          const active = selectedSet.has(item.id);
          return (
            <article
              key={item.id}
              className={`rounded-2xl border p-4 print:break-inside-avoid print:border-black print:bg-white print:text-black ${active ? "border-rose-300/30 bg-white/[0.04]" : "border-white/10 bg-black/20 opacity-45 print:hidden"}`}
            >
              <label className="flex items-start gap-3 print:hidden">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => toggle(item.id)}
                  className="mt-1 h-4 w-4"
                />
                <span>
                  <span className="block text-sm font-black text-white">{item.label}</span>
                  <span className="mt-1 block text-xs font-bold text-white/40">{item.serialNumber}</span>
                </span>
              </label>

              <div className="mt-4 text-center print:mt-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.qr}
                  alt={`ThePOSHaven inventory QR ${item.assetTag}`}
                  className="mx-auto h-40 w-40 bg-white p-2"
                />
                <p className="mt-2 text-base font-black text-white print:text-black">
                  {item.assetTag}
                </p>
                <p className="mt-1 text-xs font-bold text-white/55 print:text-black">
                  {item.label}
                </p>
                <p className="mt-1 break-all text-[10px] font-bold text-white/35 print:text-black">
                  S/N {item.serialNumber}
                </p>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
