export type UnknownRecord = Record<string, unknown>;

export function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : {};
}

export function firstString(record: UnknownRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

export function firstNumber(record: UnknownRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

export function firstBoolean(record: UnknownRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      if (["true", "yes", "y", "1", "free"].includes(value.trim().toLowerCase())) return true;
      if (["false", "no", "n", "0"].includes(value.trim().toLowerCase())) return false;
    }
  }
  return null;
}

export function combineDateAndTime(date: string | null, time: string | null, timezoneOffset = "-04:00") {
  if (!date) return null;
  const trimmed = date.trim();
  if (/T\d{2}:\d{2}/.test(trimmed)) return trimmed;
  const clock = time?.trim() || "00:00:00";
  const normalizedClock = /^\d{2}:\d{2}$/.test(clock) ? `${clock}:00` : clock;
  return `${trimmed}T${normalizedClock}${timezoneOffset}`;
}

export function firstImageUrl(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  for (const item of value) {
    const record = asRecord(item);
    const url = firstString(record, ["url", "image_url", "image"]);
    if (url) return url;
  }
  return null;
}
