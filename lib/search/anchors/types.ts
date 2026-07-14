import type { EnterpriseLocation } from "@/lib/search/enterprise/types";

export type SearchAnchorType = "restaurant" | "activity" | "landmark" | "stadium" | "arena" | "park" | "beach" | "mall" | "theater" | "museum" | "hotel" | "transit_hub" | "university" | "event_venue" | "neighborhood" | "airport" | "attraction";
export type RadiusStrategy = "dense_urban" | "urban" | "stadium" | "mall" | "beach" | "large_park" | "suburban" | "long_island" | "transit" | "airport";
export type AnchorRequestedDomain = "restaurant" | "activity";
export type AnchorRelationship = "near" | "close_to" | "next_to" | "around" | "walking_distance_from" | "by" | "after_visiting" | "before_game" | "before_show" | "after_dinner";

export type SearchAnchor = EnterpriseLocation & {
  canonical_name: string;
  normalized_name: string;
  aliases: string[];
  anchor_type: SearchAnchorType;
  source_type: string;
  default_radius_miles: number;
  max_radius_miles: number;
  radius_strategy: RadiusStrategy;
  google_place_id?: string | null;
  linked_location_id?: string | null;
  confidence?: number | null;
};

export type AnchorResolutionSource = "registry_exact" | "registry_alias" | "linked_location" | "location_exact" | "registry_fuzzy" | "location_fuzzy" | "google_places" | "stale_linked_anchor" | "none";
export type AnchorSyncStatus = "current" | "needs_sync" | "missing_registry_anchor" | "missing_linked_location" | "disabled_source" | "stale";
export type ResolvedAnchor = SearchAnchor & {
  registryId: string | null;
  linkedLocationId: string | null;
  canonicalName: string;
  normalizedName: string;
  anchorType: string;
  sourceType: string;
  resolutionSource: Exclude<AnchorResolutionSource, "none">;
  aliasMatched: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  borough: string | null;
  neighborhood: string | null;
  county: string | null;
  market: string | null;
  defaultRadiusMiles: number;
  maxRadiusMiles: number;
  radiusStrategy: string;
  confidence: number;
  imageUrl: string | null;
  profileUrl: string | null;
  syncStatus: AnchorSyncStatus;
};
export type AnchorResolution = { status: "resolved" | "ambiguous" | "not_found" | "missing_coordinates"; anchor: ResolvedAnchor | null; candidates: ResolvedAnchor[]; source: AnchorResolutionSource; confidence: number | null; resolutionMs: number };
