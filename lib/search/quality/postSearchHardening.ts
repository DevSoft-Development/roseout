import type { EnterpriseSearchResult } from "@/lib/search/enterprise/types";

const WEEK_MINUTES = 7 * 24 * 60;

type HardeningInput = {
  query: string;
  body?: Record<string, any> | null;
};

type PreferenceContext = {
  occasion: string | null;
  vibes: string[];
  avoidVibes: string[];
  subjectiveTerms: string[];
  budget: "budget" | "moderate" | "premium" | null;
  noise: "quiet" | "moderate" | "lively" | null;
};

type AvailabilityStatus = "open" | "closed" | "unknown";

const normalize = (value: unknown) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[_–—-]+/g, " ")
    .replace(/[^a-z0-9+'$\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const uniq = (values: unknown[]) => [
  ...new Set(
    values
      .flatMap((value) => (Array.isArray(value) ? value : value == null ? [] : [value]))
      .map(normalize)
      .filter(Boolean),
  ),
];

function idOf(row: any) {
  return String(row?.id ?? row?.location_id ?? "");
}

function searchableText(row: any) {
  return normalize([
    row?.name,
    row?.restaurant_name,
    row?.activity_name,
    row?.location_type,
    row?.primary_category,
    row?.cuisine,
    row?.cuisine_type,
    row?.activity_type,
    row?.tags,
    row?.features,
    row?.vibe_tags,
    row?.best_for_tags,
    row?.date_style_tags,
    row?.semantic_tags,
    row?.intent_tags,
    row?.search_keywords,
    row?.search_document,
    row?.semantic_search_text,
    row?.description,
    row?.restaurant_categories,
    row?.activity_categories,
    row?.nightlife_categories,
    row?.meal_periods,
    row?.price_level,
    row?.price_range,
  ]
    .flatMap((value) => (Array.isArray(value) ? value : value == null ? [] : [value]))
    .join(" "));
}

function planOf(result: any) {
  return result?.searchPlan ?? result?.search_plan ?? result?.debug?.searchPlan ?? result?.debug?.search_plan ?? null;
}

function normalizedIntentOf(result: any) {
  return result?.normalizedIntent ?? result?.debug?.normalizedIntent ?? {};
}

function inferOccasion(query: string, planOccasion: unknown): string | null {
  if (typeof planOccasion === "string" && planOccasion.trim()) return planOccasion.trim().toLowerCase();
  const q = normalize(query);
  if (/\b(date night|first date|romantic date|anniversary|couples night|double date)\b/.test(q)) return "date_night";
  if (/\b(girls night|girls' night|ladies night|girls outing)\b/.test(q)) return "girls_night";
  if (/\b(family outing|family night|family day|with the kids|kid friendly|family friendly)\b/.test(q)) return "family_outing";
  if (/\b(birthday|birthday dinner|birthday outing|celebration)\b/.test(q)) return "birthday";
  if (/\b(business dinner|client dinner|work dinner|team dinner)\b/.test(q)) return "business_dinner";
  if (/\bbrunch\b/.test(q)) return "brunch";
  return null;
}

function preferenceContext(result: any, query: string): PreferenceContext {
  const plan = planOf(result) ?? {};
  const normalized = normalizedIntentOf(result);
  const planPreferences = plan?.preferences ?? {};
  const normalizedPreferences = normalized?.preferences ?? normalized?.language?.preferences ?? {};
  const normalizedNegatives = normalized?.language?.negatives ?? {};
  const q = normalize(query);
  const inferredVibes = [
    /\bromantic\b/.test(q) ? "romantic" : null,
    /\bupscale|classy|luxury|premium\b/.test(q) ? "upscale" : null,
    /\bquiet|conversation friendly|not too loud\b/.test(q) ? "quiet" : null,
    /\blively|energetic|party vibe\b/.test(q) ? "lively" : null,
    /\bcasual|laid back|laid-back|low key|low-key\b/.test(q) ? "casual" : null,
    /\brooftop\b/.test(q) ? "rooftop" : null,
    /\bphoto worthy|instagrammable\b/.test(q) ? "photo worthy" : null,
    /\bgroup friendly|group-friendly\b/.test(q) ? "group friendly" : null,
  ].filter(Boolean) as string[];
  const budget = (planPreferences?.budget ?? normalizedPreferences?.budget ?? (/\baffordable|budget|cheap\b/.test(q) ? "budget" : /\bpremium|luxury|upscale\b/.test(q) ? "premium" : null)) as PreferenceContext["budget"];
  const noise = (planPreferences?.noise ?? normalizedPreferences?.noise ?? (/\bquiet|conversation friendly|not too loud\b/.test(q) ? "quiet" : /\blively|energetic|party vibe\b/.test(q) ? "lively" : null)) as PreferenceContext["noise"];
  return {
    occasion: inferOccasion(query, plan?.occasion ?? normalized?.occasion),
    vibes: uniq([planPreferences?.vibes, normalizedPreferences?.vibes, inferredVibes]),
    avoidVibes: uniq([planPreferences?.avoidVibes, normalizedNegatives?.vibes]),
    subjectiveTerms: uniq([planPreferences?.subjectiveTerms, normalizedPreferences?.subjectiveTerms, inferredVibes]),
    budget: ["budget", "moderate", "premium"].includes(String(budget)) ? budget : null,
    noise: ["quiet", "moderate", "lively"].includes(String(noise)) ? noise : null,
  };
}

function containsAny(text: string, expressions: RegExp[]) {
  return expressions.some((expression) => expression.test(text));
}

function occasionAdjustment(text: string, domain: "restaurant" | "activity", occasion: string | null) {
  if (!occasion) return { adjustment: 0, reasons: [] as string[] };
  let adjustment = 0;
  const reasons: string[] = [];
  const add = (points: number, reason: string) => {
    adjustment += points;
    reasons.push(`${reason} ${points > 0 ? "+" : ""}${points}`);
  };
  const childCentric = /\b(children'?s?|kids?|kid friendly|playground|trampoline|indoor play|children museum|childrens museum|family amusement)\b/.test(text);
  const adultOnly = /\b(21\+|adult only|nightclub|hookah|cigar lounge|strip club)\b/.test(text);

  if (occasion === "date_night") {
    if (containsAny(text, [/\bromantic|intimate|cozy|candlelit|date night\b/, /\bupscale|classy|fine dining|tasting menu|speakeasy\b/])) add(domain === "restaurant" ? 12 : 7, "date-night atmosphere");
    if (domain === "activity" && containsAny(text, [/\bart gallery|museum|comedy|jazz|live music|theater|theatre|rooftop|cocktail|wine bar|escape room|mini golf\b/])) add(7, "date-night activity fit");
    if (domain === "activity" && childCentric) add(-24, "child-centric activity mismatch");
  } else if (occasion === "girls_night") {
    if (containsAny(text, [/\brooftop|cocktail|wine bar|lounge|karaoke|comedy|jazz|live music|speakeasy|lively|dance\b/])) add(10, "girls-night fit");
    if (domain === "activity" && childCentric) add(-18, "child-centric activity mismatch");
  } else if (occasion === "family_outing") {
    if (containsAny(text, [/\bfamily friendly|family-friendly|museum|bowling|arcade|mini golf|park|zoo|aquarium|casual\b/])) add(12, "family-outing fit");
    if (adultOnly) add(-30, "adult-only family mismatch");
  } else if (occasion === "birthday") {
    if (containsAny(text, [/\bgroup|party|birthday|celebration|karaoke|bowling|arcade|rooftop|comedy|private room|interactive\b/])) add(10, "birthday/group fit");
  } else if (occasion === "business_dinner") {
    if (domain === "restaurant" && containsAny(text, [/\bquiet|conversation|private dining|upscale|fine dining|business|professional|steakhouse\b/])) add(12, "business-dinner fit");
    if (containsAny(text, [/\bnightclub|dance floor|loud|arcade|trampoline\b/])) add(-18, "business-dinner mismatch");
  } else if (occasion === "brunch") {
    if (domain === "restaurant" && containsAny(text, [/\bbrunch|breakfast|cafe|café|bakery|rooftop|daytime\b/])) add(12, "brunch fit");
    if (containsAny(text, [/\blate night|nightclub\b/])) add(-12, "brunch mismatch");
  }
  return { adjustment: Math.max(-30, Math.min(20, adjustment)), reasons };
}

function preferenceAdjustment(text: string, context: PreferenceContext) {
  let adjustment = 0;
  const reasons: string[] = [];
  const positiveTerms = uniq([context.vibes, context.subjectiveTerms]).slice(0, 8);
  const matched = positiveTerms.filter((term) => term.length > 1 && text.includes(term));
  if (matched.length) {
    const points = Math.min(16, matched.length * 4);
    adjustment += points;
    reasons.push(`preference match +${points}: ${matched.slice(0, 4).join(", ")}`);
  }
  const avoided = context.avoidVibes.filter((term) => term.length > 1 && text.includes(term));
  if (avoided.length) {
    const points = Math.min(24, avoided.length * 10);
    adjustment -= points;
    reasons.push(`avoid-vibe mismatch -${points}: ${avoided.slice(0, 4).join(", ")}`);
  }
  if (context.noise === "quiet") {
    if (/\bquiet|intimate|conversation|low key|low-key|relaxed|cozy\b/.test(text)) { adjustment += 8; reasons.push("quiet/conversation fit +8"); }
    if (/\bloud|nightclub|party|dance floor|live dj|high energy\b/.test(text)) { adjustment -= 12; reasons.push("noise mismatch -12"); }
  } else if (context.noise === "lively") {
    if (/\blively|energetic|party|dance|live music|dj|nightlife\b/.test(text)) { adjustment += 8; reasons.push("lively fit +8"); }
    if (/\bquiet|silent|library like\b/.test(text)) { adjustment -= 6; reasons.push("energy mismatch -6"); }
  }
  if (context.budget === "premium") {
    if (/\bupscale|luxury|premium|fine dining|tasting menu|prix fixe|michelin|$$$$\b/.test(text)) { adjustment += 7; reasons.push("premium fit +7"); }
  } else if (context.budget === "budget") {
    if (/\baffordable|budget|cheap|value|counter service|diner|food hall|\$\b/.test(text)) { adjustment += 7; reasons.push("budget fit +7"); }
    if (/\bluxury|premium|fine dining|tasting menu|$$$$\b/.test(text)) { adjustment -= 8; reasons.push("budget mismatch -8"); }
  }
  return { adjustment: Math.max(-30, Math.min(24, adjustment)), reasons };
}

function baseRowScore(row: any) {
  const candidates = [row?.search_score, row?.final_score, row?.ranking_score, row?.score, row?.theouthaven_score, row?.quality_score];
  for (const value of candidates) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  const rating = Number(row?.rating);
  return Number.isFinite(rating) ? rating * 20 : 0;
}

function rerankLane(rows: any[], domain: "restaurant" | "activity", context: PreferenceContext) {
  const adjustmentById = new Map<string, number>();
  const ranked = rows.map((row) => {
    const text = searchableText(row);
    const occasion = occasionAdjustment(text, domain, context.occasion);
    const preference = preferenceAdjustment(text, context);
    const adjustment = Math.max(-35, Math.min(30, occasion.adjustment + preference.adjustment));
    const base = baseRowScore(row);
    const copy = {
      ...row,
      search_quality_base_score: base,
      search_quality_adjustment: adjustment,
      search_quality_score: base + adjustment,
      search_quality_reasons: [...occasion.reasons, ...preference.reasons],
    };
    adjustmentById.set(idOf(copy), adjustment);
    return copy;
  }).sort((a, b) => Number(b.search_quality_score ?? 0) - Number(a.search_quality_score ?? 0));
  return { rows: ranked, adjustmentById };
}

function pairCompatibility(pair: any, context: PreferenceContext) {
  const restaurantText = searchableText(pair?.restaurant);
  const activityText = searchableText(pair?.activity);
  const combined = `${restaurantText} ${activityText}`;
  let adjustment = 0;
  const reasons: string[] = [];
  const add = (points: number, reason: string) => { adjustment += points; reasons.push(`${reason} ${points > 0 ? "+" : ""}${points}`); };
  if (context.occasion === "date_night") {
    if (/\b(children'?s?|kids?|playground|trampoline|indoor play|children museum|childrens museum)\b/.test(activityText)) add(-28, "date-night pair activity mismatch");
    if (/\bromantic|intimate|cozy|upscale|classy\b/.test(restaurantText) && /\bart gallery|museum|comedy|jazz|live music|theater|theatre|rooftop|cocktail|wine bar|escape room|mini golf\b/.test(activityText)) add(14, "cohesive date-night pair");
  } else if (context.occasion === "girls_night") {
    if (/\brooftop|cocktail|wine bar|lounge|upscale|lively\b/.test(restaurantText) && /\bkaraoke|comedy|jazz|live music|rooftop|lounge|dance|cocktail\b/.test(activityText)) add(12, "cohesive girls-night pair");
  } else if (context.occasion === "family_outing") {
    if (/\b21\+|adult only|nightclub|hookah|cigar lounge\b/.test(combined)) add(-30, "family pair adult-only mismatch");
    if (/\bfamily|casual\b/.test(restaurantText) && /\bmuseum|bowling|arcade|mini golf|park|zoo|aquarium\b/.test(activityText)) add(12, "cohesive family pair");
  } else if (context.occasion === "birthday") {
    if (/\bgroup|private room|celebration|party\b/.test(restaurantText) && /\bkaraoke|bowling|arcade|comedy|rooftop|interactive\b/.test(activityText)) add(10, "cohesive birthday pair");
  } else if (context.occasion === "business_dinner") {
    if (/\bquiet|private dining|upscale|fine dining|steakhouse\b/.test(restaurantText) && !/\bnightclub|arcade|trampoline|loud\b/.test(activityText)) add(8, "business-friendly pair");
    if (/\bnightclub|arcade|trampoline|loud\b/.test(activityText)) add(-16, "business pair mismatch");
  }
  return { adjustment: Math.max(-35, Math.min(18, adjustment)), reasons };
}

function existingPairScore(pair: any) {
  const values = [pair?.search_quality_score, pair?.scores?.total, pair?.final_score, pair?.search_score, pair?.score];
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return (baseRowScore(pair?.restaurant) + baseRowScore(pair?.activity)) / 2;
}

function geoTierRank(value: unknown) {
  return value === "exact_locality" ? 0 : value === "nearby_radius" ? 1 : value === "broader_geo" ? 2 : 3;
}

function rerankPairs(pairs: any[], context: PreferenceContext, restaurantAdjustments: Map<string, number>, activityAdjustments: Map<string, number>) {
  return pairs.map((pair) => {
    const laneAdjustment = (restaurantAdjustments.get(idOf(pair?.restaurant)) ?? 0) * 0.35 + (activityAdjustments.get(idOf(pair?.activity)) ?? 0) * 0.35;
    const compatibility = pairCompatibility(pair, context);
    const adjustment = Math.max(-40, Math.min(30, laneAdjustment + compatibility.adjustment));
    const base = existingPairScore(pair);
    return {
      ...pair,
      search_quality_base_score: base,
      search_quality_adjustment: adjustment,
      search_quality_score: base + adjustment,
      search_quality_reasons: compatibility.reasons,
      scores: pair?.scores && typeof pair.scores === "object"
        ? { ...pair.scores, total: Number(pair.scores.total ?? base) + adjustment, outingFitAdjustment: adjustment }
        : pair?.scores,
    };
  }).sort((a, b) => geoTierRank(a?.geoTier ?? a?.geo_tier) - geoTierRank(b?.geoTier ?? b?.geo_tier) || Number(b.search_quality_score ?? 0) - Number(a.search_quality_score ?? 0));
}

function localTargetParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? NaN);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? NaN);
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
  return day >= 0 && Number.isFinite(hour) && Number.isFinite(minute) ? { day, hour, minute } : null;
}

function googlePeriods(row: any) {
  const sources = [row?.google_regular_opening_hours, row?.operating_hours, row?.google_current_opening_hours];
  for (const source of sources) {
    if (Array.isArray(source?.periods) && source.periods.length) return source.periods;
  }
  return [] as any[];
}

function statusFromPeriods(row: any, target: Date, timeZone: string): AvailabilityStatus {
  const periods = googlePeriods(row);
  if (!periods.length) return "unknown";
  const local = localTargetParts(target, timeZone);
  if (!local) return "unknown";
  const targetMinute = local.day * 1440 + local.hour * 60 + local.minute;
  for (const period of periods) {
    const openDay = Number(period?.open?.day);
    const openHour = Number(period?.open?.hour ?? 0);
    const openMinute = Number(period?.open?.minute ?? 0);
    if (![openDay, openHour, openMinute].every(Number.isFinite)) continue;
    const closeDay = Number(period?.close?.day);
    const closeHour = Number(period?.close?.hour ?? 0);
    const closeMinute = Number(period?.close?.minute ?? 0);
    const open = openDay * 1440 + openHour * 60 + openMinute;
    if (!period?.close || ![closeDay, closeHour, closeMinute].every(Number.isFinite)) return "open";
    let close = closeDay * 1440 + closeHour * 60 + closeMinute;
    if (close <= open) close += WEEK_MINUTES;
    if ((targetMinute >= open && targetMinute < close) || (targetMinute + WEEK_MINUTES >= open && targetMinute + WEEK_MINUTES < close)) return "open";
  }
  return "closed";
}

function exactPlannedTarget(result: any, input: HardeningInput) {
  const plan = planOf(result) ?? {};
  const plannedFor = typeof plan?.plannedFor === "string" ? plan.plannedFor : typeof input.body?.plannedFor === "string" ? input.body.plannedFor : null;
  if (!plannedFor) return null;
  const confidence = String(input.body?.outingTimeConfidence ?? input.body?.timeConfidence ?? "").toLowerCase();
  const queryHasTime = /\b(?:[01]?\d|2[0-3])(?::[0-5]\d)?\s*(?:am|pm)\b/i.test(input.query) || /\b(?:[01]?\d|2[0-3]):[0-5]\d\b/.test(input.query);
  if (confidence !== "exact" && !queryHasTime) return null;
  const target = new Date(plannedFor);
  if (Number.isNaN(target.getTime())) return null;
  const timeZone = typeof input.body?.timezone === "string" && input.body.timezone.trim() ? input.body.timezone.trim() : "America/New_York";
  return { target, timeZone, plannedFor };
}

function annotateAvailability(row: any, target: ReturnType<typeof exactPlannedTarget>) {
  if (!target) return row;
  const status = statusFromPeriods(row, target.target, target.timeZone);
  return {
    ...row,
    availability_status: status,
    schedule_match: status === "unknown" ? null : status === "open",
    availability_checked_for: target.plannedFor,
    availability_timezone: target.timeZone,
  };
}

function applyAvailability(result: any, input: HardeningInput) {
  const target = exactPlannedTarget(result, input);
  if (!target) return { result, applied: false, knownOpen: 0, knownClosed: 0, unknown: 0 };
  const restaurants = (Array.isArray(result?.restaurants) ? result.restaurants : []).map((row: any) => annotateAvailability(row, target));
  const activities = (Array.isArray(result?.activities) ? result.activities : []).map((row: any) => annotateAvailability(row, target));
  const restaurantById = new Map(restaurants.map((row: any) => [idOf(row), row]));
  const activityById = new Map(activities.map((row: any) => [idOf(row), row]));
  const pairs = (Array.isArray(result?.pairs) ? result.pairs : []).map((pair: any) => {
    const restaurant = restaurantById.get(idOf(pair?.restaurant)) ?? annotateAvailability(pair?.restaurant, target);
    const activity = activityById.get(idOf(pair?.activity)) ?? annotateAvailability(pair?.activity, target);
    return { ...pair, restaurant, activity };
  }).filter((pair: any) => pair?.restaurant?.availability_status !== "closed" && pair?.activity?.availability_status !== "closed");
  const usableRestaurants = restaurants.filter((row: any) => row.availability_status !== "closed");
  const usableActivities = activities.filter((row: any) => row.availability_status !== "closed");
  const statuses = [...restaurants, ...activities].map((row: any) => row.availability_status as AvailabilityStatus);
  result.restaurants = usableRestaurants.length ? usableRestaurants : restaurants;
  result.activities = usableActivities.length ? usableActivities : activities;
  result.pairs = pairs;
  return {
    result,
    applied: true,
    knownOpen: statuses.filter((status) => status === "open").length,
    knownClosed: statuses.filter((status) => status === "closed").length,
    unknown: statuses.filter((status) => status === "unknown").length,
  };
}

export function applyPostSearchHardening(result: EnterpriseSearchResult, input: HardeningInput): EnterpriseSearchResult {
  const mutable = result as any;
  const context = preferenceContext(mutable, input.query);
  const restaurantRanking = rerankLane(Array.isArray(mutable.restaurants) ? mutable.restaurants : [], "restaurant", context);
  const activityRanking = rerankLane(Array.isArray(mutable.activities) ? mutable.activities : [], "activity", context);
  mutable.restaurants = restaurantRanking.rows;
  mutable.activities = activityRanking.rows;
  mutable.pairs = rerankPairs(Array.isArray(mutable.pairs) ? mutable.pairs : [], context, restaurantRanking.adjustmentById, activityRanking.adjustmentById);

  const availability = applyAvailability(mutable, input);
  const hardened = availability.result as any;
  hardened.card_counts = {
    ...(hardened.card_counts ?? {}),
    restaurants: Array.isArray(hardened.restaurants) ? hardened.restaurants.length : 0,
    activities: Array.isArray(hardened.activities) ? hardened.activities.length : 0,
    pairs: Array.isArray(hardened.pairs) ? hardened.pairs.length : 0,
  };
  if (hardened.cardCounts) hardened.cardCounts = { ...hardened.cardCounts, ...hardened.card_counts };
  hardened.debug = {
    ...(hardened.debug ?? {}),
    postSearchHardening: {
      applied: true,
      occasion: context.occasion,
      preferences: context,
      restaurantReranked: restaurantRanking.rows.length,
      activityReranked: activityRanking.rows.length,
      pairReranked: Array.isArray(hardened.pairs) ? hardened.pairs.length : 0,
      plannedAvailabilityApplied: availability.applied,
      availabilityKnownOpen: availability.knownOpen,
      availabilityKnownClosed: availability.knownClosed,
      availabilityUnknown: availability.unknown,
    },
  };
  return hardened as EnterpriseSearchResult;
}
