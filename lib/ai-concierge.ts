import type { VenueCandidate } from "@/lib/recommendation-engine";

export type ConciergeOccasion =
  | "romantic outing"
  | "birthday outing"
  | "group night"
  | "group dinner"
  | "luxury night"
  | "family outing"
  | "casual night"
  | "networking/professional outing";

export type ConciergePlan = {
  occasion: ConciergeOccasion;
  restaurant?: VenueCandidate;
  activity?: VenueCandidate;
  startTime: string;
  walkingDistanceLabel: string;
  estimatedBudget: string;
  vibeSummary: string;
  actions: { saveOuting: string; shareOuting: string; bookOuting: string };
};

const DEFAULT_TIMING: Record<ConciergeOccasion, string> = {
  "romantic outing": "7:00 PM dinner, 9:00 PM activity",
  "birthday outing": "6:30 PM dinner, 8:30 PM celebration",
  "group night": "7:30 PM dinner, 10:00 PM nightlife",
  "group dinner": "6:45 PM table, 8:45 PM activity",
  "luxury night": "8:00 PM tasting, 10:00 PM lounge",
  "family outing": "5:30 PM dinner, 7:00 PM activity",
  "casual night": "7:00 PM dinner, 8:30 PM add-on",
  "networking/professional outing": "6:00 PM dinner, 7:45 PM social",
};

export function buildConciergeOuting(occasion: ConciergeOccasion, venues: VenueCandidate[]): ConciergePlan {
  const restaurant = venues.find((venue) => venue.category.toLowerCase().includes("restaurant") || venue.tags.includes("food"));
  const activity = venues.find((venue) => venue.id !== restaurant?.id);

  return {
    occasion,
    restaurant,
    activity,
    startTime: DEFAULT_TIMING[occasion],
    walkingDistanceLabel: "8-15 min walking pairing",
    estimatedBudget: estimateBudget(restaurant?.budget, activity?.budget),
    vibeSummary: `${capitalize(occasion)} with ${restaurant?.name ?? "a restaurant"} followed by ${activity?.name ?? "a nearby activity"}.`,
    actions: {
      saveOuting: "/api/outings/save",
      shareOuting: "/api/outings/share",
      bookOuting: "/reserve",
    },
  };
}

function estimateBudget(restaurantBudget?: string, activityBudget?: string) {
  const levels = [restaurantBudget, activityBudget].filter(Boolean).length;
  if (!levels) return "$80-$180";
  if (restaurantBudget === "$$$$" || activityBudget === "$$$$") return "$250+";
  if (restaurantBudget === "$$$" || activityBudget === "$$$") return "$140-$240";
  return "$80-$160";
}

function capitalize(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
