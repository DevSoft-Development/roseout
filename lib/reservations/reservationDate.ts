export type ReservationDateParts = {
  year: number;
  month: number;
  day: number;
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function newYorkTodayISO(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return now.toISOString().slice(0, 10);
  }

  return `${year}-${month}-${day}`;
}

export function parseReservationISODate(value: string): ReservationDateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) {
    const fallback = newYorkTodayISO();
    return parseReservationISODate(fallback);
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

export function reservationDaysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function reservationPartsToISO(parts: ReservationDateParts) {
  const month = Math.min(12, Math.max(1, Number(parts.month || 1)));
  const maxDay = reservationDaysInMonth(parts.year, month);
  const day = Math.min(maxDay, Math.max(1, Number(parts.day || 1)));
  return `${parts.year}-${pad(month)}-${pad(day)}`;
}

export function updateReservationDatePart(
  currentISO: string,
  part: keyof ReservationDateParts,
  value: number,
  minimumISO = newYorkTodayISO(),
) {
  const current = parseReservationISODate(currentISO);
  const next = reservationPartsToISO({ ...current, [part]: value });
  return next < minimumISO ? minimumISO : next;
}

export function addReservationDays(iso: string, days: number) {
  const { year, month, day } = parseReservationISODate(iso);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}
