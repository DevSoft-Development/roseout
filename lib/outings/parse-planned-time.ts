export type ParsedPlannedTime = {
  plannedFor: string | null;
  timezone: string;
  matchedText: string | null;
  dateContext: string | null;
  confidence: "none" | "date_only" | "exact";
  shouldSchedulePreOutingReminders: boolean;
  shouldScheduleNextMorningFollowup: boolean;
  nextMorningFollowupDate: string | null;
};

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DATE_CONTEXT_RE = /\b(tonight|tomorrow night|tomorrow|this weekend|brunch\s+(?:tomorrow|friday|saturday|sunday)|dinner\s+(?:tonight|tomorrow|friday|saturday|sunday)|drinks\s+(?:tonight|tomorrow|friday|saturday|sunday)|friday|saturday|sunday)\b/i;
const TIME_RE = /\b(?:at\s*)?(?:(\d{1,2})(?::(\d{2}))?\s*(am|pm)?|noon|midnight)\b/i;

function getTzParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const out: Record<string, number> = {};
  for (const p of parts) if (p.type !== "literal") out[p.type] = Number(p.value);
  if (out.hour === 24) out.hour = 0;
  return out as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

function zonedTimeToUtcIso(year: number, month: number, day: number, hour: number, minute: number, timeZone: string) {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const parts = getTzParts(guess, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const wanted = Date.UTC(year, month - 1, day, hour, minute, 0);
  return new Date(guess.getTime() + (wanted - asUtc)).toISOString();
}

function addLocalDays(parts: { year: number; month: number; day: number }, days: number) {
  const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function nextDayIndex(currentDow: number, targetDow: number) {
  const delta = (targetDow - currentDow + 7) % 7;
  return delta === 0 ? 7 : delta;
}

function contextTargetDate(context: string, timeZone: string, now = new Date()) {
  const today = getTzParts(now, timeZone);
  const lower = context.toLowerCase();
  const todayDate = { year: today.year, month: today.month, day: today.day };
  if (lower.includes("tonight")) return todayDate;
  if (lower.includes("tomorrow")) return addLocalDays(todayDate, 1);
  const dow = new Date(Date.UTC(today.year, today.month - 1, today.day, 12)).getUTCDay();
  if (lower.includes("this weekend")) {
    if (dow === 0) return todayDate;
    if (dow === 6) return todayDate;
    return addLocalDays(todayDate, nextDayIndex(dow, 6));
  }
  const day = DAY_NAMES.find((d) => lower.includes(d));
  if (day) return addLocalDays(todayDate, nextDayIndex(dow, DAY_NAMES.indexOf(day)));
  return todayDate;
}

function followupForTargetDate(target: { year: number; month: number; day: number }, timeZone: string) {
  const next = addLocalDays(target, 1);
  return zonedTimeToUtcIso(next.year, next.month, next.day, 10, 0, timeZone);
}

function parseTime(text: string) {
  const match = text.match(TIME_RE);
  if (!match) return null;
  const raw = match[0].toLowerCase();
  if (!raw.includes("at") && !/\d/.test(raw) && raw !== "noon" && raw !== "midnight") return null;
  if (raw === "noon" || raw.includes("noon")) return { hour: 12, minute: 0, matched: match[0] };
  if (raw === "midnight" || raw.includes("midnight")) return { hour: 0, minute: 0, matched: match[0] };
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const meridiem = match[3]?.toLowerCase();
  if (hour < 1 || hour > 12 || minute > 59) return null;
  if (meridiem === "pm" && hour !== 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  // Accept bare "at 7" as exact because the user supplied an exact clock hour.
  return { hour, minute, matched: match[0] };
}

export function parsePlannedTimeFromQuery(rawQuery: string, timezone = "America/New_York"): ParsedPlannedTime {
  const query = String(rawQuery || "");
  const contextMatch = query.match(DATE_CONTEXT_RE);
  const dateContext = contextMatch?.[0]?.trim() || null;
  const time = parseTime(query);

  if (!dateContext) {
    return { plannedFor: null, timezone, matchedText: time?.matched || null, dateContext: null, confidence: "none", shouldSchedulePreOutingReminders: false, shouldScheduleNextMorningFollowup: false, nextMorningFollowupDate: null };
  }

  const target = contextTargetDate(dateContext, timezone);
  const nextMorningFollowupDate = followupForTargetDate(target, timezone);

  if (time) {
    const plannedFor = zonedTimeToUtcIso(target.year, target.month, target.day, time.hour, time.minute, timezone);
    return { plannedFor, timezone, matchedText: `${dateContext} ${time.matched}`.trim(), dateContext, confidence: "exact", shouldSchedulePreOutingReminders: true, shouldScheduleNextMorningFollowup: true, nextMorningFollowupDate };
  }

  return { plannedFor: null, timezone, matchedText: dateContext, dateContext, confidence: "date_only", shouldSchedulePreOutingReminders: false, shouldScheduleNextMorningFollowup: true, nextMorningFollowupDate };
}
