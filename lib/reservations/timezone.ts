const DEFAULT_RESERVATION_TIME_ZONE = "America/New_York";

function partsFor(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function offsetMsAt(date: Date, timeZone: string) {
  const parts = partsFor(date, timeZone);
  const representedUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return representedUtc - date.getTime();
}

export function reservationLocalDateTimeToUtc(
  reservationDate: string,
  reservationTime: string,
  timeZone = DEFAULT_RESERVATION_TIME_ZONE,
): Date {
  const [year, month, day] = reservationDate.split("-").map(Number);
  const [hour, minute, second = 0] = reservationTime.slice(0, 8).split(":").map(Number);
  if (![year, month, day, hour, minute, second].every(Number.isFinite)) {
    return new Date(Number.NaN);
  }

  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  let offset = offsetMsAt(new Date(utcGuess), timeZone);
  let result = new Date(utcGuess - offset);
  const correctedOffset = offsetMsAt(result, timeZone);
  if (correctedOffset !== offset) {
    offset = correctedOffset;
    result = new Date(utcGuess - offset);
  }
  return result;
}

export function reservationManagementTokenExpiry(
  reservationDate: string,
  reservationTime: string,
  now = new Date(),
) {
  const minimumExpiry = new Date(now.getTime() + 72 * 60 * 60 * 1000);
  const reservationStart = reservationLocalDateTimeToUtc(reservationDate, reservationTime);
  if (Number.isNaN(reservationStart.getTime())) return minimumExpiry;
  const afterReservation = new Date(reservationStart.getTime() + 24 * 60 * 60 * 1000);
  return afterReservation > minimumExpiry ? afterReservation : minimumExpiry;
}
