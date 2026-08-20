"use client";

import { CalendarDays, ChevronLeft, ChevronRight, Clock3, X } from "lucide-react";
import { useMemo, useState } from "react";

type Props = {
  label: string;
  dateName: string;
  timeName: string;
  required?: boolean;
  minuteStep?: number;
  defaultDate?: string;
  defaultTime?: string;
};

const weekDays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function dateValue(year: number, month: number, day: number) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function formatDate(value: string) {
  if (!value) return "Choose date";
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(new Date(year, month - 1, day));
}

function formatTime(value: string) {
  if (!value) return "Choose time";
  const [hour, minute] = value.split(":").map(Number);
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(2026, 0, 1, hour, minute));
}

export default function VisualDateTimePicker({ label, dateName, timeName, required = false, minuteStep = 15, defaultDate = "", defaultTime = "" }: Props) {
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState(defaultTime);
  const initial = date ? new Date(`${date}T12:00:00`) : new Date();
  const [monthCursor, setMonthCursor] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1));
  const [openPanel, setOpenPanel] = useState<"date" | "time" | null>(null);

  const days = useMemo(() => {
    const year = monthCursor.getFullYear();
    const month = monthCursor.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const count = new Date(year, month + 1, 0).getDate();
    return [...Array(firstDay).fill(null), ...Array.from({ length: count }, (_, index) => index + 1)];
  }, [monthCursor]);

  const times = useMemo(() => {
    const rows: string[] = [];
    for (let minutes = 0; minutes < 24 * 60; minutes += minuteStep) rows.push(`${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`);
    return rows;
  }, [minuteStep]);

  const selectedMonth = date ? date.slice(0, 7) : "";
  const cursorMonth = `${monthCursor.getFullYear()}-${pad(monthCursor.getMonth() + 1)}`;

  return (
    <div className="relative min-w-0">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-black text-white/60">{label} {required ? <span className="text-[#ff6b86]">* Required</span> : <span className="font-semibold text-white/30">Optional</span>}</span>
        {!required && (date || time) ? <button type="button" onClick={() => { setDate(""); setTime(""); setOpenPanel(null); }} className="inline-flex items-center gap-1 text-[11px] font-bold text-white/35 hover:text-white"><X size={12}/>Clear</button> : null}
      </div>
      <input type="hidden" name={dateName} value={date} />
      <input type="hidden" name={timeName} value={time} />
      <div className="grid gap-2 sm:grid-cols-2">
        <button type="button" onClick={() => setOpenPanel(openPanel === "date" ? null : "date")} className="flex min-h-12 w-full items-center gap-3 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-left text-sm font-semibold text-white outline-none transition hover:border-white/20 focus:border-[#ff2142]/60 focus:ring-4 focus:ring-[#e1062a]/10">
          <CalendarDays size={18} className="shrink-0 text-[#ff6b86]"/><span className={date ? "text-white" : "text-white/35"}>{formatDate(date)}</span>
        </button>
        <button type="button" onClick={() => setOpenPanel(openPanel === "time" ? null : "time")} className="flex min-h-12 w-full items-center gap-3 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-left text-sm font-semibold text-white outline-none transition hover:border-white/20 focus:border-[#ff2142]/60 focus:ring-4 focus:ring-[#e1062a]/10">
          <Clock3 size={18} className="shrink-0 text-[#ff6b86]"/><span className={time ? "text-white" : "text-white/35"}>{formatTime(time)}</span>
        </button>
      </div>

      {openPanel === "date" ? (
        <div className="absolute left-0 z-50 mt-2 w-full max-w-[360px] rounded-3xl border border-white/15 bg-[#0b0d11] p-4 shadow-2xl shadow-black/60">
          <div className="flex items-center justify-between gap-3">
            <button type="button" aria-label="Previous month" onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 hover:bg-white/[0.06]"><ChevronLeft size={18}/></button>
            <p className="text-sm font-black">{monthCursor.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</p>
            <button type="button" aria-label="Next month" onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 hover:bg-white/[0.06]"><ChevronRight size={18}/></button>
          </div>
          <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[11px] font-black text-white/35">{weekDays.map(day => <div key={day} className="py-1">{day}</div>)}</div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {days.map((day, index) => day ? <button key={day} type="button" onClick={() => { setDate(dateValue(monthCursor.getFullYear(), monthCursor.getMonth(), day)); setOpenPanel(null); }} className={`h-10 rounded-xl text-sm font-bold transition ${selectedMonth === cursorMonth && Number(date.slice(8, 10)) === day ? "bg-[#e1062a] text-white" : "text-white/75 hover:bg-white/[0.08]"}`}>{day}</button> : <span key={`blank-${index}`} className="h-10"/>)}
          </div>
          <button type="button" onClick={() => { const now = new Date(); setMonthCursor(new Date(now.getFullYear(), now.getMonth(), 1)); setDate(dateValue(now.getFullYear(), now.getMonth(), now.getDate())); setOpenPanel(null); }} className="mt-3 w-full rounded-xl border border-white/10 px-3 py-2 text-xs font-black text-white/65 hover:bg-white/[0.05]">Today</button>
        </div>
      ) : null}

      {openPanel === "time" ? (
        <div className="absolute right-0 z-50 mt-2 w-full max-w-[280px] rounded-3xl border border-white/15 bg-[#0b0d11] p-3 shadow-2xl shadow-black/60">
          <p className="px-2 pb-2 text-xs font-black uppercase tracking-[0.14em] text-white/35">Choose a time</p>
          <div className="max-h-72 overflow-y-auto pr-1">
            {times.map(value => <button key={value} type="button" onClick={() => { setTime(value); setOpenPanel(null); }} className={`mb-1 w-full rounded-xl px-3 py-2.5 text-left text-sm font-bold transition ${time === value ? "bg-[#e1062a] text-white" : "text-white/75 hover:bg-white/[0.07]"}`}>{formatTime(value)}</button>)}
          </div>
        </div>
      ) : null}
    </div>
  );
}
