import type { SupabaseClient } from "@supabase/supabase-js";
import type { LanguageRuntimeDiagnostics } from "./languageRuntime";

export type BoundVenuePreferences = {
  plannerQuery: string;
  boundVenuePreferences: string[];
};

export type PlannedLocalTime = {
  day: number;
  minuteOfDay: number;
  source: "planned_for" | "natural_language";
  label: string;
};

type AvailabilityStatus = "open" | "closed" | "unknown";

type PreferenceContext = {
  language: LanguageRuntimeDiagnostics;
  boundVenuePreferences: readonly string[];
  occasion: string | null;
};

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
const WEEKDAY_INDEX = new Map(WEEKDAYS.map((day, index) => [day, index]));
const WEEK_MINUTES = 7 * 24 * 60;
const SEARCH_TIME_ZONE = "America/New_York";

const GUIDED_VENUE_PREFERENCES: Array<[RegExp, string]> = [
  [/\brooftop(?: dining)?\b/i, "rooftop"],
  [/\bhookah\b|\bshisha\b/i, "hookah"],
  [/\bcocktails?\b/i, "cocktails"],
  [/\blive music\b/i, "live_music"],
  [/\bjazz\b/i, "jazz"],
  [/\b(?:live )?dj\b/i, "dj"],
  [/\bwaterfront\b/i, "waterfront"],
  [/\boutdoor (?:seating|dining)\b/i, "outdoor_seating"],
  [/\bprivate room\b/i, "private_room"],
  [/\bsports tvs?\b/i, "sports_tvs"],
  [/\blounge\b/i, "lounge"],
];

const normalize = (value: unknown) => String(value ?? "")
  .toLowerCase()
  .replace(/[’']/g, "'")
  .replace(/[_-]+/g, " ")
  .replace(/[^a-z0-9$'\s]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const uniq = (values: readonly string[]) => [...new Set(values.map(normalize).filter(Boolean))];

function cardText(card: any) {
  const values = [
    card?.name,
    card?.restaurant_name,
    card?.activity_name,
    card?.primary_category,
    card?.category,
    card?.cuisine,
    card?.cuisine_type,
    card?.activity_type,
    card?.description,
    card?.price_level,
    card?.price_range,
    card?.tags,
    card?.vibe_tags,
    card?.best_for_tags,
    card?.date_style_tags,
    card?.semantic_tags,
    card?.intent_tags,
    card?.features,
    card?.restaurant_categories,
    card?.activity_categories,
    card?.nightlife_categories,
    card?.search_keywords,
    card?.whyMatched,
    card?.why_it_matched,
  ];
  return normalize(values.flatMap((value) => Array.isArray(value) ? value : value == null ? [] : [value]).join(" "));
}

function locationId(card: any) {
  const raw = card?.id ?? card?.location_id ?? null;
  return raw == null ? null : String(raw);
}

function numericScore(value: unknown, fallback = 50) {
  const score = Number(value);
  return Number.isFinite(score) ? score : fallback;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}

/**
 * Guided planner preference tags are soft venue attributes, not an instruction
 * to create another stop. Only the explicit `Preferences:` clause is rewritten;
 * ordinary language such as "dinner then hookah" remains untouched.
 */
export function bindGuidedVenuePreferences(query: string): BoundVenuePreferences {
  const bound: string[] = [];
  const plannerQuery = String(query ?? "").replace(/\bpreferences?\s*:\s*([^\n.;!?]*)/gi, (full, rawClause: string) => {
    const parts = String(rawClause)
      .split(/\s*,\s*|\s+and\s+/i)
      .map((part) => part.trim())
      .filter(Boolean);
    const remaining: string[] = [];

    for (const part of parts) {
      const matches = GUIDED_VENUE_PREFERENCES.filter(([pattern]) => pattern.test(part));
      if (!matches.length) {
        remaining.push(part);
        continue;
      }
      for (const [, canonical] of matches) bound.push(canonical);
      let cleaned = part;
      for (const [pattern] of matches) cleaned = cleaned.replace(pattern, " ");
      cleaned = cleaned.replace(/\s+/g, " ").trim();
      if (cleaned) remaining.push(cleaned);
    }

    return remaining.length ? `Preferences: ${remaining.join(", ")}` : "";
  }).replace(/\s+/g, " ").replace(/\s+([,.;!?])/g, "$1").trim();

  return { plannerQuery, boundVenuePreferences: uniq(bound) };
}

function zonedParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: SEARCH_TIME_ZONE,
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const weekday = normalize(get("weekday"));
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  return {
    day: WEEKDAY_INDEX.get(weekday) ?? date.getUTCDay(),
    minuteOfDay: Math.max(0, Math.min(1439, (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0))),
  };
}

function parseClock(query: string) {
  const match = query.match(/\b(?:at|around|about|after|by)?\s*(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)\b/i)
    ?? query.match(/\b(?:at|around|about|after|by)\s+(1[0-2]|0?[1-9])(?::([0-5]\d))?\b/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const meridian = normalize(match[3] ?? "");
  if (meridian.startsWith("p") && hour < 12) hour += 12;
  if (meridian.startsWith("a") && hour === 12) hour = 0;
  if (!meridian) {
    if (hour >= 1 && hour <= 6) hour += 12;
    else if (hour >= 7 && hour <= 11 && /\b(?:dinner|tonight|evening|night|late)\b/i.test(query)) hour += 12;
  }
  return hour * 60 + minute;
}

function defaultMinute(query: string) {
  if (/\bbreakfast\b/i.test(query)) return 9 * 60;
  if (/\bbrunch\b/i.test(query)) return 11 * 60 + 30;
  if (/\blunch\b/i.test(query)) return 13 * 60;
  if (/\bafternoon\b/i.test(query)) return 15 * 60;
  if (/\blate[- ]?night\b/i.test(query)) return 22 * 60;
  return 19 * 60;
}

export function resolvePlannedLocalTime(query: string, plannedFor?: string | null, now = new Date()): PlannedLocalTime | null {
  if (plannedFor) {
    const parsed = new Date(plannedFor);
    if (!Number.isNaN(parsed.getTime())) {
      const parts = zonedParts(parsed);
      return { ...parts, source: "planned_for", label: plannedFor };
    }
  }

  const text = normalize(query);
  const temporalSignal = /\b(today|tonight|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|this evening|late night)\b/i.test(text)
    || /\b(?:at|around|about|after|by)\s+(?:1[0-2]|0?[1-9])(?::[0-5]\d)?\s*(?:a\.?m\.?|p\.?m\.?)?\b/i.test(text);
  if (!temporalSignal) return null;

  const current = zonedParts(now);
  let day = current.day;
  if (/\btomorrow\b/i.test(text)) day = (day + 1) % 7;
  else {
    for (const [weekday, index] of WEEKDAY_INDEX.entries()) {
      if (new RegExp(`\\b${weekday}\\b`, "i").test(text)) {
        day = index;
        break;
      }
    }
  }
  const minuteOfDay = parseClock(text) ?? defaultMinute(text);
  return { day, minuteOfDay, source: "natural_language", label: `${WEEKDAYS[day]} ${Math.floor(minuteOfDay / 60)}:${String(minuteOfDay % 60).padStart(2, "0")}` };
}

function minuteFromPoint(point: any) {
  const day = Number(point?.day);
  const hour = Number(point?.hour ?? 0);
  const minute = Number(point?.minute ?? 0);
  if (!Number.isInteger(day) || day < 0 || day > 6 || !Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return day * 1440 + hour * 60 + minute;
}

function periodsStatus(periods: any[], target: PlannedLocalTime): AvailabilityStatus {
  const targetMinute = target.day * 1440 + target.minuteOfDay;
  let validPeriods = 0;
  for (const period of periods) {
    const open = minuteFromPoint(period?.open);
    const closeRaw = minuteFromPoint(period?.close);
    if (open == null) continue;
    validPeriods += 1;
    let close = closeRaw ?? open + 24 * 60;
    if (close <= open) close += WEEK_MINUTES;
    if ((targetMinute >= open && targetMinute < close) || (targetMinute + WEEK_MINUTES >= open && targetMinute + WEEK_MINUTES < close)) return "open";
  }
  return validPeriods ? "closed" : "unknown";
}

function parseClockPart(value: string, inheritedMeridian?: "am" | "pm" | null) {
  const match = normalize(value).match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const meridian = (match[3] as "am" | "pm" | undefined) ?? inheritedMeridian ?? null;
  if (hour > 24 || minute > 59) return null;
  if (meridian === "pm" && hour < 12) hour += 12;
  if (meridian === "am" && hour === 12) hour = 0;
  if (hour === 24) hour = 0;
  return { minute: hour * 60 + minute, meridian };
}

function dayMapRanges(raw: any, day: number) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [] as Array<[number, number]>;
  const value = raw[WEEKDAYS[day]] ?? raw[WEEKDAYS[day].slice(0, 3)] ?? null;
  const entries = Array.isArray(value) ? value : value == null ? [] : [value];
  const ranges: Array<[number, number]> = [];
  for (const entry of entries) {
    const text = String(entry).trim();
    if (!text || /closed/i.test(text)) continue;
    if (/open 24 hours|24 hours/i.test(text)) {
      ranges.push([0, 1440]);
      continue;
    }
    const [leftRaw, rightRaw] = text.split(/\s+-\s+|\s+[–—]\s+/).map((part) => part?.trim());
    if (!leftRaw || !rightRaw) continue;
    const right = parseClockPart(rightRaw);
    const left = parseClockPart(leftRaw, right?.meridian ?? null);
    if (!left || !right) continue;
    let end = right.minute;
    if (end <= left.minute) end += 1440;
    ranges.push([left.minute, end]);
  }
  return ranges;
}

function dayMapStatus(raw: any, target: PlannedLocalTime): AvailabilityStatus {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "unknown";
  const currentRanges = dayMapRanges(raw, target.day);
  const previousDay = (target.day + 6) % 7;
  const previousRanges = dayMapRanges(raw, previousDay);
  const hasDayKey = Object.keys(raw).some((key) => WEEKDAY_INDEX.has(normalize(key) as typeof WEEKDAYS[number]));
  for (const [start, end] of currentRanges) if (target.minuteOfDay >= start && target.minuteOfDay < end) return "open";
  for (const [start, end] of previousRanges) if (target.minuteOfDay + 1440 >= start && target.minuteOfDay + 1440 < end) return "open";
  return hasDayKey ? "closed" : "unknown";
}

export function evaluateHoursAtLocalTime(row: any, target: PlannedLocalTime): AvailabilityStatus {
  const sources = [row?.special_hours, row?.google_regular_opening_hours, row?.operating_hours, row?.hours_raw, row?.google_current_opening_hours];
  for (const source of sources) {
    const periods = Array.isArray(source?.periods) ? source.periods : null;
    if (periods) {
      const status = periodsStatus(periods, target);
      if (status !== "unknown") return status;
    }
    const mapped = dayMapStatus(source, target);
    if (mapped !== "unknown") return mapped;
  }
  return "unknown";
}

function termMatch(text: string, term: string) {
  const normalizedTerm = normalize(term);
  return Boolean(normalizedTerm && text.includes(normalizedTerm));
}

function priceTier(card: any) {
  const raw = card?.price_level ?? card?.price_range ?? card?.price ?? null;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.max(1, Math.min(4, Math.round(raw)));
  const text = String(raw ?? "").trim();
  if (/^\$+$/.test(text)) return Math.max(1, Math.min(4, text.length));
  const numeric = Number(text);
  return Number.isFinite(numeric) && numeric > 0 ? Math.max(1, Math.min(4, Math.round(numeric))) : null;
}

export function preferenceAdjustment(card: any, context: PreferenceContext, lane: "restaurant" | "activity") {
  const text = cardText(card);
  const desired = uniq([
    ...context.language.preferences.vibes,
    ...context.language.preferences.subjectiveTerms,
    ...context.boundVenuePreferences,
  ]);
  const avoid = uniq(context.language.negatives.vibes);
  const reasons: string[] = [];
  let adjustment = 0;

  for (const term of desired) {
    if (!termMatch(text, term)) continue;
    adjustment += context.boundVenuePreferences.includes(term) ? 8 : 4;
    reasons.push(`preference:${term}`);
  }
  for (const term of avoid) {
    if (!termMatch(text, term)) continue;
    adjustment -= 12;
    reasons.push(`avoid:${term}`);
  }

  if (context.language.preferences.noise === "quiet") {
    if (/quiet|cozy|intimate|conversation friendly|low key|relaxed/.test(text)) { adjustment += 10; reasons.push("quiet_fit"); }
    if (/loud|nightclub|dance floor|party|high energy|live dj/.test(text)) { adjustment -= 18; reasons.push("too_loud"); }
  } else if (context.language.preferences.noise === "lively") {
    if (/lively|energetic|dj|dance|party|live music/.test(text)) { adjustment += 9; reasons.push("lively_fit"); }
    if (/very quiet|silent|library/.test(text)) adjustment -= 6;
  }

  const tier = priceTier(card);
  if (tier != null && context.language.preferences.budget === "budget") adjustment += tier <= 2 ? 8 : -12;
  if (tier != null && context.language.preferences.budget === "moderate") adjustment += tier >= 2 && tier <= 3 ? 7 : tier === 4 ? -10 : 1;
  if (tier != null && context.language.preferences.budget === "premium") adjustment += tier >= 3 ? 8 : -5;

  if (context.occasion === "date_night") {
    if (/romantic|intimate|date night|rooftop|waterfront|jazz|cocktail|wine bar|speakeasy/.test(text)) { adjustment += 10; reasons.push("date_night_fit"); }
    if (lane === "activity" && /comedy|live music|jazz|art gallery|escape room|mini golf|spa|theater|cinema|movie|karaoke/.test(text)) { adjustment += 8; reasons.push("date_activity_fit"); }
    if (lane === "activity" && /children'?s|kids? museum|children museum|indoor playground|kids? play/.test(text)) { adjustment -= 35; reasons.push("date_night_child_specific_penalty"); }
  }

  return { adjustment: Math.max(-40, Math.min(24, adjustment)), reasons };
}

function applyCardPreference(card: any, context: PreferenceContext, lane: "restaurant" | "activity", availability: AvailabilityStatus | null) {
  const fit = preferenceAdjustment(card, context, lane);
  const availabilityAdjustment = availability === "open" ? 4 : availability === "unknown" ? -3 : availability === "closed" ? -100 : 0;
  const base = numericScore(card?.searchScore, 50);
  return {
    ...card,
    searchScore: clampScore(base + fit.adjustment + availabilityAdjustment),
    preferenceFitAdjustment: fit.adjustment,
    preferenceFitReasons: fit.reasons,
    ...(availability ? { schedule_match: availability === "unknown" ? null : availability === "open", availability_status: availability } : {}),
  };
}

function sortCards(cards: any[]) {
  return cards.sort((left, right) => numericScore(right?.searchScore) - numericScore(left?.searchScore));
}

function pairFitAdjustment(pair: any, context: PreferenceContext) {
  const restaurant = preferenceAdjustment(pair?.restaurant, context, "restaurant");
  const activity = preferenceAdjustment(pair?.activity, context, "activity");
  let adjustment = (restaurant.adjustment + activity.adjustment) * 0.45;
  const reasons = [...restaurant.reasons, ...activity.reasons];
  const restaurantId = locationId(pair?.restaurant);
  const activityId = locationId(pair?.activity);
  if (context.language.relationship.type === "same_venue_preferred" && restaurantId && restaurantId === activityId) {
    adjustment += 6;
    reasons.push("same_venue_preference_fit");
  }
  if (context.occasion === "date_night" && /children'?s|kids? museum|children museum|indoor playground|kids? play/.test(cardText(pair?.activity))) {
    adjustment -= 35;
    reasons.push("holistic_date_night_mismatch");
  }
  return { adjustment: Math.max(-45, Math.min(26, adjustment)), reasons: uniq(reasons) };
}

function recomputeTruth(response: any, hardSameVenue: boolean) {
  const restaurants = Array.isArray(response.restaurants) ? response.restaurants : [];
  const activities = Array.isArray(response.activities) ? response.activities : [];
  const sameVenueResults = Array.isArray(response.sameVenueResults) ? response.sameVenueResults : [];
  const pairs = Array.isArray(response.pairs) ? response.pairs : [];
  const mode = String(response.resolvedMode ?? response.requestedMode ?? response.searchPlan?.mode ?? "");
  const restaurantRequired = response.searchPlan?.restaurant?.required === true;
  const activityRequired = response.searchPlan?.activity?.required === true;
  const hasRestaurant = !restaurantRequired || restaurants.length > 0 || sameVenueResults.length > 0 || pairs.length > 0;
  const hasActivity = !activityRequired || activities.length > 0 || sameVenueResults.length > 0 || pairs.length > 0;
  const hasSameVenue = sameVenueResults.length > 0 || pairs.some((pair: any) => locationId(pair?.restaurant) && locationId(pair?.restaurant) === locationId(pair?.activity));
  let fulfilled = Boolean(response.requestFulfilled);
  if (mode === "restaurant_only") fulfilled = hasRestaurant;
  else if (mode === "activity_only") fulfilled = hasActivity;
  else if (hardSameVenue || mode === "same_venue") fulfilled = hasSameVenue;
  else if (mode === "paired_outing" || mode === "mixed_outing") fulfilled = hasRestaurant && hasActivity && pairs.length > 0;

  const anyRenderable = restaurants.length + activities.length + sameVenueResults.length + pairs.length > 0;
  response.requestFulfilled = fulfilled;
  response.partialResults = !fulfilled && anyRenderable;
  if (["paired_outing", "mixed_outing", "same_venue"].includes(mode) || hardSameVenue) response.success = fulfilled;
  response.displayMode = pairs.length ? "pairs" : sameVenueResults.length ? "same_venue_cards" : response.partialResults && restaurantRequired && activityRequired ? "partial_mixed" : restaurants.length ? "restaurant_cards" : activities.length ? "activity_cards" : "empty";
  response.counts = {
    ...(response.counts ?? {}),
    restaurantCards: restaurants.length,
    activityCards: activities.length,
    sameVenueCards: sameVenueResults.length,
    pairs: pairs.length,
    displayedResults: restaurants.length + activities.length + sameVenueResults.length + pairs.length,
  };
}

export async function applyRuntimeSearchIntelligence({
  response,
  supabase,
  originalQuery,
  language,
  boundVenuePreferences,
  explicitPlannedFor,
}: {
  response: any;
  supabase: SupabaseClient;
  originalQuery: string;
  language: LanguageRuntimeDiagnostics;
  boundVenuePreferences: readonly string[];
  explicitPlannedFor?: string | null;
}) {
  const out = response as any;
  const occasion = out?.searchPlan?.occasion ?? null;
  const context: PreferenceContext = { language, boundVenuePreferences, occasion };
  const planned = resolvePlannedLocalTime(originalQuery, out?.searchPlan?.plannedFor ?? explicitPlannedFor ?? null);
  const ids = uniq([
    ...(out.restaurants ?? []).map(locationId),
    ...(out.activities ?? []).map(locationId),
    ...(out.sameVenueResults ?? []).map(locationId),
    ...(out.builder?.restaurants ?? []).map(locationId),
    ...(out.builder?.activities ?? []).map(locationId),
    ...(out.pairs ?? []).flatMap((pair: any) => [locationId(pair?.restaurant), locationId(pair?.activity)]),
  ].filter(Boolean) as string[]).slice(0, 200);

  const availabilityById = new Map<string, AvailabilityStatus>();
  if (planned && ids.length) {
    const { data, error } = await supabase
      .from("locations")
      .select("id,operating_hours,special_hours,google_regular_opening_hours,google_current_opening_hours,hours_raw,hours_confidence,hours_source")
      .in("id", ids);
    if (!error) {
      for (const row of data ?? []) availabilityById.set(String(row.id), evaluateHoursAtLocalTime(row, planned));
    }
  }

  const availability = (card: any) => planned ? (availabilityById.get(locationId(card) ?? "") ?? "unknown") : null;
  const decorateLane = (cards: any[], lane: "restaurant" | "activity") => sortCards(cards
    .map((card) => applyCardPreference(card, context, lane, availability(card)))
    .filter((card) => !planned || card.availability_status !== "closed"));

  out.restaurants = decorateLane(Array.isArray(out.restaurants) ? out.restaurants : [], "restaurant");
  out.activities = decorateLane(Array.isArray(out.activities) ? out.activities : [], "activity");
  out.sameVenueResults = sortCards((Array.isArray(out.sameVenueResults) ? out.sameVenueResults : [])
    .map((card: any) => applyCardPreference(card, context, "restaurant", availability(card)))
    .filter((card: any) => !planned || card.availability_status !== "closed"));
  if (out.builder) {
    out.builder = {
      ...out.builder,
      restaurants: decorateLane(Array.isArray(out.builder.restaurants) ? out.builder.restaurants : [], "restaurant"),
      activities: decorateLane(Array.isArray(out.builder.activities) ? out.builder.activities : [], "activity"),
    };
    out.builder.enabled = Boolean(out.builder.restaurants.length && out.builder.activities.length);
  }

  out.pairs = (Array.isArray(out.pairs) ? out.pairs : []).flatMap((pair: any) => {
    const restaurantAvailability = availability(pair?.restaurant);
    const activityAvailability = availability(pair?.activity);
    if (planned && (restaurantAvailability === "closed" || activityAvailability === "closed")) return [];
    const restaurant = applyCardPreference(pair?.restaurant, context, "restaurant", restaurantAvailability);
    const activity = applyCardPreference(pair?.activity, context, "activity", activityAvailability);
    const fit = pairFitAdjustment({ ...pair, restaurant, activity }, context);
    return [{
      ...pair,
      restaurant,
      activity,
      score: clampScore(numericScore(pair?.score, 50) + fit.adjustment),
      outingFitAdjustment: fit.adjustment,
      outingFitReasons: fit.reasons,
      matchReasons: uniq([...(Array.isArray(pair?.matchReasons) ? pair.matchReasons : []), ...fit.reasons]),
    }];
  }).sort((left: any, right: any) => numericScore(right?.score) - numericScore(left?.score));

  const hardSameVenue = language.relationship.type === "same_venue_required" || out?.searchPlan?.pairing?.sameVenueRequired === true;
  recomputeTruth(out, hardSameVenue);
  out.debug = {
    ...(out.debug ?? {}),
    runtimeIntelligence: {
      version: "runtime-intelligence-v1",
      boundVenuePreferences: [...boundVenuePreferences],
      plannedTime: planned,
      hoursEvaluated: availabilityById.size,
      closedLocationsFiltered: planned ? ids.filter((id) => availabilityById.get(id) === "closed").length : 0,
      preferenceRerankingApplied: Boolean(boundVenuePreferences.length || language.preferences.vibes.length || language.preferences.subjectiveTerms.length || language.preferences.budget || language.preferences.noise || occasion),
      pairFitRerankingApplied: Array.isArray(out.pairs) && out.pairs.length > 0,
    },
  };
  return out;
}
