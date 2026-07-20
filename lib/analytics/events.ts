export const CANONICAL_EVENT_NAMES = [
  "search_started", "search_completed", "search_failed", "search_repeated", "search_refined", "search_no_results", "search_results_impression",
  "candidate_generated", "candidate_eligible", "result_ranked", "result_rendered", "result_seen", "result_clicked", "result_opened", "result_saved", "result_unsaved",
  "location_impression", "location_clicked", "pair_impression", "pair_clicked", "result_hidden",
  "result_feedback_positive", "result_feedback_negative", "location_saved", "location_unsaved", "pair_saved", "pair_unsaved",
  "reservation_started", "reservation_completed", "external_reservation_clicked", "call_clicked", "phone_clicked", "website_clicked", "directions_clicked", "outing_created", "outing_updated", "outing_completed", "outing_cancelled", "call_to_reserve_clicked",
  "not_a_fit", "wrong_category", "too_far", "wrong_vibe", "too_expensive", "closed_or_unavailable", "duplicate", "bad_pair", "bad_photo", "immediate_research",
] as const;

export type CanonicalEventName = (typeof CANONICAL_EVENT_NAMES)[number];

export const EVENT_ALIASES: Readonly<Record<string, CanonicalEventName>> = {
  search: "search_started", search_submitted: "search_started", search_results: "search_completed",
  search_succeeded: "search_completed", no_results: "search_no_results", search_zero_results: "search_no_results",
  result_impression: "result_rendered", search_result_impression: "result_rendered", location_view: "result_seen", location_viewed: "result_seen",
  pair_impression: "result_rendered", location_impression: "result_rendered", result_viewed: "result_seen", view: "result_seen",
  result_click: "result_clicked", result_clicked: "result_clicked", location_click: "result_clicked", location_clicked: "result_clicked", pair_clicked: "result_clicked", card_click: "result_clicked",
  result_open: "result_opened", favorite_added: "location_saved", location_saved: "result_saved", pair_saved: "result_saved", saved: "result_saved", save: "result_saved",
  location_unsaved: "result_unsaved", pair_unsaved: "result_unsaved", unsaved: "result_unsaved", unsave: "result_unsaved",
  plan_saved: "outing_created", guest_plan_saved: "outing_created", outing_plan_created: "outing_created",
  reservation_click: "reservation_started", reserve_clicked: "reservation_started", reservation_clicked: "reservation_started", reservation_created: "reservation_completed",
  phone_clicked: "call_clicked", call_to_reserve_clicked: "call_clicked", call_click: "call_clicked", directions_click: "directions_clicked", website_click: "website_clicked",
  result_dismissed: "result_hidden", hidden: "result_hidden", not_interested: "not_a_fit", bad_result: "not_a_fit", thumbs_up: "result_feedback_positive",
  thumbs_down: "result_feedback_negative", reported_bad_match: "wrong_vibe", closed_unavailable: "closed_or_unavailable", bad_match: "bad_pair",
};

const names = new Set<string>(CANONICAL_EVENT_NAMES);
export function normalizeEventName(value: unknown): { canonical: CanonicalEventName; original: string } | null {
  if (typeof value !== "string") return null;
  const original = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!original) return null;
  const canonical = (names.has(original) ? original : EVENT_ALIASES[original]) as CanonicalEventName | undefined;
  return canonical ? { canonical, original } : null;
}
