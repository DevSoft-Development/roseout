"use client";

import { useEffect, useMemo, useState } from "react";
import { getLocationHoursDisplay, normalizeWeeklyHoursForDisplay, WEEKDAY_LABELS, type LocationHoursDisplayInput } from "@/lib/locationHours";

function hasUnsupportedHoursShape(value: unknown) {
  if (value == null || value === "") return false;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed.startsWith("{") || trimmed.startsWith("[") || /\d|closed/i.test(trimmed)) return false;
    return true;
  }
  if (Array.isArray(value)) return value.some((item) => typeof item === "object" && item !== null && !Array.isArray(item));
  if (typeof value === "object") return false;
  return true;
}

export default function LocationHours(props: LocationHoursDisplayInput) {
  const [expanded, setExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (process.env.NODE_ENV === "development" && hasUnsupportedHoursShape(props.operating_hours ?? props.operatingHours)) {
      const label = props.locationName || props.name || props.locationId || props.id || "unknown location";
      console.warn(`[LocationHours] Unsupported operating_hours shape for ${label}. Raw hours will not be shown.`);
    }
  }, [props.operating_hours, props.operatingHours, props.locationName, props.name, props.locationId, props.id]);

  const safeDisplay = useMemo(() => {
    const weeklyHours = normalizeWeeklyHoursForDisplay(
      props.operating_hours ?? props.operatingHours,
      props.google_current_opening_hours ?? props.googleCurrentOpeningHours,
      props.google_regular_opening_hours ?? props.googleRegularOpeningHours,
    );
    const hasUsableHours = WEEKDAY_LABELS.some(({ key }) => weeklyHours[key].length > 0);
    return { statusText: hasUsableHours ? "Hours listed below" : "Hours not available", weeklyHours, hasUsableHours, todayKey: "" };
  }, [props]);

  const liveDisplay = useMemo(() => (mounted ? getLocationHoursDisplay(props) : safeDisplay), [mounted, props, safeDisplay]);
  const display = mounted ? liveDisplay : safeDisplay;

  return (
    <div className="mt-4 rounded-[1.25rem] border border-white/10 bg-white/[0.035] p-4">
      <p className="text-xs font-black uppercase tracking-[0.24em] text-white/45">HOURS</p>
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
              className={`grid gap-1 rounded-xl px-3 py-2 sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:gap-3 ${display.todayKey === key ? "bg-white/[0.06] text-white" : "text-white/68"}`}
            >
              <span className="font-black">{label}</span>
              <span className="font-semibold leading-6 sm:text-right">{display.weeklyHours[key].length ? display.weeklyHours[key].join(", ") : "Closed"}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
