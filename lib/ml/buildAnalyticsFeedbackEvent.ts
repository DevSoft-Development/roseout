import {
  getMlFeedbackSignal,
  isMlFeedbackSignalName,
  type MlFeedbackSignalName,
} from "@/lib/ml/feedbackSignals";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

type JsonRecord = Record<string, JsonValue>;

const EVENT_ALIASES: Record<string, MlFeedbackSignalName> = {
  impression: "impression",
  result_impression: "impression",
  search_result_impression: "impression",
  location_impression: "impression",
  view: "view",
  result_view: "view",
  location_view: "view",
  click: "click",
  result_click: "click",
  location_click: "click",
  website_click: "website_click",
  website_opened: "website_click",
  directions_opened: "directions_opened",
  directions_click: "directions_opened",
  phone_call: "phone_call",
  call_click: "phone_call",
  saved: "saved",
  save: "saved",
  favorite_added: "saved",
  reservation_started: "reservation_started",
  reservation_click: "reservation_started",
  reserve_click: "reservation_started",
  reservation_completed: "reservation_completed",
  booking_completed: "reservation_completed",
  result_hidden: "result_hidden",
  hide_result: "result_hidden",
  not_interested: "result_hidden",
};

function text(value: unknown, maxLength = 300) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function safeRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  try {
    return JSON.parse(JSON.stringify(value)) as JsonRecord;
  } catch {
    return {};
  }
}

function compactFingerprint(value: unknown) {
  const candidate = text(value, 120);
  return candidate || null;
}

function normalizePairId(value: unknown) {
  const candidate = text(value, 300);
  return candidate || null;
}

function resolveSignalName(eventName: string): MlFeedbackSignalName | null {
  const normalized = eventName.trim().toLowerCase();
  if (isMlFeedbackSignalName(normalized)) return normalized;
  return EVENT_ALIASES[normalized] ?? null;
}

export type MlAnalyticsFeedbackFields = {
  ml_schema_version: string | null;
  ml_signal_weight: number | null;
  ml_signal_polarity: string | null;
  query_fingerprint: string | null;
  pair_id: string | null;
  dedupe_key: string | null;
  metadata: JsonRecord;
};

export function buildAnalyticsFeedbackEvent(input: {
  eventName: string;
  metadata?: unknown;
  sessionId?: string | null;
  locationId?: string | null;
  outingId?: string | null;
}): MlAnalyticsFeedbackFields {
  const metadata = safeRecord(input.metadata);
  const signalName = resolveSignalName(input.eventName);
  const queryFingerprint = compactFingerprint(
    metadata.query_fingerprint ?? metadata.search_fingerprint,
  );
  const pairId = normalizePairId(metadata.pair_id ?? metadata.ml_pair_id);
  const clientEventId = text(
    metadata.client_event_id ?? metadata.event_id ?? metadata.idempotency_key,
    180,
  );

  if (!signalName) {
    return {
      ml_schema_version: null,
      ml_signal_weight: null,
      ml_signal_polarity: null,
      query_fingerprint: queryFingerprint,
      pair_id: pairId,
      dedupe_key: clientEventId || null,
      metadata,
    };
  }

  const signal = getMlFeedbackSignal(signalName);
  const dedupeKey = clientEventId
    ? `ml:${signalName}:${clientEventId}`
    : null;

  return {
    ml_schema_version: signal.schemaVersion,
    ml_signal_weight: signal.weight,
    ml_signal_polarity: signal.polarity,
    query_fingerprint: queryFingerprint,
    pair_id: pairId,
    dedupe_key: dedupeKey,
    metadata: {
      ...metadata,
      ml_event_name: signalName,
      ml_schema_version: signal.schemaVersion,
      ml_signal_weight: signal.weight,
      ml_signal_polarity: signal.polarity,
      ...(queryFingerprint ? { query_fingerprint: queryFingerprint } : {}),
      ...(pairId ? { pair_id: pairId } : {}),
      ...(input.sessionId ? { ml_session_context: text(input.sessionId, 180) } : {}),
      ...(input.locationId ? { ml_location_context: text(input.locationId, 80) } : {}),
      ...(input.outingId ? { ml_outing_context: text(input.outingId, 80) } : {}),
    },
  };
}
