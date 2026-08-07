const RESERVATION_TIME_ZONE = "America/New_York";

function zonedParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: RESERVATION_TIME_ZONE,
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

function timeZoneOffsetMs(date: Date) {
  const parts = zonedParts(date);
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

export function reservationNewYorkInstant(
  reservationDate: unknown,
  reservationTime: unknown,
): Date {
  const dateText = String(reservationDate ?? "");
  const timeText = String(reservationTime ?? "23:59:00").slice(0, 8);
  const [year, month, day] = dateText.split("-").map(Number);
  const [hour, minute, second = 0] = timeText.split(":").map(Number);

  if (![year, month, day, hour, minute, second].every(Number.isFinite)) {
    return new Date(Number.NaN);
  }

  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  let offset = timeZoneOffsetMs(new Date(utcGuess));
  let result = new Date(utcGuess - offset);

  // Re-evaluate at the resolved instant so DST transitions use the correct offset.
  const correctedOffset = timeZoneOffsetMs(result);
  if (correctedOffset !== offset) {
    offset = correctedOffset;
    result = new Date(utcGuess - offset);
  }

  return result;
}
