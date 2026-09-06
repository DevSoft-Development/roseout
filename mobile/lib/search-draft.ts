export type MobileSearchDraft = {
  query: string;
  when: "now" | "tonight" | "tomorrow" | "weekend" | "custom";
  area: string;
  partySize: "1" | "2" | "3-4" | "5-8" | "9+";
  budget: "$" | "$$" | "$$$" | "$$$$";
  travel: "walking" | "nearby" | "reasonable";
};

export const DEFAULT_MOBILE_SEARCH_DRAFT: MobileSearchDraft = {
  query: "",
  when: "tonight",
  area: "Near me",
  partySize: "2",
  budget: "$$",
  travel: "nearby",
};

export function serializeSearchDraft(draft: MobileSearchDraft) {
  return {
    query: draft.query.trim(),
    when: draft.when,
    area: draft.area.trim() || "Near me",
    partySize: draft.partySize,
    budget: draft.budget,
    travel: draft.travel,
  };
}
