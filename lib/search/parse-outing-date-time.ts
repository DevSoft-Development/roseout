export type OutingTimeConfidence = "explicit" | "vague" | "none";

export type ParsedOutingDateTime = {
  outingDateLabel: string | null;
  outingTimeLabel: string | null;
  outingDateTimeText: string | null;
  outingTimeConfidence: OutingTimeConfidence;
  parsedDateText: string | null;
  parsedTimeText: string | null;
  parsedDateTimeISO: string | null;
};

function formatTime(hourText: string, minuteText: string | undefined, meridiem: string) {
  const hour = Number(hourText);
  const minute = minuteText || "00";
  return `${hour}:${minute} ${meridiem.toUpperCase()}`;
}

export function parseOutingDateTime(rawQuery: string, now = new Date()): ParsedOutingDateTime {
  void now;
  const query = String(rawQuery || "").toLowerCase();
  const afterTimeMatch = query.match(/\bafter\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  const explicitTimeMatch = query.match(/\b(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  const datePatterns = [
    { pattern: /\btonight\b/, label: "Tonight" },
    { pattern: /\btomorrow\b/, label: "Tomorrow" },
    { pattern: /\btoday\b/, label: "Today" },
    { pattern: /\bthis friday\b/, label: "This Friday" },
    { pattern: /\bthis saturday\b/, label: "This Saturday" },
    { pattern: /\bthis sunday\b/, label: "This Sunday" },
    { pattern: /\bfriday\b/, label: "Friday" },
    { pattern: /\bsaturday\b/, label: "Saturday" },
    { pattern: /\bsunday\b/, label: "Sunday" },
    { pattern: /\bmonday\b/, label: "Monday" },
    { pattern: /\btuesday\b/, label: "Tuesday" },
    { pattern: /\bwednesday\b/, label: "Wednesday" },
    { pattern: /\bthursday\b/, label: "Thursday" },
    { pattern: /\bthis weekend\b/, label: "This weekend" },
  ];
  const vagueTimePatterns = [
    { pattern: /\blate night\b/, label: "Late night" },
    { pattern: /\bmorning\b/, label: "Morning" },
    { pattern: /\bafternoon\b/, label: "Afternoon" },
    { pattern: /\bevening\b/, label: "Evening" },
    { pattern: /\bnight\b/, label: "Night" },
    { pattern: /\bbrunch\b/, label: "Brunch" },
    { pattern: /\bdinner\b/, label: "Dinner" },
    { pattern: /\blunch\b/, label: "Lunch" },
  ];
  const dateMatch = datePatterns.find((item) => item.pattern.test(query));
  const vagueTimeMatch = vagueTimePatterns.find((item) => item.pattern.test(query));
  const outingDateLabel = dateMatch?.label || null;
  let outingTimeLabel: string | null = null;
  let parsedTimeText: string | null = null;
  let outingTimeConfidence: OutingTimeConfidence = "none";
  if (afterTimeMatch) {
    outingTimeLabel = `After ${formatTime(afterTimeMatch[1], afterTimeMatch[2], afterTimeMatch[3])}`;
    parsedTimeText = afterTimeMatch[0];
    outingTimeConfidence = "explicit";
  } else if (explicitTimeMatch) {
    outingTimeLabel = formatTime(explicitTimeMatch[1], explicitTimeMatch[2], explicitTimeMatch[3]);
    parsedTimeText = explicitTimeMatch[0].replace(/^at\s+/, "");
    outingTimeConfidence = "explicit";
  } else if (vagueTimeMatch) {
    outingTimeLabel = vagueTimeMatch.label;
    parsedTimeText = vagueTimeMatch.label.toLowerCase();
    outingTimeConfidence = "vague";
  } else if (outingDateLabel) {
    outingTimeConfidence = "vague";
  }
  const parsedDateText = dateMatch ? rawQuery.match(dateMatch.pattern)?.[0] || dateMatch.label : null;
  let outingDateTimeText: string | null = null;
  if (outingDateLabel && outingTimeLabel) outingDateTimeText = outingTimeConfidence === "vague" ? `${outingDateLabel} ${outingTimeLabel.toLowerCase()}` : `${outingDateLabel} at ${outingTimeLabel}`;
  else if (outingDateLabel) outingDateTimeText = outingDateLabel;
  else if (outingTimeLabel) outingDateTimeText = outingTimeLabel;
  return { outingDateLabel, outingTimeLabel, outingDateTimeText, outingTimeConfidence, parsedDateText, parsedTimeText, parsedDateTimeISO: null };
}
