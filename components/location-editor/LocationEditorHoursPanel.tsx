"use client";

import { useMemo, useState } from "react";
import { formatOperatingHoursForEditor, parseWeeklyHoursFromEditor } from "@/lib/weekly-hours";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

type Range = {
  open: string;
  close: string;
  overnight?: boolean;
  closes_next_day?: boolean;
};

type DayState = {
  closed: boolean;
  ranges: Range[];
};

function emptyWeek(): Record<string, DayState> {
  return Object.fromEntries(
    DAYS.map((day) => [day.toLowerCase(), { closed: true, ranges: [{ open: "09:00", close: "17:00" }] }]),
  );
}

function isOvernight(range: Range) {
  if (range.overnight || range.closes_next_day) return true;
  return Boolean(range.open && range.close && range.close <= range.open);
}

function fromOperatingHours(value: unknown) {
  const week = emptyWeek();
  try {
    const text = formatOperatingHoursForEditor(value);
    const parsed = parseWeeklyHoursFromEditor(text);
    if (parsed) {
      for (const day of Object.keys(week)) {
        const row = parsed[day];
        if (!row) continue;
        week[day] = {
          closed: Boolean(row.closed),
          ranges: (row.ranges?.length ? row.ranges : [{ open: "09:00", close: "17:00" }]).map((range) => ({
            open: range.open || "09:00",
            close: range.close || "17:00",
            overnight: Boolean(range.overnight || range.closes_next_day || (range.open && range.close && range.close <= range.open)),
            closes_next_day: Boolean(range.overnight || range.closes_next_day || (range.open && range.close && range.close <= range.open)),
          })),
        };
      }
    }
  } catch {
    // Keep a safe empty week if legacy hours cannot be parsed.
  }
  return week;
}

function validTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function formatTime(value: string) {
  const [hourRaw, minuteRaw] = value.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return value;
  const suffix = hour >= 12 ? "PM" : "AM";
  const twelveHour = hour % 12 || 12;
  return `${twelveHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

export default function LocationEditorHoursPanel({
  value,
  importedHours,
  isAdmin,
  onChange,
}: {
  value: unknown;
  importedHours?: unknown;
  isAdmin?: boolean;
  onChange: (hours: unknown, summary: string) => void;
}) {
  const initial = useMemo(() => fromOperatingHours(value), [value]);
  const [week, setWeek] = useState(initial);
  const [error, setError] = useState("");

  function emit(next = week) {
    for (const label of DAYS) {
      const day = label.toLowerCase();
      const row = next[day];
      if (!row.closed) {
        for (const range of row.ranges) {
          if (!range.open || !range.close) {
            setError(`${label} needs both an opening and closing time.`);
            return;
          }
          if (!validTime(range.open) || !validTime(range.close)) {
            setError(`Please choose a valid opening and closing time for ${label}.`);
            return;
          }
        }
      }
    }

    setError("");
    const output: Record<string, unknown> = {};
    for (const label of DAYS) {
      const day = label.toLowerCase();
      const row = next[day];
      output[day] = row.closed
        ? { closed: true, ranges: [] }
        : {
            closed: false,
            ranges: row.ranges.map((range) => {
              const overnight = isOvernight(range);
              return {
                open: range.open,
                close: range.close,
                ...(overnight ? { overnight: true, closes_next_day: true } : {}),
              };
            }),
          };
    }
    onChange(output, formatOperatingHoursForEditor(output));
  }

  function update(day: string, patch: Partial<DayState>) {
    const next = { ...week, [day]: { ...week[day], ...patch } };
    setWeek(next);
    emit(next);
  }

  function updateRange(day: string, index: number, patch: Partial<Range>) {
    const row = week[day];
    const ranges = row.ranges.map((range, rangeIndex) => (rangeIndex === index ? { ...range, ...patch } : range));
    update(day, { ranges });
  }

  return (
    <div className="grid gap-4">
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <p className="font-black text-white">Set your weekly hours</p>
        <p className="mt-1 text-sm font-semibold leading-6 text-white/50">
          Choose each day you are open. For late-night locations, turn on <strong className="text-white/80">Closes next day</strong> so a Friday 8:00 PM–2:00 AM schedule is stored as Friday overnight hours.
        </p>
      </div>

      {importedHours ? (
        <div className="rounded-3xl border border-amber-300/25 bg-amber-400/10 p-4">
          <h3 className="font-black text-amber-100">Imported hours found</h3>
          <p className="mt-1 text-sm text-white/60">Review them here before saving.</p>
          <button
            type="button"
            onClick={() => {
              const next = fromOperatingHours(importedHours);
              setWeek(next);
              emit(next);
            }}
            className="mt-3 rounded-full border border-amber-200/30 px-4 py-2 text-xs font-black"
          >
            Use imported hours
          </button>
        </div>
      ) : null}

      {error ? <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm font-bold text-red-100">{error}</div> : null}

      <div className="grid gap-3">
        {DAYS.map((label) => {
          const day = label.toLowerCase();
          const row = week[day];
          return (
            <div key={day} className="rounded-3xl border border-white/10 bg-black/25 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-lg font-black">{label}</h3>
                <button
                  type="button"
                  onClick={() => update(day, { closed: !row.closed })}
                  className={`rounded-full border px-4 py-2 text-xs font-black ${row.closed ? "border-white/10 bg-white/[0.04] text-white/55" : "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"}`}
                >
                  {row.closed ? "Closed" : "Open"}
                </button>
              </div>

              {!row.closed ? (
                <div className="mt-4 grid gap-3">
                  {row.ranges.map((range, index) => {
                    const overnight = isOvernight(range);
                    return (
                      <div key={index} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
                          <label>
                            <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-white/40">Opens</span>
                            <input type="time" value={range.open} onChange={(event) => updateRange(day, index, { open: event.target.value })} className="w-full rounded-2xl border border-white/10 bg-black/35 px-3 py-2.5 font-bold text-white" />
                          </label>
                          <label>
                            <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-white/40">Closes</span>
                            <input type="time" value={range.close} onChange={(event) => updateRange(day, index, { close: event.target.value })} className="w-full rounded-2xl border border-white/10 bg-black/35 px-3 py-2.5 font-bold text-white" />
                          </label>
                          <button type="button" onClick={() => update(day, { ranges: row.ranges.filter((_, rangeIndex) => rangeIndex !== index) })} className="rounded-2xl border border-white/10 px-3 py-2.5 text-xs font-black">Remove</button>
                        </div>

                        <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-black/25 p-3">
                          <input
                            type="checkbox"
                            checked={overnight}
                            onChange={(event) => updateRange(day, index, { overnight: event.target.checked, closes_next_day: event.target.checked })}
                            className="mt-1"
                          />
                          <span>
                            <span className="block text-sm font-black text-white">Closes next day</span>
                            <span className="mt-0.5 block text-xs font-semibold text-white/45">
                              Use this for overnight hours, such as {formatTime(range.open)} to {formatTime(range.close)} the following morning.
                            </span>
                          </span>
                        </label>

                        {overnight ? <p className="mt-2 text-xs font-black text-[#ff8aa0]">Overnight · closing time belongs to {DAYS[(DAYS.indexOf(label) + 1) % DAYS.length]}</p> : null}
                      </div>
                    );
                  })}

                  <button type="button" onClick={() => update(day, { ranges: [...row.ranges, { open: "17:00", close: "22:00" }] })} className="rounded-2xl border border-dashed border-white/15 px-3 py-2.5 text-left text-sm font-black text-white/65">
                    + Add another time range
                  </button>
                </div>
              ) : (
                <p className="mt-2 text-sm font-semibold text-white/40">Closed all day</p>
              )}
            </div>
          );
        })}
      </div>

      {isAdmin ? (
        <details className="rounded-2xl border border-white/10 bg-black/25 p-4">
          <summary className="cursor-pointer font-black">Advanced hours data</summary>
          <pre className="mt-3 overflow-auto text-xs text-white/50">{JSON.stringify(value, null, 2)}</pre>
        </details>
      ) : null}
    </div>
  );
}
