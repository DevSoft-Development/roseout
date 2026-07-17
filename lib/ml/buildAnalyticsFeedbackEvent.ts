import { normalizeEventName, type CanonicalEventName } from "@/lib/analytics/events";
import { createDedupeKey } from "@/lib/analytics/identity";

export const ANALYTICS_SCHEMA_VERSION = 1;
export const FEEDBACK_WEIGHTS: Readonly<Partial<Record<CanonicalEventName, number>>> = {
  location_impression: 0, pair_impression: 0, location_clicked: 0.2, pair_clicked: 0.25,
  location_saved: 0.6, pair_saved: 0.7, directions_clicked: 0.65, phone_clicked: 0.7, website_clicked: 0.55,
  external_reservation_clicked: 0.8, call_to_reserve_clicked: 0.8, reservation_started: 0.85,
  reservation_completed: 1, outing_completed: 1.2, result_hidden: -0.5, result_feedback_positive: 0.8,
  result_feedback_negative: -0.9, location_unsaved: -0.25, pair_unsaved: -0.3,
};
export function buildAnalyticsFeedbackEvent(input: Record<string, any>) {
  const normalized = normalizeEventName(input.event_name);
  if (!normalized) return null;
  const weight = FEEDBACK_WEIGHTS[normalized.canonical] ?? 0;
  const occurredAt = typeof input.occurred_at === "string" ? input.occurred_at : new Date().toISOString();
  const output = { ...input, event_name: normalized.canonical, canonical_event_name: normalized.canonical, schema_version: ANALYTICS_SCHEMA_VERSION, feedback_polarity: weight > 0 ? "positive" : weight < 0 ? "negative" : null, feedback_weight: weight, occurred_at: occurredAt };
  return { ...output, dedupe_key: input.dedupe_key || createDedupeKey(output), metadata: { ...(input.metadata || {}), ...(normalized.original !== normalized.canonical ? { original_event_name: normalized.original } : {}) } };
}
