import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getPlaceDetailsLegacyCompat,
  publicGooglePlacePhotoUrl,
  searchPlacesTextLegacyCompat,
  type GooglePlaceLegacyCompat,
} from "@/lib/google/places-new-client";
import {
  parseGoogleAddressComponents,
  validatePlaceForMarket,
} from "@/lib/location-market-validation";
import {
  normalizeMarketKey,
  type CanonicalMarketKey,
} from "@/lib/location-markets";
import { calculateStagingQuality } from "@/lib/location-growth/stagingQuality";
import { publishReadyStagedLocations } from "@/lib/location-growth/publishReady";
import {
  evaluateGoogleDiscoveryCandidate,
  type GoogleDiscoveryKind,
} from "@/lib/location-growth/googleDiscoveryQuality";

const SOURCE = "google_curated_discovery";

const MARKET_AREAS: Record<CanonicalMarketKey, string[]> = {
  NYC_CORE: ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"],
  LONG_ISLAND: [
    "Garden City NY",
    "Rockville Centre NY",
    "Huntington NY",
    "Farmingdale NY",
    "Bay Shore NY",
    "Patchogue NY",
  ],
  NORTHERN_NJ: ["Jersey City NJ", "Hoboken NJ", "Newark NJ", "Montclair NJ", "Edgewater NJ"],
  WESTCHESTER: ["White Plains NY", "Yonkers NY", "New Rochelle NY", "Tarrytown NY", "Port Chester NY"],
  CONNECTICUT: ["Stamford CT", "Norwalk CT", "Greenwich CT"],
  UNKNOWN: [],
};

const ACTIVE_DISCOVERY_MARKETS: CanonicalMarketKey[] = [
  "NYC_CORE",
  "LONG_ISLAND",
  "NORTHERN_NJ",
  "WESTCHESTER",
];

type CatalogEntry = {
  category: string;
  query: string;
  matchTerms: string[];
  targetPerMarket: number;
};

const RESTAURANT_CATALOG: CatalogEntry[] = [
  { category: "date_night", query: "date night restaurant", matchTerms: ["date night", "romantic"], targetPerMarket: 12 },
  { category: "rooftop", query: "rooftop restaurant", matchTerms: ["rooftop"], targetPerMarket: 8 },
  { category: "waterfront", query: "waterfront restaurant", matchTerms: ["waterfront", "water view"], targetPerMarket: 8 },
  { category: "fine_dining", query: "fine dining restaurant", matchTerms: ["fine dining", "fine_dining"], targetPerMarket: 10 },
  { category: "private_dining", query: "private dining restaurant", matchTerms: ["private dining", "private room"], targetPerMarket: 8 },
  { category: "birthday", query: "birthday dinner restaurant", matchTerms: ["birthday", "celebration"], targetPerMarket: 10 },
  { category: "live_music", query: "live music restaurant", matchTerms: ["live music", "jazz"], targetPerMarket: 8 },
  { category: "steakhouse", query: "steakhouse", matchTerms: ["steakhouse", "steak_house"], targetPerMarket: 12 },
  { category: "seafood", query: "seafood restaurant", matchTerms: ["seafood"], targetPerMarket: 12 },
  { category: "japanese", query: "sushi restaurant", matchTerms: ["sushi", "japanese", "omakase"], targetPerMarket: 12 },
  { category: "brunch", query: "brunch restaurant", matchTerms: ["brunch"], targetPerMarket: 12 },
  { category: "latin", query: "latin restaurant", matchTerms: ["latin", "peruvian", "cuban", "dominican", "puerto rican"], targetPerMarket: 12 },
  { category: "caribbean", query: "caribbean restaurant", matchTerms: ["caribbean", "jamaican", "haitian"], targetPerMarket: 10 },
  { category: "wine_bar", query: "wine bar with food", matchTerms: ["wine bar", "wine_bar"], targetPerMarket: 8 },
  { category: "cocktail", query: "cocktail restaurant", matchTerms: ["cocktail", "mixology"], targetPerMarket: 8 },
];

const ACTIVITY_CATALOG: CatalogEntry[] = [
  { category: "escape_room", query: "escape room", matchTerms: ["escape room", "escape_room"], targetPerMarket: 6 },
  { category: "bowling", query: "bowling alley", matchTerms: ["bowling"], targetPerMarket: 6 },
  { category: "arcade", query: "arcade bar", matchTerms: ["arcade"], targetPerMarket: 6 },
  { category: "mini_golf", query: "mini golf", matchTerms: ["mini golf", "mini_golf"], targetPerMarket: 5 },
  { category: "axe_throwing", query: "axe throwing", matchTerms: ["axe throwing", "axe_throwing"], targetPerMarket: 4 },
  { category: "karaoke", query: "karaoke lounge", matchTerms: ["karaoke"], targetPerMarket: 6 },
  { category: "comedy", query: "comedy club", matchTerms: ["comedy"], targetPerMarket: 5 },
  { category: "live_music", query: "live music venue", matchTerms: ["live music", "jazz", "music venue"], targetPerMarket: 8 },
  { category: "spa", query: "couples spa", matchTerms: ["spa", "wellness", "sauna", "bath house"], targetPerMarket: 6 },
  { category: "museum", query: "museum", matchTerms: ["museum"], targetPerMarket: 6 },
  { category: "art_gallery", query: "art gallery", matchTerms: ["art gallery", "gallery"], targetPerMarket: 6 },
  { category: "paint_and_sip", query: "paint and sip", matchTerms: ["paint and sip"], targetPerMarket: 4 },
  { category: "pottery", query: "pottery class", matchTerms: ["pottery"], targetPerMarket: 4 },
  { category: "candle_making", query: "candle making class", matchTerms: ["candle making"], targetPerMarket: 4 },
  { category: "indoor_golf", query: "indoor golf", matchTerms: ["indoor golf", "golf simulator"], targetPerMarket: 5 },
  { category: "go_kart", query: "go kart racing", matchTerms: ["go kart", "go_kart"], targetPerMarket: 4 },
  { category: "immersive", query: "immersive experience", matchTerms: ["immersive"], targetPerMarket: 5 },
];

export type GoogleCuratedDiscoveryOptions = {
  kind: GoogleDiscoveryKind;
  maxPlans?: number;
  resultsPerPlan?: number;
  maxCandidates?: number;
  maxRuntimeMs?: number;
  autoPublish?: boolean;
};

type InventoryRow = {
  market?: string | null;
  location_type?: string | null;
  primary_category?: string | null;
  cuisine?: string | null;
  cuisine_type?: string | null;
  activity_type?: string | null;
  primary_tag?: string | null;
  tags?: string[] | null;
  best_for_tags?: string[] | null;
  vibe_tags?: string[] | null;
};

type DiscoveryPlan = {
  market: CanonicalMarketKey;
  area: string;
  category: string;
  query: string;
  existingCount: number;
  target: number;
  gapRatio: number;
};

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function normalize(value: unknown) {
  return cleanText(value)
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => cleanText(value)).filter(Boolean)));
}

function rowSearchText(row: InventoryRow) {
  return normalize([
    row.primary_category,
    row.cuisine,
    row.cuisine_type,
    row.activity_type,
    row.primary_tag,
    ...(row.tags || []),
    ...(row.best_for_tags || []),
    ...(row.vibe_tags || []),
  ].join(" "));
}

function catalogFor(kind: GoogleDiscoveryKind) {
  return kind === "restaurant" ? RESTAURANT_CATALOG : ACTIVITY_CATALOG;
}

function daySeed() {
  return Math.floor(Date.now() / 86_400_000);
}

function areaFor(market: CanonicalMarketKey, offset: number) {
  const areas = MARKET_AREAS[market] || [];
  if (!areas.length) return "";
  return areas[(daySeed() + offset) % areas.length];
}

async function loadPublishedInventory() {
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("market,location_type,primary_category,cuisine,cuisine_type,activity_type,primary_tag,tags,best_for_tags,vibe_tags")
    .eq("is_searchable", true)
    .or("is_hidden.is.null,is_hidden.eq.false")
    .or("duplicate_status.is.null,duplicate_status.neq.duplicate")
    .limit(10000);

  if (error) throw new Error(`Unable to read discovery inventory: ${error.message}`);
  return (data || []) as InventoryRow[];
}

export async function buildGoogleDiscoveryPlan(
  kind: GoogleDiscoveryKind,
  maxPlans = 6,
): Promise<DiscoveryPlan[]> {
  const inventory = await loadPublishedInventory();
  const catalog = catalogFor(kind);
  const candidates: DiscoveryPlan[] = [];

  for (const market of ACTIVE_DISCOVERY_MARKETS) {
    const marketRows = inventory.filter((row) => {
      if (normalizeMarketKey(row.market) !== market) return false;
      const rowType = normalize(row.location_type);
      return kind === "restaurant"
        ? rowType === "restaurant"
        : rowType === "activity";
    });

    catalog.forEach((entry, index) => {
      const existingCount = marketRows.filter((row) => {
        const text = rowSearchText(row);
        return entry.matchTerms.some((term) => text.includes(normalize(term)));
      }).length;
      const gapRatio = existingCount / Math.max(1, entry.targetPerMarket);
      const area = areaFor(market, index);
      candidates.push({
        market,
        area,
        category: entry.category,
        query: `${entry.query} in ${area}`,
        existingCount,
        target: entry.targetPerMarket,
        gapRatio,
      });
    });
  }

  const selected: DiscoveryPlan[] = [];
  for (const market of ACTIVE_DISCOVERY_MARKETS) {
    const marketCandidate = candidates
      .filter((candidate) => candidate.market === market)
      .sort((a, b) => a.gapRatio - b.gapRatio || a.existingCount - b.existingCount || a.category.localeCompare(b.category))[0];
    if (marketCandidate) selected.push(marketCandidate);
  }

  for (const candidate of candidates.sort((a, b) => a.gapRatio - b.gapRatio || a.existingCount - b.existingCount)) {
    if (selected.length >= Math.max(1, maxPlans)) break;
    if (selected.some((item) => item.market === candidate.market && item.category === candidate.category)) continue;
    selected.push(candidate);
  }

  return selected.slice(0, Math.max(1, maxPlans));
}

function hasHours(place: GooglePlaceLegacyCompat) {
  const values = [
    place.opening_hours,
    place.current_opening_hours,
    place.regularOpeningHours,
    place.business_hours,
    place.hours,
    place.weekday_text,
  ];
  return values.some((value) => {
    if (!value) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object") return Object.keys(value).length > 0;
    return cleanText(value).length > 0;
  });
}

function inferRestaurantCategory(place: GooglePlaceLegacyCompat, fallback: string) {
  const text = normalize([place.name, ...(place.types || [])].join(" "));
  const categories: Array<[RegExp, string]> = [
    [/steak house|steakhouse/, "steakhouse"],
    [/seafood|oyster|lobster|crab/, "seafood"],
    [/sushi|japanese|omakase|izakaya/, "japanese"],
    [/korean/, "korean"],
    [/thai/, "thai"],
    [/vietnamese|pho/, "vietnamese"],
    [/indian/, "indian"],
    [/italian|pizza|pizzeria|pasta/, "italian"],
    [/mexican|taco|taqueria/, "mexican"],
    [/latin|peruvian|cuban|dominican|puerto rican/, "latin"],
    [/caribbean|jamaican|haitian/, "caribbean"],
    [/brunch|breakfast/, "brunch"],
    [/french|bistro|brasserie/, "french"],
    [/mediterranean|greek/, "mediterranean"],
  ];
  return categories.find(([pattern]) => pattern.test(text))?.[1] ||
    (["steakhouse", "seafood", "japanese", "brunch", "latin", "caribbean"].includes(fallback)
      ? fallback
      : "restaurant");
}

function tagsFor(kind: GoogleDiscoveryKind, category: string, place: GooglePlaceLegacyCompat) {
  const types = (place.types || []).map((type) => type.replace(/_/g, " "));
  const bestFor = kind === "restaurant"
    ? unique([
        category.includes("birthday") || category.includes("private") ? "birthday" : null,
        category.includes("date") || category.includes("romantic") || category.includes("rooftop") || category.includes("waterfront") ? "date night" : null,
        category.includes("brunch") ? "brunch" : null,
        "dinner",
      ])
    : unique([
        "date night",
        "group outing",
        category.includes("spa") ? "couples" : null,
        category.includes("comedy") || category.includes("karaoke") ? "night out" : null,
      ]);
  const vibes = unique([
    category.includes("rooftop") ? "rooftop" : null,
    category.includes("waterfront") ? "scenic" : null,
    category.includes("fine") ? "upscale" : null,
    category.includes("live_music") ? "live music" : null,
    category.includes("birthday") ? "celebration" : null,
    kind === "activity" ? "interactive" : null,
  ]);
  return {
    tags: unique([category, ...types]).slice(0, 24),
    bestFor,
    vibes,
  };
}

async function findLiveDuplicate(placeId: string) {
  const { data: googleMatch, error: googleError } = await supabaseAdmin
    .from("locations")
    .select("id,name")
    .eq("google_place_id", placeId)
    .limit(1);
  if (googleError) throw new Error(`Google Place duplicate lookup failed: ${googleError.message}`);
  if (googleMatch?.[0]) return googleMatch[0];

  const { data: sourceMatch, error: sourceError } = await supabaseAdmin
    .from("locations")
    .select("id,name")
    .eq("import_source_id", placeId)
    .limit(1);
  if (sourceError) throw new Error(`Import source duplicate lookup failed: ${sourceError.message}`);
  return sourceMatch?.[0] || null;
}

function stageStatus(decision: "auto_import" | "review" | "reject", hasPhoto: boolean) {
  if (decision === "auto_import") return "publish_ready";
  if (decision === "review" && !hasPhoto) return "needs_photo";
  if (decision === "review") return "review";
  return "reject";
}

async function stageCandidate({
  batchId,
  kind,
  plan,
  place,
}: {
  batchId: string;
  kind: GoogleDiscoveryKind;
  plan: DiscoveryPlan;
  place: GooglePlaceLegacyCompat;
}) {
  const placeId = cleanText(place.place_id);
  if (!placeId || !place.name) return { outcome: "rejected" as const, reason: "missing_identity" };

  const duplicate = await findLiveDuplicate(placeId);
  const parsed = parseGoogleAddressComponents(place.address_components);
  const address = cleanText(place.formatted_address || place.vicinity);
  const latitude = Number(place.geometry?.location?.lat || 0) || null;
  const longitude = Number(place.geometry?.location?.lng || 0) || null;
  const validation = validatePlaceForMarket({
    requestedMarket: plan.market,
    requestedArea: plan.area,
    formattedAddress: address,
    addressComponents: place.address_components,
    city: parsed.city,
    state: parsed.state,
    county: parsed.county,
    borough: parsed.borough,
    neighborhood: parsed.neighborhood,
    postalCode: parsed.postalCode,
    latitude,
    longitude,
  });

  const hasPhoto = Boolean(place.photos?.[0]?.photo_reference || place.photos?.[0]?.name);
  const hasPhone = Boolean(place.formatted_phone_number || place.international_phone_number);
  const hasWebsite = Boolean(place.website || place.websiteUri);
  const usableHours = hasHours(place);
  const hasLocation = Boolean(address && parsed.city && parsed.state && latitude && longitude);
  const rating = Number(place.rating || 0);
  const reviewCount = Number(place.user_ratings_total || place.review_count || 0);
  const primaryCategory = kind === "restaurant"
    ? inferRestaurantCategory(place, plan.category)
    : plan.category;
  const tagData = tagsFor(kind, plan.category, place);
  const quality = evaluateGoogleDiscoveryCandidate({
    kind,
    name: place.name,
    query: plan.query,
    category: plan.category,
    rating,
    reviewCount,
    types: place.types || [],
    editorialSummary: place.editorial_summary?.overview || null,
    hasPhoto,
    hasPhone,
    hasWebsite,
    hasHours: usableHours,
    hasLocation,
  });

  const invalidMarket = !validation.ok;
  const decision = duplicate || invalidMarket ? "reject" : quality.decision;
  const rejectionReasons = unique([
    duplicate ? "duplicate_existing_location" : null,
    invalidMarket ? validation.reason || "wrong_market" : null,
    ...(decision === "reject" ? quality.reasons : []),
  ]);

  const imageUrl = hasPhoto ? publicGooglePlacePhotoUrl(placeId) : null;
  const baseRow: Record<string, unknown> = {
    batch_id: batchId,
    source: SOURCE,
    source_id: placeId,
    source_url: place.url || place.googleMapsUri || null,
    location_type: kind,
    name: place.name,
    restaurant_name: kind === "restaurant" ? place.name : null,
    activity_name: kind === "activity" ? place.name : null,
    address,
    city: parsed.city || null,
    state: parsed.state || null,
    zip_code: parsed.postalCode || null,
    phone: place.formatted_phone_number || place.international_phone_number || null,
    website: place.website || place.websiteUri || null,
    latitude,
    longitude,
    primary_category: primaryCategory,
    cuisine: kind === "restaurant" ? primaryCategory : null,
    cuisine_type: kind === "restaurant" ? primaryCategory : null,
    activity_type: kind === "activity" ? plan.category : null,
    primary_tag: plan.category,
    tags: tagData.tags,
    vibe_tags: tagData.vibes,
    best_for_tags: tagData.bestFor,
    search_keywords: unique([place.name, plan.query, plan.category, primaryCategory, ...tagData.tags]).slice(0, 30),
    google_types: place.types || [],
    rating,
    review_count: reviewCount,
    main_image: imageUrl,
    images: imageUrl ? [imageUrl] : [],
    description: place.editorial_summary?.overview || null,
    raw_payload: {
      provider: "google_places_new",
      query: plan.query,
      market: plan.market,
      area: plan.area,
      gap: {
        category: plan.category,
        existingCount: plan.existingCount,
        target: plan.target,
        gapRatio: plan.gapRatio,
      },
      quality: {
        ...quality,
        effectiveDecision: decision,
        marketValidation: validation,
      },
      google: place,
    },
    duplicate_status: duplicate ? "duplicate" : "unique",
    matched_location_id: duplicate?.id || null,
    quality_score: quality.score,
    quality_status: stageStatus(decision, hasPhoto),
    import_status: duplicate ? "duplicate" : decision === "reject" ? "rejected" : "staged",
    rejection_reason: rejectionReasons.length ? rejectionReasons.join(",") : null,
    has_photos: hasPhoto,
    photo_status: hasPhoto ? "google_photo" : "missing_photo",
    curation_tier: decision === "auto_import" ? "curated" : decision === "review" ? "review" : "rejected",
    public_visibility_tier: decision === "reject" ? "hidden" : "standard",
    is_low_level: decision === "reject" && (quality.quickService || Boolean(quality.chainBrand)),
    low_level_reason: decision === "reject" ? rejectionReasons.join(",") || null : null,
    low_level_detected_at: decision === "reject" ? new Date().toISOString() : null,
    low_level_source: decision === "reject" ? "google_curated_discovery" : null,
    import_confidence: decision === "auto_import" ? "high" : decision === "review" ? "medium" : "low",
    source_quality_status: decision === "auto_import"
      ? "curated_google"
      : decision === "review"
        ? "curated_google_review"
        : "curated_google_rejected",
    updated_at: new Date().toISOString(),
  };

  const normalized = calculateStagingQuality(baseRow);
  const row = {
    ...baseRow,
    normalized_name: normalized.normalized_name,
    normalized_address: normalized.normalized_address,
    normalized_phone: normalized.normalized_phone,
    location_key: normalized.location_key,
  };

  const { error } = await supabaseAdmin
    .from("location_import_staging")
    .upsert(row, { onConflict: "source,source_id", ignoreDuplicates: false });
  if (error) throw new Error(`Unable to stage ${place.name}: ${error.message}`);

  if (duplicate) return { outcome: "duplicate" as const, reason: "duplicate_existing_location" };
  if (decision === "auto_import") return { outcome: "auto_import" as const, score: quality.score };
  if (decision === "review") return { outcome: "review" as const, score: quality.score };
  return { outcome: "rejected" as const, score: quality.score, reason: rejectionReasons.join(",") };
}

async function backfillPublishedGooglePlaceIds() {
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("id,import_source_id")
    .eq("import_source", SOURCE)
    .is("google_place_id", null)
    .not("import_source_id", "is", null)
    .limit(100);
  if (error) throw new Error(`Unable to find published Google candidates: ${error.message}`);

  let updated = 0;
  for (const row of data || []) {
    const { error: updateError } = await supabaseAdmin
      .from("locations")
      .update({ google_place_id: row.import_source_id })
      .eq("id", row.id)
      .is("google_place_id", null);
    if (!updateError) updated += 1;
  }
  return updated;
}

export async function runGoogleCuratedDiscovery(
  options: GoogleCuratedDiscoveryOptions,
) {
  const kind = options.kind;
  const maxPlans = Math.min(10, Math.max(1, Number(options.maxPlans || 6)));
  const resultsPerPlan = Math.min(12, Math.max(1, Number(options.resultsPerPlan || 8)));
  const maxCandidates = Math.min(80, Math.max(1, Number(options.maxCandidates || 40)));
  const maxRuntimeMs = Math.min(270_000, Math.max(30_000, Number(options.maxRuntimeMs || 240_000)));
  const autoPublish = options.autoPublish !== false;
  const startedAtMs = Date.now();
  const plans = await buildGoogleDiscoveryPlan(kind, maxPlans);

  const { data: batch, error: batchError } = await supabaseAdmin
    .from("location_import_batches")
    .insert({
      source: SOURCE,
      source_label: `Curated Google ${kind} discovery`,
      status: "running",
      metadata: { kind, plans, autoPublish, pipeline: "gap_driven_v1" },
    })
    .select("id")
    .single();
  if (batchError || !batch?.id) {
    throw new Error(`Unable to create Google discovery batch: ${batchError?.message || "missing batch id"}`);
  }

  const counts = {
    checked: 0,
    staged: 0,
    autoImport: 0,
    review: 0,
    rejected: 0,
    duplicates: 0,
    failed: 0,
    published: 0,
  };
  const errors: string[] = [];
  const seen = new Set<string>();

  try {
    outer: for (const plan of plans) {
      if (Date.now() - startedAtMs >= maxRuntimeMs) break;
      let searchResults: GooglePlaceLegacyCompat[] = [];
      try {
        searchResults = (await searchPlacesTextLegacyCompat(plan.query)).slice(0, resultsPerPlan);
      } catch (error) {
        counts.failed += 1;
        errors.push(`${plan.query}: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }

      for (const searchResult of searchResults) {
        if (Date.now() - startedAtMs >= maxRuntimeMs || counts.checked >= maxCandidates) break outer;
        const placeId = cleanText(searchResult.place_id);
        if (!placeId || seen.has(placeId)) continue;
        seen.add(placeId);
        counts.checked += 1;

        try {
          const details = await getPlaceDetailsLegacyCompat(placeId);
          const place = { ...searchResult, ...details };
          if (place.business_status && place.business_status !== "OPERATIONAL") {
            counts.rejected += 1;
            continue;
          }
          const result = await stageCandidate({ batchId: batch.id, kind, plan, place });
          if (result.outcome === "duplicate") counts.duplicates += 1;
          if (result.outcome === "auto_import") {
            counts.autoImport += 1;
            counts.staged += 1;
          }
          if (result.outcome === "review") {
            counts.review += 1;
            counts.staged += 1;
          }
          if (result.outcome === "rejected") counts.rejected += 1;
        } catch (error) {
          counts.failed += 1;
          errors.push(`${searchResult.name || placeId}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    if (autoPublish && counts.autoImport > 0) {
      const publish = await publishReadyStagedLocations({
        limit: Math.min(100, Math.max(1, counts.autoImport)),
        batchId: batch.id,
      });
      counts.published = publish.markedPublished;
      errors.push(...publish.errors);
      await backfillPublishedGooglePlaceIds();
    }

    await supabaseAdmin
      .from("location_import_batches")
      .update({
        status: errors.length && counts.checked === 0 ? "failed" : errors.length ? "completed_with_errors" : "completed",
        total_seen: counts.checked,
        total_staged: counts.staged,
        total_duplicates: counts.duplicates,
        total_rejected: counts.rejected,
        total_publish_ready: counts.autoImport,
        total_published: counts.published,
        completed_at: new Date().toISOString(),
        error_message: errors.length ? errors.slice(0, 8).join("; ") : null,
        metadata: {
          kind,
          plans,
          autoPublish,
          pipeline: "gap_driven_v1",
          counts,
          errors: errors.slice(0, 20),
        },
      })
      .eq("id", batch.id);

    return {
      success: counts.failed === 0 || counts.checked > 0,
      batchId: batch.id,
      kind,
      pipeline: "gap_driven_v1",
      plans,
      counts,
      errors: errors.slice(0, 20),
      durationMs: Date.now() - startedAtMs,
    };
  } catch (error) {
    await supabaseAdmin
      .from("location_import_batches")
      .update({
        status: "failed",
        total_seen: counts.checked,
        total_staged: counts.staged,
        total_duplicates: counts.duplicates,
        total_rejected: counts.rejected,
        total_publish_ready: counts.autoImport,
        total_published: counts.published,
        completed_at: new Date().toISOString(),
        error_message: error instanceof Error ? error.message : String(error),
        metadata: { kind, plans, counts, errors: errors.slice(0, 20), pipeline: "gap_driven_v1" },
      })
      .eq("id", batch.id);
    throw error;
  }
}
