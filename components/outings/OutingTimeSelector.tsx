"use client";

import { useMemo, useState } from "react";
import {
  buildExactPlannedForIso,
  emptyOutingTimeValue,
  getDateContextFollowupDate,
  getNextMorningFollowupDateForDate,
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
};

function formatContext(context: string | null) {
  if (!context) return "that timing";
  return context.replace(/_/g, " ");
}

function formatDateTime(iso: string | null, timezone: string) {
  if (!iso) return "your selected time";
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone,
    }).format(new Date(iso));
  } catch {
    return "your selected time";
  }
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

export default function OutingTimeSelector({ value, onChange, showReminderOptions = true }: OutingTimeSelectorProps) {
  const safeValue = value || emptyOutingTimeValue();
  const [date, setDate] = useState(inputDateFromIso(safeValue.plannedFor, safeValue.timezone));
  const [time, setTime] = useState(inputTimeFromIso(safeValue.plannedFor, safeValue.timezone));

  const stateCopy = useMemo(() => {
    if (safeValue.outingTimeConfidence === "exact") {
      return `You’re planning for ${formatDateTime(safeValue.plannedFor, safeValue.timezone)}. We can help keep your plan handy and check in tomorrow to see how everything went.`;
    }
    if (safeValue.outingTimeConfidence === "date_only") {
      return `We noticed you said ${formatContext(safeValue.outingDateContext)}. We’ll check in tomorrow to see how everything went.`;
    }
    return "Planning ahead? Choose when you’re going so we can help keep your outing organized.";
  }, [safeValue.outingDateContext, safeValue.outingTimeConfidence, safeValue.plannedFor, safeValue.timezone]);

  function chooseDateContext(context: "tonight" | "tomorrow" | "this_weekend") {
    setDate("");
    setTime("");
    onChange({
      ...safeValue,
      plannedFor: null,
      outingDateContext: context,
      outingTimeConfidence: "date_only",
      remindersEnabled: false,
      nextMorningFollowupEnabled: true,
      nextMorningFollowupDate: getDateContextFollowupDate(context, safeValue.timezone),
    });
  }

  function applyExact(nextDate: string, nextTime: string) {
    setDate(nextDate);
    setTime(nextTime);
    const plannedFor = buildExactPlannedForIso(nextDate, nextTime, safeValue.timezone);
    if (!plannedFor) return;
    onChange({
      ...safeValue,
      plannedFor,
      outingDateContext: nextDate,
      outingTimeConfidence: "exact",
      remindersEnabled: Boolean(safeValue.remindersEnabled),
      nextMorningFollowupEnabled: true,
      nextMorningFollowupDate: getNextMorningFollowupDateForDate(nextDate, safeValue.timezone),
    });
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-white">
      <div>
        <label className="text-sm font-black text-white">When are you going?</label>
        <p className="mt-1 text-xs font-semibold text-white/50">Optional — this helps us organize your plan.</p>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => chooseDateContext("tonight")} className="rounded-full border border-white/10 bg-black/40 px-3 py-2 text-xs font-bold text-white/75 hover:text-white">Tonight</button>
        <button type="button" onClick={() => chooseDateContext("tomorrow")} className="rounded-full border border-white/10 bg-black/40 px-3 py-2 text-xs font-bold text-white/75 hover:text-white">Tomorrow</button>
        <button type="button" onClick={() => chooseDateContext("this_weekend")} className="rounded-full border border-white/10 bg-black/40 px-3 py-2 text-xs font-bold text-white/75 hover:text-white">This weekend</button>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">Pick date</span>
          <input type="date" value={date} onChange={(event) => { const nextDate = event.target.value; setDate(nextDate); if (nextDate && time) applyExact(nextDate, time); }} className="mt-1 w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm font-semibold text-white outline-none" />
        </div>
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">Pick time</span>
          <input type="time" value={time} onChange={(event) => { const nextTime = event.target.value; setTime(nextTime); if (date && nextTime) applyExact(date, nextTime); }} className="mt-1 w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm font-semibold text-white outline-none" />
        </div>
      </div>

      {showReminderOptions && safeValue.outingTimeConfidence !== "none" ? (
        <div className="mt-3 space-y-2">
          {safeValue.outingTimeConfidence === "exact" ? (
            <label className="flex items-start gap-2 text-xs font-bold text-white/70">
              <input type="checkbox" checked={safeValue.remindersEnabled} onChange={(event) => onChange({ ...safeValue, remindersEnabled: event.target.checked && Boolean(safeValue.plannedFor) })} className="mt-0.5" />
              Keep this plan handy before I head out
            </label>
          ) : null}
          <label className="flex items-start gap-2 text-xs font-bold text-white/70">
            <input type="checkbox" checked={safeValue.nextMorningFollowupEnabled} onChange={(event) => onChange({ ...safeValue, nextMorningFollowupEnabled: event.target.checked, nextMorningFollowupDate: event.target.checked ? safeValue.nextMorningFollowupDate : null })} className="mt-0.5" />
            Send me a follow-up tomorrow
          </label>
        </div>
      ) : null}

      <p className="mt-3 rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-xs font-semibold leading-5 text-white/65">{stateCopy}</p>
    </section>
  );
}
