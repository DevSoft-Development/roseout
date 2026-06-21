export const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export type OperatingHoursJson = Partial<Record<Weekday, string[]>>;
export type HoursValidationError = { lineNumber: number; line: string; message: string };
const DAY_LABELS: Record<Weekday, string> = { monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday", thursday: "Thursday", friday: "Friday", saturday: "Saturday", sunday: "Sunday" };
const EXAMPLE_BY_DAY: Record<Weekday, string> = { monday: "Monday - 8:30 AM - 10:30 PM", tuesday: "Tuesday - 8:30 AM - 10:30 PM", wednesday: "Wednesday - 8:30 AM - 10:30 PM", thursday: "Thursday - 8:30 AM - 10:30 PM", friday: "Friday - 8:30 AM - 11:30 PM", saturday: "Saturday - 10:00 AM - 11:30 PM", sunday: "Sunday - 10:00 AM - 9:00 PM" };

export function normalizeDayName(value: unknown): Weekday | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return (WEEKDAYS as readonly string[]).includes(normalized) ? normalized as Weekday : null;
}

function parseValue(value: unknown): unknown {
  if (!value) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try { return JSON.parse(trimmed); } catch { return trimmed; }
  }
  return value;
}

function coerceOperatingHours(value: unknown): OperatingHoursJson {
  const parsed = parseValue(value);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") return {};
  const result: OperatingHoursJson = {};
  Object.entries(parsed as Record<string, unknown>).forEach(([key, raw]) => {
    const day = normalizeDayName(key);
    if (!day) return;
    if (Array.isArray(raw)) result[day] = raw.map(String).filter(Boolean);
    else if (typeof raw === "string" && raw.trim()) result[day] = [raw.trim()];
    else if (raw == null) result[day] = [];
  });
  return result;
}

export function operatingHoursJsonToHumanText(value: unknown): string {
  const hours = coerceOperatingHours(value);
  return WEEKDAYS.map((day) => {
    const ranges = hours[day];
    if (!ranges) return "";
    return `${DAY_LABELS[day]} - ${ranges.length ? ranges.join(", ") : "Closed"}`;
  }).filter(Boolean).join("\n");
}

function normalizeTime(value: string): string | null {
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?$/i);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
  return `${hour}:${String(minute).padStart(2, "0")} ${match[3].toUpperCase()}M`;
}

export function normalizeTimeRange(value: unknown): string | null {
  const normalized = String(value ?? "").trim().replace(/\s+/g, " ");
  const match = normalized.match(/^(\d{1,2}(?::\d{2})?\s*(?:[ap]\.?m\.?))\s*-\s*(\d{1,2}(?::\d{2})?\s*(?:[ap]\.?m\.?))$/i);
  if (!match) return null;
  const start = normalizeTime(match[1]);
  const end = normalizeTime(match[2]);
  return start && end ? `${start} - ${end}` : null;
}

function splitLine(line: string): { day: Weekday | null; rest: string } {
  const match = line.trim().match(/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b\s*(?:-|:)?\s*(.*)$/i);
  return { day: normalizeDayName(match?.[1]), rest: match?.[2]?.trim() ?? "" };
}

export function validateHumanHoursText(text: string): { valid: boolean; errors: HoursValidationError[] } {
  const errors: HoursValidationError[] = [];
  text.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;
    const { day, rest } = splitLine(line);
    if (!day || !rest) { errors.push({ lineNumber: index + 1, line, message: `Line ${index + 1} could not be understood. Use this format: Wednesday - 8:30 AM - 10:30 PM` }); return; }
    if (/^closed$/i.test(rest)) return;
    const badRange = rest.split(",").map((range) => range.trim()).some((range) => !normalizeTimeRange(range));
    if (badRange) errors.push({ lineNumber: index + 1, line, message: `Line ${index + 1} could not be understood. Use this format: ${EXAMPLE_BY_DAY[day]}` });
  });
  return { valid: errors.length === 0, errors };
}

export function humanTextToOperatingHoursJson(text: string): OperatingHoursJson {
  const validation = validateHumanHoursText(text);
  if (!validation.valid) throw new Error(validation.errors[0]?.message || "Invalid weekly hours");
  const result: OperatingHoursJson = {};
  text.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;
    const { day, rest } = splitLine(line);
    if (!day) return;
    result[day] = /^closed$/i.test(rest) ? [] : rest.split(",").map((range) => normalizeTimeRange(range)).filter(Boolean) as string[];
  });
  return result;
}
