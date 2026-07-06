export type SearchDomain = "restaurant" | "activity" | "mixed" | "any";
export type SearchType =
  | "restaurant"
  | "activity"
  | "mixed_outing"
  | "same_location_combo"
  | "paired_outing"
  | "activity_pair"
  | "any";
export type GeoStrictness =
  | "none"
  | "soft"
  | "medium"
  | "strict"
  | "default_market"
  | "current_location"
  | "user_location";
export type PairDistanceMode =
  | "short_walk"
  | "walking"
  | "nearby"
  | "same_area"
  | "any";

export type PairingPreference = {
  requiresPairing: boolean;
  distanceMode: PairDistanceMode;
  maxPairDistanceMiles: number | null;
  maxPairWalkingMinutes: number | null;
  requireWalkablePair: boolean;
};

export type RestaurantIntent = {
  mealTerms: string[];
  foodTerms: string[];
  cuisineTerms: string[];
  categoryTerms: string[];
  vibeTerms: string[];
  featureTerms: string[];
  negativeTerms: string[];
  alternativeGroups?: string[][];
};

export type ActivityPairIntent = {
  firstActivityTerms: string[];
  secondActivityTerms: string[];
  sequence: "first_then_second" | "second_then_first" | "unknown";
  source: "sequencing_language" | "fallback";
};

export type ActivityIntent = {
  activityTerms: string[];
  categoryTerms: string[];
  vibeTerms: string[];
  featureTerms: string[];
  negativeTerms: string[];
  alternativeGroups?: string[][];
};

export type GeoIntent = {
  raw?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  borough?: string | null;
  county?: string | null;
  region?: string | null;
  state?: string | null;
  aliases: string[];
  latitude?: number | null;
  longitude?: number | null;
  radiusMiles?: number | null;
  geoStrictness: GeoStrictness;
  defaultMarketId?: string | null;
  defaultMarketLabel?: string | null;
  requestedMarket?: string | null;
  resolvedMarket?: string | null;
  marketIntent?: string | null;
  explicitMarketRequested?: boolean;
  allowedMarkets?: string[];
};

export type SearchIntent = {
  rawQuery: string;
  searchType: SearchType;
  primaryDomain: SearchDomain;
  needsRestaurant: boolean;
  needsActivity: boolean;
  wantsPairing: boolean;
  pairingIntent?: "same_location" | "nearby_pair" | "auto";
  pairRequested?: boolean;
  sameVenuePreferred?: boolean;
  fallbackPairAllowed?: boolean;
  sameLocationRequired?: boolean;
  normalizedIntent?: "restaurant_only" | "activity_only" | "same_location_combo" | "paired_outing";
  pairingPreference?: PairingPreference;
  restaurantIntent: RestaurantIntent;
  activityIntent: ActivityIntent;
  activityPairIntent?: ActivityPairIntent | null;
  geo: GeoIntent;
  occasion?: string | null;
  partySize?: number | null;
  timeContext?: string | null;
  outingDateLabel?: string | null;
  outingTimeLabel?: string | null;
  outingDateTimeText?: string | null;
  outingTimeConfidence?: "explicit" | "vague" | "none";
  parsedDateText?: string | null;
  parsedTimeText?: string | null;
  parsedDateTimeISO?: string | null;
  budget?: string | null;
  vibe: string[];
  strictness: "low" | "medium" | "high";
};

export type EnterpriseLocation = {
  id: string | number | null;
  name?: string | null;
  restaurant_name?: string | null;
  activity_name?: string | null;
  location_type?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  market?: string | null;
  county?: string | null;
  neighborhood?: string | null;
  borough?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  description?: string | null;
  cuisine?: string | null;
  cuisine_type?: string | null;
  activity_type?: string | null;
  primary_category?: string | null;
  tags?: string[] | string | null;
  vibe_tags?: string[] | string | null;
  best_for_tags?: string[] | string | null;
  date_style_tags?: string[] | string | null;
  search_keywords?: string[] | string | null;
  google_types?: string[] | string | null;
  semantic_tags?: string[] | string | null;
  intent_tags?: string[] | string | null;
  search_document?: string | null;
  semantic_search_text?: string | null;
  rating?: number | null;
  review_count?: number | null;
  review_score?: number | null;
  quality_score?: number | null;
  popularity_score?: number | null;
  roseout_score?: number | null;
  theouthaven_score?: number | null;
  search_score?: number | null;
  recommendation_score?: number | null;
  analytics_score?: number | null;
  ml_score?: number | null;
  ml_boost?: number | null;
  reservation_url?: string | null;
  reservation_link?: string | null;
  booking_url?: string | null;
  external_reservation_url?: string | null;
  website?: string | null;
  phone?: string | null;
  image_url?: string | null;
  main_image?: string | null;
  images?: string[] | string | null;
  gallery_images?: string[] | string | null;
  has_photos?: boolean | null;
  photo_status?: string | null;
  public_visibility_tier?: string | null;
  curation_tier?: string | null;
  source_quality_status?: string | null;
  duplicate_status?: string | null;
  is_low_level?: boolean | null;
  is_searchable?: boolean | null;
  is_hidden?: boolean | null;
  active?: boolean | null;
  status?: string | null;
  data_status?: string | null;
  deleted_at?: string | null;
  match_score?: number | null;
  term_score?: number | null;
  geo_score?: number | null;
  distance_score?: number | null;
  distance_miles?: number | null;
  domain_score?: number | null;
  quality_rank_score?: number | null;
  restaurantQualityScore?: number | null;
  restaurantOutingFitScore?: number | null;
  restaurantOutingFitReasons?: string[] | null;
  restaurantOutingFitPenalties?: string[] | null;
  restaurantQualityReasons?: string[] | null;
  restaurantQualityPenalties?: string[] | null;
  activityQualityScore?: number | null;
  activityQualityReasons?: string[] | null;
  activityQualityPenalties?: string[] | null;
  intent_score?: number | null;
  intent_boost?: number | null;
  primary_intent?: string | null;
  matched_intents?: string[] | null;
  [key: string]: unknown;
};

export type EnterprisePair = {
  restaurant: EnterpriseLocation;
  activity: EnterpriseLocation;
  title: string;
  explanation: string;
  pairExplanation?: string;
  score: number;
  pairScore: number;
  distance_miles: number | null;
  pairDistanceMiles: number | null;
  pairWalkingMinutes: number | null;
  walkingDurationMinutes?: number | null;
  googleWalkingDurationMinutes?: number | null;
  routeDurationMinutes?: number | null;
  walking_route_minutes?: number | null;
  pairDistanceLabel: string;
  pairWarnings: string[];
  pairQualityScore?: number;
  pairQualityTier?: number;
  restaurantQualityScore?: number;
  restaurantOutingFitScore?: number;
  activityQualityScore?: number;
  pairQualityReasons?: string[];
  pairQualityPenalties?: string[];
  defaultMarketPairPriority?: number;
  ml_score?: number | null;
  pair_ml_score?: number | null;
  pair_boost?: number | null;
  primary_intent?: string | null;
  matched_intents?: string[] | null;
  isWalkable: boolean;
  pair_type?: "restaurant_activity" | "activity_activity";
  first_activity_location_id?: string | number | null;
  second_activity_location_id?: string | number | null;
  first_activity_name?: string | null;
  second_activity_name?: string | null;
  activity_location_id?: string | number | null;
  paired_activity_location_id?: string | number | null;
};

export type EnterpriseSearchDebugMetadata = {
  intentParserSource?: string | null;
  preIntentSource?: string | null;
  preIntentMatched?: boolean;
  preIntentReason?: string | null;
  intentLlmModel?: string | null;
  intentLlmFastModel?: string | null;
  intentLlmFallbackModel?: string | null;
  llmEnhancementUsed?: boolean;
  llmFallbackUsed?: boolean;
  llmTimedOut?: boolean;
  fallbackIntentUsed?: boolean;
  intentCacheHit?: boolean;
  intentCacheKey?: string | null;
  intentCacheVersion?: string | null;
  intent_parse_ms?: number | null;
  llm_ms?: number | null;
  fast_llm_ms?: number | null;
  fallback_llm_ms?: number | null;
  llmError?: string | null;
  llmFallbackError?: string | null;
};

export type MlResultDebug = {
  id: string;
  name?: string | null;
  location_type?: string | null;
  market?: string | null;
  baseScore?: number | null;
  finalScore?: number | null;
  baseRank?: number | null;
  finalRank?: number | null;
  rankDelta?: number | null;
  phase1MlScore?: number | null;
  phase1MlBoost?: number | null;
  primaryIntent?: string | null;
  secondaryIntents?: string[];
  rankingIntentBuckets?: string[];
  phase2IntentScore?: number | null;
  phase2IntentBoost?: number | null;
  matchedIntentBucket?: string | null;
  phase2PairScore?: number | null;
  phase2PairBoost?: number | null;
  totalMlBoost?: number | null;
  mlChangedRank?: boolean;
  mlDebugReason?: string | null;
  phase2MatchedFields?: string[];
  phase2IntentReason?: string | null;
};

export type MlSearchDebug = {
  mlEnabled: boolean;
  phase1Enabled: boolean;
  phase2Enabled: boolean;
  intentClassification?: {
    primaryIntent: string;
    secondaryIntents: string[];
    allIntents: string[];
    confidence: number;
    reason: string;
    inferredSearchMode: string;
    intentGroups?: Record<string, string[]>;
  } | null;
  [key: string]: any;
  rankingIntentBuckets?: string[];
  mlUnavailableReason?: string | null;
  resultOrderChangedByMl?: boolean;
  resultsWithMlBoostCount?: number;
  maxMlBoostApplied?: number;
  averageMlBoostApplied?: number;
  results?: MlResultDebug[];
};

export type EnterpriseSearchResult = {
  success: boolean;
  restaurants: EnterpriseLocation[];
  activities: EnterpriseLocation[];
  pairs: EnterprisePair[];
  fallbackPairs?: EnterprisePair[];
  recommendedFallbackPairs?: EnterprisePair[];
  pairedFallbackUsed?: boolean;
  fallbackPairsUsedAsPrimary?: boolean;
  primaryResultType?: string;
  matched_locations: EnterpriseLocation[];
  matchedLocations?: EnterpriseLocation[];
  render_mode:
    | "restaurant_cards"
    | "activity_cards"
    | "mixed_pairs"
    | "pair_cards"
    | "combo_location_cards"
    | "activity_activity_pairs"
    | "empty"
    | "partial_mixed"
    | "cards"
    | "text";
  renderMode?: string;
  searchMode?: string;
  sameLocationRequired?: boolean;
  comboCandidateCount?: number;
  dedupedResultCount?: number;
  fallbackMode?: string | null;
  duplicateLocationShown?: boolean;
  duplicateLocationCount?: number;
  duplicateLocationErrors?: string[];
  duplicateLocationWarnings?: string[];
  duplicateLocationKeys?: string[];
  reply: string;
  card_counts: {
    restaurants: number;
    activities: number;
    matched_locations: number;
    pairs: number;
    fallbackPairs?: number;
    fallback_pair_count?: number;
  };
  cardCounts?: {
    restaurants: number;
    activities: number;
    matched_locations: number;
    pairs: number;
    fallbackPairs?: number;
    fallback_pair_count?: number;
  };
  debug?: Record<string, unknown> &
    EnterpriseSearchDebugMetadata & { mlSearchDebug?: MlSearchDebug };
};
