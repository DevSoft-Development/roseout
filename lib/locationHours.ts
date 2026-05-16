export type LocationHoursFields = {
  operating_hours?: any;
  special_hours?: any;
  holiday_closures?: any;
  hours?: string | null;
  hours_of_operation?: string | null;
  days_of_operation?: string[] | null;
  kitchen_closing_time?: string | null;
};

export function getOperatingHours(location: any) {
  return (
    location?.operating_hours ||
    location?.hours ||
    location?.hours_of_operation ||
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
    const end = timeStringToMinutes(window.close);

    if (start === null || end === null || end <= start) return;

    for (let minutes = start; minutes + duration <= end; minutes += intervalMinutes) {
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
