export type MobilePlanType = "outing" | "restaurant" | "activity";

export type MobileSearchDraft = {
  query: string;
  planType: MobilePlanType;
  when: "today" | "tonight" | "tomorrow" | "weekend" | "none" | "custom";
  customDate: string;
  customTime: string;
  area: string;
  areaSource: "search" | "manual" | "device" | "default";
  latitude: number | null;
  longitude: number | null;
  partySize: "1" | "2" | "3-4" | "5-8" | "9+";
  budget: "$" | "$$" | "$$$" | "$$$$";
  travel: "walking" | "nearby" | "reasonable";
  preferences: string[];
  customMatters: string[];
};

export const DEFAULT_MOBILE_SEARCH_DRAFT: MobileSearchDraft = {
  query: "",
  planType: "outing",
  when: "none",
  customDate: "",
  customTime: "",
  area: "Near me",
  areaSource: "default",
  latitude: null,
  longitude: null,
  partySize: "2",
  budget: "$$",
  travel: "nearby",
  preferences: [],
  customMatters: [],
};

export function serializeSearchDraft(draft: MobileSearchDraft) {
  return {
    query: draft.query.trim(),
    planType: draft.planType,
    when: draft.when,
    customDate: draft.customDate.trim(),
    customTime: draft.customTime.trim(),
    area: draft.area.trim() || "Near me",
    areaSource: draft.areaSource,
    latitude: draft.latitude,
    longitude: draft.longitude,
    partySize: draft.partySize,
    budget: draft.budget,
    travel: draft.travel,
    preferences: draft.preferences,
    customMatters: draft.customMatters,
  };
}
