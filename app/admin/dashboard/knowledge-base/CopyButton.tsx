"use client";

import { useState } from "react";
import { Copy } from "lucide-react";

export default function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-2 rounded-full border border-[#e1062a]/30 bg-[#e1062a]/10 px-4 py-2 text-sm font-black text-rose-100 transition hover:bg-[#e1062a]/20"
    >
      <Copy className="h-4 w-4" />
      {copied ? "Copied" : label}
    </button>
  );
}
