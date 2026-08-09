function normalized(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const OPERATIONAL_EVENT_TYPES = new Set([
  "production event",
  "theater load in and load outs",
]);

const OPERATIONAL_TITLE_PATTERNS: RegExp[] = [
  /^permitted film event$/,
  /\bproduction parking\b/,
  /\b(?:closure|closures|closed)\b/,
  /\bmaintenance\b/,
  /\bconstruction\b/,
  /\bno amplified sound\b/,
  /\bload in\b/,
  /\bload out\b/,
];

export type ConsumerEventEligibility = {
  searchable: boolean;
  reason: string | null;
};

export function classifyNycConsumerEventEligibility({
  title,
  eventType,
}: {
  title: unknown;
  eventType?: unknown;
}): ConsumerEventEligibility {
  const normalizedTitle = normalized(title);
  const normalizedType = normalized(eventType);

  if (OPERATIONAL_EVENT_TYPES.has(normalizedType)) {
    return { searchable: false, reason: `operational_event_type:${normalizedType}` };
  }

  if (OPERATIONAL_TITLE_PATTERNS.some((pattern) => pattern.test(normalizedTitle))) {
    return { searchable: false, reason: "operational_event_title" };
  }

  return { searchable: true, reason: null };
}
