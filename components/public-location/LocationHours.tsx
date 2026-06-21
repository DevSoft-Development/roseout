"use client";

import { useMemo, useState } from "react";
import { getLocationHoursDisplay, WEEKDAY_LABELS, type LocationHoursDisplayInput } from "@/lib/locationHours";

export default function LocationHours(props: LocationHoursDisplayInput) {
  const [expanded, setExpanded] = useState(false);
  const display = useMemo(() => getLocationHoursDisplay(props), [props]);

  return (
    <div className="mt-4 rounded-[1.25rem] border border-white/10 bg-white/[0.035] p-4">
      <p className="text-xs font-black uppercase tracking-[0.24em] text-white/45">Hours</p>
      <p className="mt-2 text-sm font-extrabold text-white/82">{display.statusText}</p>
      {display.hasUsableHours ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="mt-3 text-sm font-black text-rose-200 underline decoration-rose-200/35 underline-offset-4 transition hover:text-white"
        >
          {expanded ? "Hide hours" : "See hours"}
        </button>
      ) : null}

      {expanded && display.hasUsableHours ? (
        <div className="mt-4 grid gap-2 text-sm">
          {WEEKDAY_LABELS.map(({ key, label }) => (
            <div
              key={key}
              className={`grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 rounded-xl px-3 py-2 ${display.todayKey === key ? "bg-white/[0.06] text-white" : "text-white/68"}`}
            >
              <span className="font-black">{label}</span>
              <span className="font-semibold leading-6">{display.weeklyHours[key].length ? display.weeklyHours[key].join(", ") : "Closed"}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
