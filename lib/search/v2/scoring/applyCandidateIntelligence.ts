import type { SupabaseClient } from "@supabase/supabase-js";
import type { SearchPlan } from "../planner/searchPlanTypes";
import type { SearchTrace } from "../observability/searchTrace";
import { geoTierRank } from "../geo/geoPolicy";
import type { ScoredCandidate } from "./scoringTypes";

const clamp = (value: number) => Math.max(0, Math.min(100, value));
const normalize = (value: unknown) => String(value ?? "").toLowerCase().replace(/[’']/g, "'").replace(/[_-]+/g, " ").replace(/[^a-z0-9$\s]+/g, " ").replace(/\s+/g, " ").trim();

function locationOf(item: ScoredCandidate) {
  return item.candidate.candidate.location as Record<string, any>;
}

function searchableText(location: Record<string, any>) {
  return normalize([
    location.name,
    location.restaurant_name,
    location.activity_name,
    location.location_type,
    location.primary_category,
    location.cuisine,
    location.cuisine_type,
    location.activity_type,
    location.description,
    location.approved_description,
    location.tags,
    location.features,
    location.special_features,
    location.vibe_tags,
    location.semantic_tags,
    location.best_for_tags,
    location.date_style_tags,
    location.intent_tags,
    location.review_themes,
    location.review_keywords,
    location.search_keywords,
    location.search_document,
    location.semantic_search_text,
    location.restaurant_categories,
    location.activity_categories,
    location.nightlife_categories,
    location.cuisines,
    location.foods,
  ].flatMap((value) => Array.isArray(value) ? value : [value]).filter(Boolean).join(" "));
}

function containsTerm(text: string, term: string) {
  const normalized = normalize(term);
  if (!normalized) return false;
  return (` ${text} `).includes(` ${normalized} `) || text.includes(normalized);
}

function violatesTerms(text: string, terms: readonly string[]) {
  return terms.some((term) => containsTerm(text, term));
}

function violatesGeo(location: Record<string, any>, exclusions: readonly string[]) {
  if (!exclusions.length) return false;
  const fields = [location.neighborhood, location.borough, location.city, location.county, location.state]
    .map(normalize)
    .filter(Boolean);
  return exclusions.some((term) => {
    const target = normalize(term);
    return Boolean(target && fields.some((field) => field === target || field.includes(target) || target.includes(field)));
  });
}

function preferenceSignals(preference: string) {
  switch (normalize(preference)) {
    case "conversation friendly": return ["quiet", "conversation", "intimate", "cozy", "good for talking", "date night"];
    case "relaxed": return ["relaxed", "chill", "laid back", "low key", "cozy"];
    case "upscale": return ["upscale", "classy", "elegant", "luxury", "fine dining"];
    case "romantic": return ["romantic", "intimate", "date night", "cozy"];
    case "lively": return ["lively", "energetic", "dj", "dancing", "live music"];
    case "trendy": return ["trendy", "cool", "instagrammable", "popular"];
    default: return [normalize(preference)];
  }
}

function preferenceAdjustment(plan: SearchPlan, location: Record<string, any>, text: string) {
  let adjustment = 0;
  const reasons: string[] = [];
  const preferences = plan.preferences;
  if (!preferences) return { adjustment, reasons };

  for (const vibe of preferences.vibes) {
    const matched = preferenceSignals(vibe).some((term) => containsTerm(text, term));
    if (matched) {
      adjustment += 3;
      reasons.push(`matched soft preference: ${vibe}`);
    }
  }

  if (preferences.noise === "quiet") {
    const quiet = /\bquiet|conversation|intimate|cozy|low key|laid back\b/.test(text);
    const loud = /\bloud|party|clubby|nightclub|dance floor|dj\b/.test(text);
    if (quiet) { adjustment += 5; reasons.push("matched quiet/conversation preference"); }
    if (loud) { adjustment -= 10; reasons.push("penalized for loud/party evidence"); }
  } else if (preferences.noise === "lively") {
    if (/\blively|energetic|dj|live music|dancing|party\b/.test(text)) {
      adjustment += 5;
      reasons.push("matched lively preference");
    }
  }

  const price = normalize(location.price_level ?? location.price_range);
  const dollarCount = (String(location.price_level ?? "").match(/\$/g) ?? []).length;
  const numericPrice = dollarCount || Number(location.price_level ?? location.price_tier ?? 0);
  if (preferences.budget === "budget") {
    if ((numericPrice > 0 && numericPrice <= 2) || /cheap|affordable|budget|inexpensive/.test(price)) adjustment += 4;
    else if (numericPrice >= 4 || /luxury|premium|expensive/.test(price)) adjustment -= 8;
  } else if (preferences.budget === "moderate") {
    if (numericPrice === 2 || numericPrice === 3 || /moderate|mid range|reasonably priced/.test(price)) adjustment += 4;
    else if (numericPrice >= 4) adjustment -= 5;
  } else if (preferences.budget === "premium") {
    if (numericPrice >= 3 || /luxury|premium|high end|fine dining/.test(price)) adjustment += 4;
  }

  return { adjustment: Math.max(-15, Math.min(15, adjustment)), reasons };
}

function semanticAdjustment(item: ScoredCandidate) {
  const location = locationOf(item);
  const similarity = Number(location.semantic_similarity ?? 0);
  if (!Number.isFinite(similarity) || similarity < 0.55) return { adjustment: 0, reason: null as string | null };
  let adjustment = Math.min(10, Math.max(0, ((similarity - 0.55) / 0.45) * 10));
  const hasStructuredEvidence = item.candidate.candidate.matchedRetrievalTerms.length > 0
    || item.candidate.candidate.retrievalSources.some((source) => source !== "semantic_vector");
  if (!hasStructuredEvidence) adjustment = Math.min(adjustment, 6);
  adjustment = Math.round(adjustment * 100) / 100;
  return {
    adjustment,
    reason: `semantic relevance ${similarity.toFixed(3)}${hasStructuredEvidence ? "" : " (weak-evidence cap)"}`,
  };
}

type HoursStatus = "open" | "closed" | "unknown";
const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
const DAY_ABBR: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function easternWeekPosition(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const day = DAY_ABBR[values.weekday] ?? date.getUTCDay();
  const hour = Number(values.hour ?? 0);
  const minute = Number(values.minute ?? 0);
  return { day, minuteOfDay: hour * 60 + minute, weekMinute: day * 1440 + hour * 60 + minute };
}

function parseClock(raw: string) {
  const match = raw.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === "AM" && hour === 12) hour = 0;
  if (meridiem === "PM" && hour !== 12) hour += 12;
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function weeklyIntervalsFromMap(hours: Record<string, any>) {
  const intervals: Array<{ open: number; close: number }> = [];
  let explicit = false;
  DAY_NAMES.forEach((dayName, dayIndex) => {
    const raw = hours?.[dayName];
    if (raw == null) return;
    explicit = true;
    const values = Array.isArray(raw) ? raw : [raw];
    for (const value of values) {
      const text = String(value).trim();
      if (!text || /closed/i.test(text)) continue;
      const normalized = text.replace(/[–—−]/g, "-");
      const match = normalized.match(/^(.+?)\s*-\s*(.+)$/);
      if (!match) continue;
      const openMinute = parseClock(match[1]);
      const closeMinute = parseClock(match[2]);
      if (openMinute == null || closeMinute == null) continue;
      const open = dayIndex * 1440 + openMinute;
      let close = dayIndex * 1440 + closeMinute;
      if (close <= open) close += 1440;
      intervals.push({ open, close });
    }
  });
  return { intervals, explicit };
}

function weeklyIntervalsFromPeriods(periods: any[]) {
  const intervals: Array<{ open: number; close: number }> = [];
  for (const period of periods) {
    const openDay = Number(period?.open?.day);
    const openHour = Number(period?.open?.hour ?? 0);
    const openMinute = Number(period?.open?.minute ?? 0);
    const closeDay = Number(period?.close?.day);
    const closeHour = Number(period?.close?.hour ?? 0);
    const closeMinute = Number(period?.close?.minute ?? 0);
    if (![openDay, openHour, openMinute, closeDay, closeHour, closeMinute].every(Number.isFinite)) continue;
    const open = openDay * 1440 + openHour * 60 + openMinute;
    let close = closeDay * 1440 + closeHour * 60 + closeMinute;
    if (close <= open) close += 7 * 1440;
    intervals.push({ open, close });
  }
  return intervals;
}

function statusFromIntervals(intervals: Array<{ open: number; close: number }>, weekMinute: number, explicit: boolean): HoursStatus {
  if (!intervals.length) return explicit ? "closed" : "unknown";
  const open = intervals.some((interval) =>
    (weekMinute >= interval.open && weekMinute < interval.close)
    || (weekMinute + 7 * 1440 >= interval.open && weekMinute + 7 * 1440 < interval.close),
  );
  return open ? "open" : "closed";
}

function availabilityAt(location: Record<string, any>, date: Date): HoursStatus {
  const { weekMinute } = easternWeekPosition(date);
  const regularPeriods = location.google_regular_opening_hours?.periods;
  if (Array.isArray(regularPeriods) && regularPeriods.length) {
    return statusFromIntervals(weeklyIntervalsFromPeriods(regularPeriods), weekMinute, true);
  }

  const operating = location.operating_hours;
  if (operating && typeof operating === "object" && !Array.isArray(operating)) {
    const mapped = weeklyIntervalsFromMap(operating);
    if (mapped.explicit) return statusFromIntervals(mapped.intervals, weekMinute, true);
    if (Array.isArray(operating.periods) && operating.periods.length) {
      return statusFromIntervals(weeklyIntervalsFromPeriods(operating.periods), weekMinute, true);
    }
  }
  return "unknown";
}

function reliableHours(location: Record<string, any>) {
  const confidence = normalize(location.hours_confidence);
  const source = normalize(location.hours_source);
  return confidence === "verified" || confidence === "high" || source.includes("google places") || Array.isArray(location.google_regular_opening_hours?.periods);
}

function plannedDateForCandidate(plan: SearchPlan, item: ScoredCandidate) {
  if (!plan.plannedFor) return null;
  const base = new Date(plan.plannedFor);
  if (!Number.isFinite(base.getTime())) return null;
  if (plan.mode !== "paired_outing" || plan.pairing.sequence === "any") return base;
  const roleIsRestaurant = item.selectedRole === "restaurant" || item.selectedRole.endsWith("_restaurant");
  const secondStop = plan.pairing.sequence === "restaurant_first" ? !roleIsRestaurant : roleIsRestaurant;
  return secondStop ? new Date(base.getTime() + 90 * 60 * 1000) : base;
}

function availabilityAdjustment(plan: SearchPlan, item: ScoredCandidate) {
  const date = plannedDateForCandidate(plan, item);
  if (!date) return { status: "unknown" as HoursStatus, reliable: false, hardReject: false, adjustment: 0, reason: null as string | null };
  const location = locationOf(item);
  const status = availabilityAt(location, date);
  const reliable = reliableHours(location);
  if (status === "open") return { status, reliable, hardReject: false, adjustment: 5, reason: `open at planned time (${date.toISOString()})` };
  if (status === "closed") {
    const hardReject = reliable && (plan.mode !== "paired_outing" || plan.pairing.sequence !== "any");
    return { status, reliable, hardReject, adjustment: hardReject ? 0 : -12, reason: `closed at planned time (${date.toISOString()})` };
  }
  return { status, reliable, hardReject: false, adjustment: 0, reason: "hours unavailable for planned time" };
}

async function hydrateHours(supabase: SupabaseClient, items: ScoredCandidate[], trace?: SearchTrace) {
  const ids = [...new Set(items.map((item) => String(locationOf(item).id ?? "")).filter(Boolean))];
  if (!ids.length) return;
  try {
    const { data, error } = await supabase
      .from("locations")
      .select("id,operating_hours,special_hours,google_regular_opening_hours,google_current_opening_hours,hours_confidence,hours_source,hours_last_backfilled_at")
      .in("id", ids);
    if (error) throw error;
    const byId = new Map((Array.isArray(data) ? data : []).map((row: any) => [String(row.id), row]));
    for (const item of items) {
      const location = locationOf(item);
      const row = byId.get(String(location.id ?? ""));
      if (row) Object.assign(location, row);
    }
  } catch (error) {
    trace?.decisions.push({
      stage: "candidate_hours",
      decision: "hours_hydration_failed_open",
      reason: error instanceof Error ? error.message : "unknown hours hydration failure",
    });
  }
}

function compareCandidates(a: ScoredCandidate, b: ScoredCandidate) {
  return geoTierRank(a.candidate.candidate.geoMatch?.tier) - geoTierRank(b.candidate.candidate.geoMatch?.tier)
    || b.scores.total - a.scores.total;
}

export async function applyCandidateIntelligence({
  plan,
  scored,
  supabase,
  trace,
}: {
  plan: SearchPlan;
  scored: { all: ScoredCandidate[]; restaurants: ScoredCandidate[]; activities: ScoredCandidate[] };
  supabase: SupabaseClient;
  trace?: SearchTrace;
}) {
  if (plan.plannedFor) await hydrateHours(supabase, scored.all, trace);

  const adjusted = new Map<ScoredCandidate, ScoredCandidate>();
  let excludedByNegative = 0;
  let excludedByGeoNegative = 0;
  let excludedByHours = 0;
  let semanticBoosted = 0;
  let preferenceAdjusted = 0;
  let openBoosted = 0;

  for (const item of scored.all) {
    const location = locationOf(item);
    const text = searchableText(location);
    const isRestaurant = item.selectedRole === "restaurant" || item.selectedRole.endsWith("_restaurant");
    const exclusions = isRestaurant ? plan.restaurant.exclusions : plan.activity.exclusions;
    const avoidVibes = plan.preferences?.avoidVibes ?? [];
    if (violatesTerms(text, exclusions) || violatesTerms(text, avoidVibes)) {
      excludedByNegative++;
      continue;
    }
    if (violatesGeo(location, plan.geo.exclusions ?? [])) {
      excludedByGeoNegative++;
      continue;
    }

    const preference = preferenceAdjustment(plan, location, text);
    const semantic = semanticAdjustment(item);
    const availability = availabilityAdjustment(plan, item);
    if (availability.hardReject) {
      excludedByHours++;
      continue;
    }
    if (preference.adjustment) preferenceAdjusted++;
    if (semantic.adjustment) semanticBoosted++;
    if (availability.adjustment > 0) openBoosted++;

    const negativePenalty = Math.max(0, -preference.adjustment) + Math.max(0, -availability.adjustment);
    const total = clamp(item.scores.total + preference.adjustment + semantic.adjustment + availability.adjustment);
    const next: ScoredCandidate = {
      ...item,
      scores: {
        ...item.scores,
        penalties: item.scores.penalties + negativePenalty,
        total,
      },
      reasons: [
        ...item.reasons,
        ...preference.reasons,
        semantic.reason,
        availability.reason,
      ].filter(Boolean) as string[],
    };
    adjusted.set(item, next);
  }

  const mapLane = (items: ScoredCandidate[]) => items
    .map((item) => adjusted.get(item))
    .filter((item): item is ScoredCandidate => Boolean(item))
    .sort(compareCandidates);
  const all = [...adjusted.values()].sort(compareCandidates);
  const restaurants = mapLane(scored.restaurants);
  const activities = mapLane(scored.activities);
  all.forEach((item, index) => {
    item.ml.finalRank = index + 1;
    if (item.ml.baseRank != null) item.ml.rankDelta = item.ml.baseRank - item.ml.finalRank;
  });

  trace?.decisions.push({
    stage: "candidate_intelligence",
    decision: "language_semantic_time_constraints_applied",
    reason: JSON.stringify({
      excludedByNegative,
      excludedByGeoNegative,
      excludedByHours,
      semanticBoosted,
      preferenceAdjusted,
      openBoosted,
      plannedFor: plan.plannedFor,
      restaurantCount: restaurants.length,
      activityCount: activities.length,
    }),
  });

  return { all, restaurants, activities };
}
