import type { EnterpriseLocation } from "./types";

export type NormalizedAnchoredQuery = {
  canonicalQuery: string;
  qualifier: string | null;
  requestedDomain: "restaurant" | "activity";
};

const DOMAIN_PATTERN =
  "restaurant|restaurants|food|dinner|lunch|brunch|breakfast|activity|activities|something fun|things to do";
const RELATION_PATTERN =
  "near|close to|next to|around|