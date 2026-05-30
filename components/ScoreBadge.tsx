"use client";

import { useEffect, useState } from "react";
import { clampScore } from "@/lib/clampScore";

export default function ScoreBadge({ score }: { score: number }) {
  const safeScore = clampScore(score);
  const [displayScore, setDisplayScore] = useState(0);

  useEffect(() => {
    let current = 0;

    const interval = setInterval(() => {
      current += 4;

      if (current >= safeScore) {
        setDisplayScore(safeScore);
        clearInterval(interval);
      } else {
        setDisplayScore(current);
      }
    }, 14);

    return () => clearInterval(interval);
  }, [safeScore]);

  const tier =
    safeScore >= 90
      ? "Elite"
      : safeScore >= 80
        ? "Top Pick"
        : safeScore >= 65
          ? "Great"
          : "Match";

  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (displayScore / 100) * circumference;

  return (
    <div className="overflow-hidden rounded-[1.75rem] border border-red-300/20 bg-gradient-to-br from-red-950/45 via-black/70 to-black p-5 shadow-2xl shadow-red-950/20">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-red-200/60">
            TheOutHaven Score
          </p>

          <div className="mt-3 flex items-end gap-2">
            <span className="text-4xl font-black tracking-tight text-white">
              {safeScore}
            </span>
            <span className="pb-1 text-sm font-black text-white/45">/100</span>
          </div>

          <span className="mt-3 inline-flex rounded-full border border-red-300/25 bg-red-600/20 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-red-50">
            {tier}
          </span>
        </div>

        <div className="relative h-20 w-20 shrink-0">
          <svg className="-rotate-90" width="80" height="80">
            <circle
              cx="40"
              cy="40"
              r={radius}
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="7"
              fill="transparent"
            />
            <circle
              cx="40"
              cy="40"
              r={radius}
              stroke="rgb(220,38,38)"
              strokeWidth="7"
              fill="transparent"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
            />
          </svg>

          <div className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-red-300/25 bg-black/70 text-[11px] font-black text-red-50">
              OH
            </span>
          </div>
        </div>
      </div>

      <p className="mt-4 border-t border-white/10 pt-4 text-xs font-semibold leading-5 text-white/55">
        Based on location quality, experience signals, popularity, and
        TheOutHaven match data.
      </p>
    </div>
  );
}
