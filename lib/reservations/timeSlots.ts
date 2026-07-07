export const RESERVATION_TIME_ZONE = "America/New_York";

export function getTodayLocalDate(timeZone = RESERVATION_TIME_ZONE) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function getLocalParts(date = new Date(), timeZone = RESERVATION_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);

  const rawHour = Number(parts.find((p) => p.type === "hour")?.value || "0");
  const hour = rawHour === 24 ? 0 : rawHour;
  const minute = Number(parts.find((p) => p.type === "minute")?.value || "0");

  return { hour, minute };
}

export function roundUpToNextQuarter(hour: number, minute: number) {
  let total = hour * 60 + minute;
  total = Math.floor(total / 15) * 15 + 15;

  if (total >= 24 * 60) {
    return { hour: 23, minute: 45 };
  }

  return {
    hour: Math.floor(total / 60),
    minute: total % 60,
  };
}

export function toTimeValue(hour: number, minute: number) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function getNextFutureQuarterTime(timeZone = RESERVATION_TIME_ZONE) {
  const { hour, minute } = getLocalParts(new Date(), timeZone);
  const rounded = roundUpToNextQuarter(hour, minute);
  return toTimeValue(rounded.hour, rounded.minute);
}

export function generateQuarterHourOptions(options?: {
  selectedDate?: string | null;
  timeZone?: string;
  startHour?: number;
  endHour?: number;
}) {
  const timeZone = options?.timeZone || RESERVATION_TIME_ZONE;
  const selectedDate = options?.selectedDate || getTodayLocalDate(timeZone);
  const today = getTodayLocalDate(timeZone);
  const startHour = options?.startHour ?? 0;
  const endHour = options?.endHour ?? 23;

  let minMinutes = startHour * 60;
  if (selectedDate === today) {
    const now = getLocalParts(new Date(), timeZone);
    const next = roundUpToNextQuarter(now.hour, now.minute);
    minMinutes = Math.max(minMinutes, next.hour * 60 + next.minute);
  }

  const maxMinutes = endHour * 60 + 45;
  const slots: Array<{ value: string; label: string }> = [];
  for (let total = minMinutes; total <= maxMinutes; total += 15) {
    const hour = Math.floor(total / 60);
    const minute = total % 60;
    const value = toTimeValue(hour, minute);
    const label = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "UTC",
    }).format(new Date(`1970-01-01T${value}:00Z`));
    slots.push({ value, label });
  }
  return slots;
}

export function clampReservationDate(value?: string | null, timeZone = RESERVATION_TIME_ZONE) {
  const today = getTodayLocalDate(timeZone);
  if (!value || value < today) return today;
  return value;
}

export function normalizeReservationFormDateTime(input?: {
  reservationDate?: string | null;
  reservationTime?: string | null;
  timeZone?: string;
}) {
  const timeZone = input?.timeZone || RESERVATION_TIME_ZONE;
  const reservationDate = clampReservationDate(input?.reservationDate, timeZone);
  const today = getTodayLocalDate(timeZone);
  const nextTime = getNextFutureQuarterTime(timeZone);
  let reservationTime = (input?.reservationTime || nextTime).slice(0, 5);
  if (reservationDate === today && reservationTime < nextTime) reservationTime = nextTime;
  return { reservationDate, reservationTime };
}

export function isReservationDateTimeInPast(date?: string | null, time?: string | null, timeZone = RESERVATION_TIME_ZONE) {
  const reservationDate = String(date || "");
  const reservationTime = String(time || "").slice(0, 5);
  const today = getTodayLocalDate(timeZone);
  if (!reservationDate || !reservationTime) return false;
  if (reservationDate < today) return true;
  if (reservationDate > today) return false;
  return reservationTime < getNextFutureQuarterTime(timeZone);
}
