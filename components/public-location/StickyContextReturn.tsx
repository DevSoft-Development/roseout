"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { trackActivity } from "@/lib/trackActivity";

function safeInternalReturnHref(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

function returnCopy(from: string) {
  if (from.startsWith("/plan")) {
    return { label: "Back to Step 4", detail: "Complete Outing" };
  }

  if (from.startsWith("/create")) {
    return { label: "Back to Search Results", detail: "Keep choosing" };
  }

  return { label: "Back", detail: "Return to where you were" };
}

export default function StickyContextReturn() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = safeInternalReturnHref(searchParams.get("from"));

  if (!from) return null;

  const copy = returnCopy(from);

  function handleReturn() {
    trackActivity({
      eventType: "navigation",
      eventName: copy.label,
      pagePath: window.location.pathname,
      metadata: {
        source: "sticky_location_context_return",
        return_to: from,
      },
    });

    if (window.history.length > 1) router.back();
    else router.push(from);
  }

  return (
    <div className="pointer-events-none fixed bottom-20 left-3 z-[70] md:bottom-5 md:left-5">
      <button
        type="button"
        onClick={handleReturn}
        className="pointer-events-auto flex min-h-12 items-center gap-2 rounded-full border border-white/15 bg-black/92 px-4 py-2.5 text-left text-white shadow-2xl shadow-black/55 backdrop-blur-xl transition hover:border-[#e1062a]/60 hover:bg-[#16070a]"
        aria-label={`${copy.label}: ${copy.detail}`}
      >
        <span aria-hidden="true" className="text-base font-black text-[#ff7188]">←</span>
        <span className="min-w-0">
          <span className="block whitespace-nowrap text-xs font-black">{copy.label}</span>
          <span className="block whitespace-nowrap text-[10px] font-bold text-white/45">{copy.detail}</span>
        </span>
      </button>
    </div>
  );
}
