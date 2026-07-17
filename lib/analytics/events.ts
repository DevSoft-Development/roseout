export const CANONICAL_EVENT_NAMES = [
  "search_started", "search_completed", "search_failed", "search_no_results", "search_results_impression",
  "location_impression", "location_clicked", "pair_impression", "pair_clicked", "result_hidden",
  "result_feedback_positive", "result_feedback_negative", "location_saved", "location_unsaved", "pair_saved", "pair_unsaved",
  "outing_created", "outing_updated", "outing_completed", "outing_cancelled", "directions_clicked", "phone_clicked",
  "website_clicked", "reservation_started", "reservation_completed", "external_reservation_clicked", "call_to_reserve_clicked",
] as const;

export type CanonicalEventName = (typeof CANONICAL_EVENT_NAMES)[number];

export const EVENT_ALIASES: Readonly<Record<string, CanonicalEventName>> = {
  search: "search_started", search_submitted: "search_started", search_results: "search_completed",
  search_succeeded: "search_completed", no_results: "search_no_results", result_clicked: "location_clicked",
  location_click: "location_clicked", favorite_added: "location_saved", plan_saved: "outing_created",
  guest_plan_saved: "outing_created", outing_plan_created: "outing_created", reservation_click: "reservation_started",
  reservation_created: "reservation_completed", call_clicked: "phone_clicked", directions_click: "directions_clicked",
  website_click: "website_clicked", result_dismissed: "result_hidden", thumbs_up: "result_feedback_positive",
  thumbs_down: "result_feedback_negative",
};

const names = new Set<string>(CANONICAL_EVENT_NAMES);
export function normalizeEventName(value: unknown): { canonical: CanonicalEventName; original: string } | null {
  if (typeof value !== "string") return null;
  const original = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!original) return null;
  const canonical = (names.has(original) ? original : EVENT_ALIASES[original]) as CanonicalEventName | undefined;
  return canonical ? { canonical, original } : null;
}
