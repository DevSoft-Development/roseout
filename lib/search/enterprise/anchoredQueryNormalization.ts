import type { EnterpriseLocation } from "./types";

export type NormalizedAnchoredQuery = {
  canonicalQuery: string;
  qualifier: string | null;
  requestedDomain: "restaurant" | "activity";
};

const RESTAURANT_DOMAIN_PATTERN =
  "restaurant|restaurants|food|dinner|lunch|brunch|breakfast|dessert|desserts|dessert spot|dessert spots|coffee|coffee shop|coffee