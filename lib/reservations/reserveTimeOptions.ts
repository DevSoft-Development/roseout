export function getTodayLocalDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function getNextQuarterTime() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date());

  const hour = Number(parts.find((p) => p.type === "hour")?.value || "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value || "0");

  let total = hour * 60 + minute;
  total = Math.floor(total / 15) * 15 + 15;

  if (total >= 24 * 60) total = 23 * 60 + 45;

  const nextHour = Math.floor(total / 60);
  const nextMinute = total % 60;

  return `${String(nextHour).padStart(2, "0")}:${String(nextMinute).padStart(2, "0")}`;
}

export function clampReservationTime(selectedDate: string, selectedTime: string) {
  const value = String(selectedTime || "").slice(0, 5);
  const today = getTodayLocalDate();
  const nextTime = getNextQuarterTime();
  if (selectedDate !== today) return value || nextTime;
  if (!value) return nextTime;
  return value < nextTime ? nextTime : value;
}

export function generateTimeOptions(selectedDate: string) {
  const today = getTodayLocalDate();
  const nextTime = getNextQuarterTime();

  const minMinutes =
    selectedDate === today
      ? Number(nextTime.slice(0, 2)) * 60 + Number(nextTime.slice(3, 5))
      : 0;

  const options = [];

  for (let total = minMinutes; total <= 23 * 60 + 45; total += 15) {
    const hour = Math.floor(total / 60);
    const minute = total % 60;
    const value = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

    const label = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(`1970-01-01T${value}:00`));

    options.push({ value, label });
  }

  return options;
}
