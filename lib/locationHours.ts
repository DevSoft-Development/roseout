export type LocationHoursFields = {
  operating_hours?: any;
  special_hours?: any;
  holiday_closures?: any;
  hours?: string | null;
  days_of_operation?: string[] | null;
  kitchen_closing_time?: string | null;
};

export function getOperatingHours(location: any) {
  return (
    location?.operating_hours ||
    location?.hours ||
    null
  );
}

export function getDaysOfOperation(location: any) {
  return Array.isArray(location?.days_of_operation)
    ? location.days_of_operation
    : [];
}

export function getKitchenClosingTime(location: any) {
  return location?.kitchen_closing_time || null;
}

function stringifyHoursValue(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;

  if (Array.isArray(value)) {
    const parts = value
      .map((item) => stringifyHoursValue(item))
      .filter(Boolean);

    return parts.length ? parts.join("; ") : null;
  }

  if (typeof value === "object") {
    const record = value as Record<string, any>;

    if (record.closed === true) return "Closed";

    const open = record.open || record.opens || record.start || record.from;
    const close = record.close || record.closes || record.end || record.to;

    if (open && close) return `${open}–${close}`;
    if (record.label || record.display || record.text) {
      return String(record.label || record.display || record.text);
    }
  }

  return null;
}

export function formatOperatingHoursForDisplay(hours: unknown) {
  if (!hours) return null;
  if (typeof hours === "string") return hours;

  if (Array.isArray(hours)) {
    return stringifyHoursValue(hours);
  }

  if (typeof hours === "object") {
    const entries = Object.entries(hours as Record<string, unknown>);

    const formattedEntries = entries
      .map(([day, value]) => {
        const formattedValue = stringifyHoursValue(value);
        return formattedValue ? `${day}: ${formattedValue}` : null;
      })
      .filter(Boolean);

    return formattedEntries.length ? formattedEntries.join("; ") : null;
  }

  return null;
}

export type TimeWindow = {
  open: string;
  close: string;
};

const DAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

function normalizeDayKey(value: string) {
  return value.toLowerCase().trim().slice(0, 3);
}

function dateKeyToDay(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return DAY_KEYS[date.getUTCDay()];
}

function parseTimeString(value: unknown) {
  if (typeof value !== "string") return null;

  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const suffix = match[3]?.toLowerCase();

  if (suffix === "pm" && hour < 12) hour += 12;
  if (suffix === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseTimeWindows(value: unknown): TimeWindow[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.flatMap((item) => parseTimeWindows(item));
  }

  if (typeof value === "string") {
    if (/closed/i.test(value)) return [];

    return value
      .split(/[,;]/)
      .map((range) => {
        const [openRaw, closeRaw] = range.split(/\s*(?:-|–|—|to)\s*/i);
        const open = parseTimeString(openRaw);
        const close = parseTimeString(closeRaw);
        return open && close ? { open, close } : null;
      })
      .filter((window): window is TimeWindow => Boolean(window));
  }

  if (typeof value === "object") {
    const record = value as Record<string, any>;

    if (record.closed === true || record.is_closed === true) return [];

    const open = parseTimeString(
      record.open || record.opens || record.start || record.from
    );
    const close = parseTimeString(
      record.close || record.closes || record.end || record.to
    );

    return open && close ? [{ open, close }] : [];
  }

  return [];
}

function findDateSpecificHours(hours: unknown, dateKey: string) {
  if (!hours) return undefined;

  if (Array.isArray(hours)) {
    return hours.find((entry) => {
      if (!entry || typeof entry !== "object") return false;
      const record = entry as Record<string, any>;
      return record.date === dateKey || record.day === dateKey;
    });
  }

  if (typeof hours === "object") {
    return (hours as Record<string, unknown>)[dateKey];
  }

  return undefined;
}

function isHolidayClosed(closures: unknown, dateKey: string) {
  if (!closures) return false;

  if (Array.isArray(closures)) {
    return closures.some((closure) => {
      if (typeof closure === "string") return closure === dateKey;
      if (!closure || typeof closure !== "object") return false;
      const record = closure as Record<string, any>;
      return record.date === dateKey || record.day === dateKey;
    });
  }

  if (typeof closures === "object") {
    const closure = (closures as Record<string, unknown>)[dateKey];
    if (typeof closure === "boolean") return closure;
    if (closure && typeof closure === "object") {
      return (closure as Record<string, any>).closed !== false;
    }
  }

  return false;
}

export function getOperatingHoursForDate(
  location: LocationHoursFields,
  dateKey: string
): TimeWindow[] | null {
  if (!location?.operating_hours || !dateKey) return null;

  if (isHolidayClosed(location.holiday_closures, dateKey)) return [];

  const specialHours = findDateSpecificHours(location.special_hours, dateKey);
  if (specialHours !== undefined) return parseTimeWindows(specialHours);

  const day = dateKeyToDay(dateKey);
  if (!day) return null;

  const operatingHours = location.operating_hours;

  if (Array.isArray(operatingHours)) {
    const dayEntry = operatingHours.find((entry) => {
      if (!entry || typeof entry !== "object") return false;
      const record = entry as Record<string, any>;
      const entryDay = String(record.day || record.days || "");
      return normalizeDayKey(entryDay) === normalizeDayKey(day);
    });

    return dayEntry ? parseTimeWindows(dayEntry) : [];
  }

  if (typeof operatingHours === "object") {
    const record = operatingHours as Record<string, unknown>;
    const value =
      record[day] ||
      record[day.slice(0, 3)] ||
      record[day[0].toUpperCase() + day.slice(1)] ||
      record[day.slice(0, 3).toUpperCase()];

    return parseTimeWindows(value);
  }

  return null;
}

export function timeWindowToSlots(
  windows: TimeWindow[],
  durationMinutes: number,
  intervalMinutes = 30
) {
  const slots: string[] = [];
  const duration = Math.max(durationMinutes, intervalMinutes);

  windows.forEach((window) => {
    const start = timeStringToMinutes(window.open);
    const rawEnd = timeStringToMinutes(window.close);

    if (start === null || rawEnd === null) return;

    // A close time at or before the open time represents the following day.
    // Keep slot starts on the selected reservation date; reservations that begin
    // after midnight belong to the next calendar date and are generated there.
    const end = rawEnd <= start ? rawEnd + 1440 : rawEnd;

    for (
      let minutes = start;
      minutes < 1440 && minutes + duration <= end;
      minutes += intervalMinutes
    ) {
      slots.push(minutesToTimeString(minutes));
    }
  });

  return Array.from(new Set(slots));
}

function timeStringToMinutes(value: string) {
  const [hourRaw, minuteRaw = "0"] = value.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

function minutesToTimeString(totalMinutes: number) {
  const hour = Math.floor(totalMinutes / 60).toString().padStart(2, "0");
  const minute = (totalMinutes % 60).toString().padStart(2, "0");
  return `${hour}:${minute}`;
}


export const WEEKDAY_LABELS = DAY_KEYS.map((key) => ({ key, label: key.charAt(0).toUpperCase() + key.slice(1) })) as { key: string; label: string }[];

export type NormalizedWeeklyHours = Record<string, string[]>;

export type LocationHoursDisplayInput = {
  operating_hours?: unknown;
  special_hours?: unknown;
  google_current_opening_hours?: unknown;
  google_regular_opening_hours?: unknown;
  google_utc_offset_minutes?: number | string | null;
  timezone?: string | null;
  time_zone?: string | null;
  city?: string | null;
  state?: string | null;
  id?: string | number | null;
  name?: string | null;
  locationId?: string | number | null;
  locationName?: string | null;
  operatingHours?: unknown;
  specialHours?: unknown;
  googleCurrentOpeningHours?: unknown;
  googleRegularOpeningHours?: unknown;
  googleUtcOffsetMinutes?: number | string | null;
};

function parseJsonMaybe(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try { return JSON.parse(trimmed); } catch { return value; }
  }
  return value;
}

function normalizeDayName(value: string) {
  const lower = value.trim().toLowerCase();
  return DAY_KEYS.find((day) => day === lower || day.slice(0, 3) === lower.slice(0, 3)) || null;
}

function cleanHourText(value: unknown): string[] {
  const parsed = parseJsonMaybe(value);
  if (parsed == null || parsed === false) return [];
  if (Array.isArray(parsed)) return parsed.flatMap(cleanHourText).filter(Boolean);
  if (typeof parsed === "object") {
    const record = parsed as Record<string, unknown>;
    if (record.closed === true || record.is_closed === true) return [];
    const text = stringifyHoursValue(record);
    return text && !/^closed$/i.test(text.trim()) ? [text.trim().replace(/–/g, " - ").replace(/\s+/g, " ")] : [];
  }
  if (typeof parsed !== "string") return [];
  const text = parsed.trim().replace(/–|—/g, " - ").replace(/\s+/g, " ");
  if (!text || /^closed$/i.test(text)) return [];
  return text.split(/\s*[,;]\s*/).map((item) => item.trim()).filter(Boolean);
}

function emptyWeek(): NormalizedWeeklyHours {
  return Object.fromEntries(DAY_KEYS.map((day) => [day, []])) as NormalizedWeeklyHours;
}

function applyGoogleWeekdayDescriptions(hours: unknown, week: NormalizedWeeklyHours) {
  const parsed = parseJsonMaybe(hours);
  if (!parsed || typeof parsed !== "object") return;
  const record = parsed as Record<string, unknown>;
  const descriptions = record.weekdayDescriptions || record.weekday_descriptions || record.weekday_text;
  if (!Array.isArray(descriptions)) return;
  descriptions.forEach((entry) => {
    const [dayRaw, ...rest] = String(entry).split(":");
    const day = normalizeDayName(dayRaw || "");
    const text = rest.join(":").trim();
    if (day) week[day] = cleanHourText(text);
  });
}

export function normalizeWeeklyHoursForDisplay(...sources: unknown[]): NormalizedWeeklyHours {
  const week = emptyWeek();
  for (const source of sources) {
    const parsed = parseJsonMaybe(source);
    if (!parsed) continue;
    applyGoogleWeekdayDescriptions(parsed, week);
    if (Array.isArray(parsed)) {
      parsed.forEach((entry) => {
        if (typeof entry !== "string") return;
        const match = entry.match(/^\s*([a-z]+)\s*:?\s*-\s*(.+)$/i);
        const day = match ? normalizeDayName(match[1]) : null;
        if (day && match?.[2]) week[day] = cleanHourText(match[2]);
      });
    }
    if (typeof parsed === "object" && !Array.isArray(parsed)) {
      Object.entries(parsed as Record<string, unknown>).forEach(([key, value]) => {
        const day = normalizeDayName(key);
        if (day) week[day] = cleanHourText(value);
      });
    }
  }
  return week;
}

function getNowParts(timezone: string, now = new Date(), utcOffsetMinutes?: number | null) {
  if (typeof utcOffsetMinutes === "number" && Number.isFinite(utcOffsetMinutes)) {
    const shifted = new Date(now.getTime() + utcOffsetMinutes * 60_000);
    return { weekday: DAY_KEYS[shifted.getUTCDay()], minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes() };
  }
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "long", hour: "numeric", minute: "numeric", hour12: false }).formatToParts(now);
  const weekday = normalizeDayName(parts.find((part) => part.type === "weekday")?.value || "") || DAY_KEYS[now.getDay()];
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0) % 24;
  const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);
  return { weekday, minutes: hour * 60 + minute };
}

function minutesToDisplay(total: number) {
  const minutes = ((total % 1440) + 1440) % 1440;
  let hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function formatUntil(minutes: number) {
  if (minutes < 60) return `Opens in ${Math.max(1, minutes)} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest >= 15) return `Opens in ${hours} hour${hours === 1 ? "" : "s"} ${rest} minutes`;
  return `Opens in ${hours} hour${hours === 1 ? "" : "s"}`;
}

function stripDayPrefix(range: string) {
  const match = range.match(/^\s*([a-z]+)\s*:?\s*-\s*(.+)$/i);
  const day = match ? normalizeDayName(match[1]) : null;
  return day && match?.[2] ? match[2] : range;
}

function parseDisplayRange(range: string) {
  const cleaned = stripDayPrefix(range);
  const [openRaw, closeRaw] = cleaned.split(/\s*(?:-|–|—|to)\s*/i);
  const open = parseTimeString(openRaw);
  const close = parseTimeString(closeRaw);
  if (!open || !close) return null;
  const openMinutes = timeStringToMinutes(open);
  let closeMinutes = timeStringToMinutes(close);
  if (openMinutes == null || closeMinutes == null) return null;
  if (closeMinutes <= openMinutes) closeMinutes += 1440;
  return { open: openMinutes, close: closeMinutes, closeText: minutesToDisplay(closeMinutes) };
}

function statusFromWeeklyHours(week: NormalizedWeeklyHours, timezone: string, now = new Date(), utcOffsetMinutes?: number | null) {
  const { weekday, minutes } = getNowParts(timezone, now, utcOffsetMinutes);
  const todayIndex = DAY_KEYS.indexOf(weekday);
  const previousDay = DAY_KEYS[(todayIndex + 6) % 7];
  for (const range of week[previousDay].map(parseDisplayRange)) {
    if (range && range.close > 1440 && minutes < range.close - 1440) return { text: `Open now · Closes at ${range.closeText}`, todayKey: weekday };
  }
  let hasUnparseableTodayHours = false;
  let nextOpen: number | null = null;
  for (const rangeText of week[weekday]) {
    const range = parseDisplayRange(rangeText);
    if (!range) { hasUnparseableTodayHours = true; continue; }
    if (minutes >= range.open && minutes < range.close) return { text: `Open now · Closes at ${range.closeText}`, todayKey: weekday };
    if (minutes < range.open && (nextOpen === null || range.open < nextOpen)) nextOpen = range.open;
  }
  if (nextOpen !== null) return { text: `Closed now · ${formatUntil(nextOpen - minutes)}`, todayKey: weekday };
  if (hasUnparseableTodayHours) return { text: "Hours listed below", todayKey: weekday };
  return { text: week[weekday].length ? "Closed now" : "Closed today", todayKey: weekday };
}

function resolveTimezone(input: LocationHoursDisplayInput) {
  const explicit = String(input.timezone || input.time_zone || "").trim();
  return explicit || "America/New_York";
}

function resolveUtcOffsetMinutes(input: LocationHoursDisplayInput) {
  if (input.timezone || input.time_zone) return null;
  const offset = Number(input.google_utc_offset_minutes ?? input.googleUtcOffsetMinutes);
  return Number.isFinite(offset) ? offset : null;
}

export function getLocationHoursDisplay(input: LocationHoursDisplayInput, now = new Date()) {
  const weeklyHours = normalizeWeeklyHoursForDisplay(
    input.operating_hours ?? input.operatingHours,
    input.google_current_opening_hours ?? input.googleCurrentOpeningHours,
    input.google_regular_opening_hours ?? input.googleRegularOpeningHours,
  );
  const hasUsableHours = DAY_KEYS.some((day) => weeklyHours[day].length > 0);
  if (!hasUsableHours) {
    const todayKey = getNowParts(resolveTimezone(input), now, resolveUtcOffsetMinutes(input)).weekday;
    return { statusText: "Hours not available", weeklyHours, hasUsableHours, todayKey, timezone: resolveTimezone(input) };
  }
  const timezone = resolveTimezone(input);
  const status = statusFromWeeklyHours(weeklyHours, timezone, now, resolveUtcOffsetMinutes(input));
  return { statusText: status.text, weeklyHours, hasUsableHours, todayKey: status.todayKey, timezone };
}
