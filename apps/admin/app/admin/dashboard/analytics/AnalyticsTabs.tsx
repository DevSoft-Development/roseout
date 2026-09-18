"use client";

import { useState, type ReactNode } from "react";

type Tab = { key: string; label: string; description: string; content: ReactNode };

export default function AnalyticsTabs({ tabs }: { tabs: Tab[] }) {
  const [activeKey, setActiveKey] = useState(tabs[0]?.key || "");
  const active = tabs.find((tab) => tab.key === activeKey) || tabs[0];

  if (!active) return null;

  return (
    <section className="min-w-0 rounded-[1.35rem] border border-white/10 bg-[#101012]/90 p-3 shadow-xl shadow-black/20 sm:p-4">
      <div className="flex min-w-0 gap-2 overflow-x-auto pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveKey(tab.key)}
            className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-xs font-black transition ${active.key === tab.key ? "bg-[#ec0b5b] text-white shadow-lg shadow-rose-950/25" : "border border-white/10 bg-white/[0.055] text-white/65 hover:text-white"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="mt-3 border-t border-white/10 pt-4">
        <div className="mb-4">
          <h2 className="text-xl font-black text-white">{active.label}</h2>
          <p className="mt-1 max-w-3xl text-sm text-white/55">
            {active.description}
          </p>
        </div>
        <div className="min-w-0">{active.content}</div>
      </div>
    </section>
  );
}
