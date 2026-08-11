const RESERVATION_TIME_ZONE = "America/New_York";

type NewYorkClock = {
  date: string;
  hour: number;
  minute: number;
};

function newYorkClock(now = new Date()): NewYorkClock {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: RESERVATION_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || "";

  const year = value("year");
  const month = value("month");
  const day = value("day");

  return {
    date: `${year}-${month}-${day}`,
    hour: Number(value("hour") || 0),
    minute: Number(value("minute") || 0),
  };
}

function timeMinutes(time: string) {
  const [hourRaw, minuteRaw] = String(time || "").slice(0, 5).split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

export function isReservationTimeInPastNewYork(
  reservationDate: string,
  reservationTime: string,
  now = new Date(),
) {
  const clock = newYorkClock(now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reservationDate)) return false;

  if (reservationDate < clock.date) return true;
  if (reservationDate > clock.date) return false;

  const slotMinutes = timeMinutes(reservationTime);
  if (slotMinutes === null) return false;

  const currentMinutes = clock.hour * 60 + clock.minute;
  return slotMinutes <= currentMinutes;
}
