"use client";

import { useMemo, useState } from "react";
import {
  buildExactPlannedForIso,
  emptyOutingTimeValue,
  type OutingTimeValue,
} from "@/lib/outings/planned-time-client";

export type { OutingTimeValue } from "@/lib/outings/planned-time-client";

type OutingTimeSelectorProps = {
  value: OutingTimeValue;
  onChange: (value: OutingTimeValue) => void;
  query?: string;
  showReminderOptions?: boolean;
  hasEmailContact?: boolean;
  hasSmsOptIn?: boolean;
  variant?: "compact" | "panel";
};

function formatContext(context: string | null) {
  if (!context) return "your outing";
  if (context === "this_weekend") return "This weekend";
  if (context === "tonight") return "Tonight";
  if (context === "tomorrow") return "Tomorrow";
  if (/^\d{4}-\d{2}-\d{2}$/.test(context)) {
    try {
      const [year, month, day] = context.split("-").map(Number);
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
      }).format(new Date(Date.UTC(year, month - 1, day, 12)));
    } catch {
      return context;
    }
  }
  return context.replace(/_/g, " ");
}

function formatCompactDateTime(iso: string | null, timezone: string) {
  if (!iso) return "Time set";
  try {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone,
    }).format(new Date(iso));
  } catch {
    return "Time set";
  }
}

function formatCompactStatus(value: OutingTimeValue) {
  if (value.outingTimeConfidence === "exact") {
    return formatCompactDateTime(value.plannedFor, value.timezone);
  }

  if (value.outingTimeConfidence === "date_only") {
    return formatContext(value.outingDateContext);
  }

  return "Optional";
}

function inputDateFromIso(iso: string | null, timezone: string) {
  if (!iso) return "";
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(iso));
    const map = Object.fromEntries(parts.filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
    return `${map.year}-${map.month}-${map.day}`;
  } catch {
    return "";
  }
}

function inputTimeFromIso(iso: string | null, timezone: string) {
  if (!iso) return "";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(iso));
    const map = Object.fromEntries(parts.filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
    const hour = map.hour === "24" ? "00" : map.hour;
    return `${hour}:${map.minute}`;
  } catch {
    return "";
  }
}


function inputDateFromValue(value: OutingTimeValue) {
  if (value.plannedFor) return inputDateFromIso(value.plannedFor, value.timezone);
  if (value.outingDateContext && /^\d{4}-\d{2}-\d{2}$/.test(value.outingDateContext)) {
    return value.outingDateContext;
  }
  return "";
}

export default function OutingTimeSelector({
  value,
  onChange,
  showReminderOptions = true,
  variant = "panel",
}: OutingTimeSelectorProps) {
  const safeValue = value || emptyOutingTimeValue();
  const [date, setDate] = useState(inputDateFromValue(safeValue));
  const [time, setTime] = useState(inputTimeFromIso(safeValue.plannedFor, safeValue.timezone));
  const [showCustomPicker, setShowCustomPicker] = useState(
    safeValue.outingTimeConfidence === "exact" ||
      Boolean(safeValue.plannedFor) ||
      Boolean(inputDateFromValue(safeValue)),
  );

  const panelStateCopy = useMemo(() => {
    if (safeValue.outingTimeConfidence === "exact") return "Timing set — we’ll estimate the rest of your timeline.";
    if (safeValue.outingTimeConfidence === "date_only") return "Timing not set yet — add a start time if you want a full timeline.";
    return "Timing not set yet — add a start time if you want a full timeline.";
  }, [safeValue.outingTimeConfidence]);

  const isTonightActive = safeValue.outingTimeConfidence === "date_only" && safeValue.outingDateContext === "tonight";
  const isTomorrowActive = safeValue.outingTimeConfidence === "date_only" && safeValue.outingDateContext === "tomorrow";
  const isWeekendActive = safeValue.outingTimeConfidence === "date_only" && safeValue.outingDateContext === "this_weekend";
  const isDateActive =
    safeValue.outingTimeConfidence === "exact" ||
    (safeValue.outingTimeConfidence === "date_only" && Boolean(inputDateFromValue(safeValue))) ||
    showCustomPicker;

  const chipBase =
    "rounded-full border px-3 py-1.5 text-[11px] font-black transition focus:outline-none focus:ring-2 focus:ring-[#e1062a]/40";
  const inactiveChip = `${chipBase} border-white/10 bg-white/[0.04] text-white/65 hover:border-white/20 hover:text-white`;
  const activeChip = `${chipBase} border-[#e1062a]/60 bg-[#e1062a]/15 text-white shadow-sm shadow-[#e1062a]/20`;
  const inputClass =
    "h-9 w-full rounded-full border border-white/10 bg-black px-3 text-xs font-bold text-white outline-none transition focus:border-[#e1062a]/70 focus:ring-2 focus:ring-[#e1062a]/20";

  function clearValue() {
    setDate("");
    setTime("");
    setShowCustomPicker(false);
    onChange(emptyOutingTimeValue(safeValue.timezone));
  }

  function chooseDateContext(context: "tonight" | "tomorrow" | "this_weekend") {
    setDate("");
    setTime("");
    setShowCustomPicker(false);
    onChange({
      ...safeValue,
      plannedFor: null,
      outingDateContext: context,
      outingTimeConfidence: "date_only",
      remindersEnabled: false,
      nextMorningFollowupEnabled: false,
      nextMorningFollowupDate: null,
    });
  }

  function applyDateOnly(nextDate: string) {
    onChange({
      ...safeValue,
      plannedFor: null,
      outingDateContext: nextDate,
      outingTimeConfidence: "date_only",
      remindersEnabled: false,
      nextMorningFollowupEnabled: false,
      nextMorningFollowupDate: null,
    });
  }

  function applyExact(nextDate: string, nextTime: string) {
    const plannedFor = buildExactPlannedForIso(nextDate, nextTime, safeValue.timezone);
    if (!plannedFor) return;
    onChange({
      ...safeValue,
      plannedFor,
      outingDateContext: nextDate,
      outingTimeConfidence: "exact",
      remindersEnabled: Boolean(safeValue.remindersEnabled),
      nextMorningFollowupEnabled: false,
      nextMorningFollowupDate: null,
    });
  }

  function handleDateChange(nextDate: string) {
    setDate(nextDate);
    if (!nextDate) {
      if (!time) clearValue();
      return;
    }
    if (time) applyExact(nextDate, time);
    else applyDateOnly(nextDate);
  }

  function handleTimeChange(nextTime: string) {
    setTime(nextTime);
    if (!date) return;
    if (nextTime) applyExact(date, nextTime);
    else applyDateOnly(date);
  }

  const picker = (
    <div className={variant === "compact" ? "mt-2 grid gap-2 sm:grid-cols-[1fr_0.8fr]" : "mt-3 grid gap-2 md:grid-cols-2"}>
      <label>
        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">Pick date</span>
        <input type="date" value={date} onChange={(event) => handleDateChange(event.target.value)} className={`${inputClass} mt-1`} />
      </label>
      <label>
        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">Pick time</span>
        <input type="time" value={time} onChange={(event) => handleTimeChange(event.target.value)} className={`${inputClass} mt-1`} />
      </label>
    </div>
  );

  if (variant === "compact") {
    return (
      <section className="rounded-2xl border border-white/10 bg-black/50 p-2.5 text-white shadow-lg shadow-black/20 sm:p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">When</span>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-black text-white/60">
              {formatCompactStatus(safeValue)}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => chooseDateContext("tonight")} className={isTonightActive ? activeChip : inactiveChip}>Tonight</button>
            <button type="button" onClick={() => chooseDateContext("tomorrow")} className={isTomorrowActive ? activeChip : inactiveChip}>Tomorrow</button>
            <button type="button" onClick={() => chooseDateContext("this_weekend")} className={isWeekendActive ? activeChip : inactiveChip}>Weekend</button>
            <button type="button" onClick={() => setShowCustomPicker(true)} className={isDateActive ? activeChip : inactiveChip}>Date</button>
            {safeValue.outingTimeConfidence !== "none" ? (
              <button type="button" onClick={clearValue} className="px-1.5 text-[10px] font-black text-white/35 transition hover:text-white">
                Clear
              </button>
            ) : null}
          </div>
        </div>

        {showCustomPicker ? picker : null}
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-white">
      <div className="flex items-start justify-between gap-3">
        <div>
          <label className="text-sm font-black text-white">When does your outing start?</label>
          <p className="mt-1 text-xs font-semibold text-white/50">Optional — choose a start time and we’ll estimate the rest of your timeline.</p>
        </div>
        {safeValue.outingTimeConfidence !== "none" ? (
          <button type="button" onClick={clearValue} className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35 transition hover:text-white">
            Clear
          </button>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => chooseDateContext("tonight")} className={isTonightActive ? activeChip : inactiveChip}>Tonight</button>
        <button type="button" onClick={() => chooseDateContext("tomorrow")} className={isTomorrowActive ? activeChip : inactiveChip}>Tomorrow</button>
        <button type="button" onClick={() => chooseDateContext("this_weekend")} className={isWeekendActive ? activeChip : inactiveChip}>This weekend</button>
      </div>

      {picker}

      {showReminderOptions && safeValue.outingTimeConfidence !== "none" ? (
        <div className="mt-3 space-y-2">
          {safeValue.outingTimeConfidence === "exact" ? (
            <label className="flex items-start gap-2 text-xs font-bold text-white/70">
              <input
                type="checkbox"
                checked={safeValue.remindersEnabled}
                onChange={(event) => onChange({ ...safeValue, remindersEnabled: event.target.checked && Boolean(safeValue.plannedFor) })}
                className="mt-0.5 accent-[#e1062a]"
              />
              Keep this plan handy before I head out
            </label>
          ) : null}
        </div>
      ) : null}

      <p className="mt-3 rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-xs font-semibold leading-5 text-white/65">
        {panelStateCopy}
      </p>
    </section>
  );
}
