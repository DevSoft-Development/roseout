export type SearchOutcomeEventKind =
  | "impression"
  | "click"
  | "profile_open"
  | "save"
  | "booking_action"
  | "call"
  | "directions"
  | "share"
  | "abandonment"
  | "query_reformulation";

export type SearchOutcomeState =
  | "impressed"
  | "engaged"
  | "meaningful_engagement"
  | "conversion_intent"
  | "reformulated"
  | "abandoned";

export const SEARCH_OUTCOME_EVENT_PRECEDENCE: Record<SearchOutcomeEventKind, number> = {
  impression: 10,
  abandonment: 20,
  query_reformulation: 30,
  click: 40,
  profile_open: 50,
  share: 55,
  save: 60,
  directions: 70,
  call: 80,
  booking_action: 90,
};

export const SEARCH_OUTCOME_STATE_PRECEDENCE: Record<SearchOutcomeState, number> = {
  impressed: 10,
  abandoned: 20,
  reformulated: 30,
  engaged: 40,
  meaningful_engagement: 60,
  conversion_intent: 90,
};

const EVENT_ALIASES: Record<string, SearchOutcomeEventKind> = {
  search_impression: "impression",
  impression: "impression",
  result_impression: "impression",
  click: "click",
  search_click: "click",
  result_click: "click",
  profile_open: "profile_open",
  profile_view: "profile_open",
  profile_opened: "profile_open",
  save: "save",
  saved: "save",
  plan_saved: "save",
  booking_action: "booking_action",
  reservation_started: "booking_action",
  reservation_click: "booking_action",
  booking_click: "booking_action",
  call: "call",
  phone_click: "call",
  directions: "directions",
  directions_click: "directions",
  share: "share",
  share_click: "share",
  abandonment: "abandonment",
  abandoned: "abandonment",
  query_reformulation: "query_reformulation",
  reformulation: "query_reformulation",
};

export function normalizeSearchOutcomeEventKind(value: unknown): SearchOutcomeEventKind | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return EVENT_ALIASES[key] ?? null;
}

export function stateForSearchOutcomeEvent(kind: SearchOutcomeEventKind): SearchOutcomeState {
  if (kind === "booking_action" || kind === "call" || kind === "directions") return "conversion_intent";
  if (kind === "save" || kind === "share" || kind === "profile_open") return "meaningful_engagement";
  if (kind === "click") return "engaged";
  if (kind === "query_reformulation") return "reformulated";
  if (kind === "abandonment") return "abandoned";
  return "impressed";
}

export function chooseOutcomeState(events: Iterable<SearchOutcomeEventKind>): SearchOutcomeState {
  let best: SearchOutcomeState = "impressed";
  for (const event of events) {
    const state = stateForSearchOutcomeEvent(event);
    if (SEARCH_OUTCOME_STATE_PRECEDENCE[state] > SEARCH_OUTCOME_STATE_PRECEDENCE[best]) best = state;
  }
  return best;
}

export function searchOutcomeColumnsFor(kind: SearchOutcomeEventKind) {
  return {
    impression_count: kind === "impression" ? 1 : 0,
    click_count: kind === "click" ? 1 : 0,
    profile_open_count: kind === "profile_open" ? 1 : 0,
    save_count: kind === "save" ? 1 : 0,
    booking_action_count: kind === "booking_action" ? 1 : 0,
    call_count: kind === "call" ? 1 : 0,
    directions_count: kind === "directions" ? 1 : 0,
    share_count: kind === "share" ? 1 : 0,
    abandonment_count: kind === "abandonment" ? 1 : 0,
    query_reformulation_count: kind === "query_reformulation" ? 1 : 0,
  } as const;
}
