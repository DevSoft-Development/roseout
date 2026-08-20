const EASTERN_TIME_ZONE = "America/New_York";

function partsInEastern(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TIME_ZONE,
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

export function easternDateTimeToIso(dateValue: string, timeValue: string) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue.trim());
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(timeValue.trim());
  if (!dateMatch || !timeMatch) throw new Error("Choose a valid date and time.");

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
    throw new Error("Choose a valid date and time.");
  }

  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const guess = new Date(wallClockAsUtc);
  const guessParts = partsInEastern(guess);
  const guessWallClock = Date.UTC(
    Number(guessParts.year),
    Number(guessParts.month) - 1,
    Number(guessParts.day),
    Number(guessParts.hour),
    Number(guessParts.minute),
    Number(guessParts.second),
  );
  const offsetMs = guessWallClock - wallClockAsUtc;
  const result = new Date(wallClockAsUtc - offsetMs);
  const resultParts = partsInEastern(result);

  if (
    Number(resultParts.year) !== year ||
    Number(resultParts.month) !== month ||
    Number(resultParts.day) !== day ||
    Number(resultParts.hour) !== hour ||
    Number(resultParts.minute) !== minute
  ) {
    throw new Error("That local time is not available in Eastern Time. Choose another time.");
  }

  return result.toISOString();
}

export { EASTERN_TIME_ZONE };
