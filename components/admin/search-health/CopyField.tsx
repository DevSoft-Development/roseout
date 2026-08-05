"use client";
import { useState } from "react";
import { copyText, formatUnknown } from "@/lib/admin/search-explorer";
export default function CopyField({
  label,
  value,
}: {
  label: string;
  value: unknown;
}) {
  const [copied, setCopied] = useState(false);
  const text = formatUnknown(value);
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/8 py-3 last:border-0">
      <div>
        <dt className="text-[10px] font-black uppercase tracking-wider text-white/35">
          {label}
        </dt>
        <dd className="mt-1 break-all text-sm text-white/80">{text}</dd>
      </div>
      <button
        type="button"
        aria-label={`Copy ${label}`}
        className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-bold text-white/50 focus-visible:outline-2 focus-visible:outline-rose-400 hover:text-white"
        onClick={async () => {
          if (await copyText(text)) {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
