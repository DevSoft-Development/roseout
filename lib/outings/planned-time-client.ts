export type OutingTimeConfidence = "none" | "date_only" | "exact" | "vague" | "explicit";

export type OutingTimeValue = {
  plannedFor: string | null;
  timezone: string;
  outingDateContext: string | null;
  outingTimeConfidence: OutingTimeConfidence;
  outingDateLabel?: string | null;
  outingTimeLabel?: string | null;
  outingDateTimeText?: string | null;
  parsedDateText?: string | null;
  parsedTimeText?: string | null;
  parsedDateTimeISO?: string | null;
  remindersEnabled: boolean;
  nextMorningFollowupEnabled: boolean;
  nextMorningFollowupDate: string | null;
};

export function getBrowserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
  } catch {
    return "America/New_York";
  }
}

function offsetParts(date: Date, timeZone: string) {
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
  const parts = offsetParts(guess, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const wanted = Date.UTC(year, month - 1, day, hour, minute, 0);
  return new Date(guess.getTime() + (wanted - asUtc)).toISOString();
}

function addDaysToDate(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day + days, 12));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function localDateString(timeZone: string, daysFromToday = 0) {
  const nowParts = offsetParts(new Date(), timeZone);
  const d = new Date(Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day + daysFromToday, 12));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function buildExactPlannedForIso(date: string, time: string, timezone: string) {
  if (!date || !time) return null;
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (!year || !month || !day || Number.isNaN(hour) || Number.isNaN(minute)) return null;
  return zonedTimeToUtcIso(year, month, day, hour, minute, timezone);
}

export function getNextMorningFollowupDateForDate(date: string, timezone: string) {
  const next = addDaysToDate(date, 1);
  return zonedTimeToUtcIso(next.year, next.month, next.day, 10, 0, timezone);
}

export function getDateContextFollowupDate(context: "tonight" | "tomorrow" | "this_weekend", timezone: string) {
  if (context === "tonight") return getNextMorningFollowupDateForDate(localDateString(timezone), timezone);
  if (context === "tomorrow") return getNextMorningFollowupDateForDate(localDateString(timezone, 1), timezone);
  const today = offsetParts(new Date(), timezone);
  const dow = new Date(Date.UTC(today.year, today.month - 1, today.day, 12)).getUTCDay();
  const daysUntilFollowup = dow === 0 ? 1 : dow === 6 ? 1 : 7 - dow;
  const followupDate = localDateString(timezone, daysUntilFollowup);
  const [year, month, day] = followupDate.split("-").map(Number);
  return zonedTimeToUtcIso(year, month, day, 10, 0, timezone);
}

export function emptyOutingTimeValue(timezone = getBrowserTimezone()): OutingTimeValue {
  return {
    plannedFor: null,
    timezone,
    outingDateContext: null,
    outingTimeConfidence: "none",
    outingDateLabel: null,
    outingTimeLabel: null,
    outingDateTimeText: null,
    parsedDateText: null,
    parsedTimeText: null,
    parsedDateTimeISO: null,
    remindersEnabled: false,
    nextMorningFollowupEnabled: false,
    nextMorningFollowupDate: null,
  };
}
