import { geoTierRank } from "../geo/geoPolicy";
import type { SearchTrace } from "../observability/searchTrace";
import type { SearchPlan } from "../planner/searchPlanTypes";
import type { ScoredCandidate } from "./scoringTypes";

const clampScore = (value: number) => Math.max(0, Math.min(100, value));

function locationOf(candidate: ScoredCandidate) {
  return candidate.candidate.candidate.location as Record<string, any>;
}

function normalizedText(location: Record<string, any>) {
  return [
    location.name,
    location.restaurant_name,
    location.activity_name,
    location.primary_category,
    location.cuisine,
    location.activity_type,
    location.tags,
    location.vibe_tags,
    location.best_for_tags,
    location.date_style_tags,
    location.semantic_tags,
    location.intent_tags,
    location.search_keywords,
    location.search_document,
    location.semantic_search_text,
    location.description,
    location.features,
    location.review_themes,
  ]
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[_-]+/g, " ");
}

function matchesPreference(term: string, text: string) {
  const normalized = term.toLowerCase().replace(/[_-]+/g, " ");
  if (text.includes(normalized)) return true;
  if (normalized === "conversation friendly") return /quiet|conversation|talk|intimate|cozy/.test(text);
  if (normalized === "relaxed") return /chill|laid back|low key|relaxed|casual/.test(text);
  if (normalized === "upscale") return /upscale|classy|elegant|fine dining|premium|luxury/.test(text);
  if (normalized === "romantic") return /romantic|date night|intimate|candle|cozy/.test(text);
  return false;
}

function preferenceAdjustment(plan: SearchPlan, location: Record<string, any>, text: string) {
  const preferences = plan.preferences;
  if (!preferences) return { adjustment: 0, reasons: [] as string[] };
  let adjustment = 0;
  const reasons: string[] = [];
  const matched = preferences.vibes.filter((vibe) => matchesPreference(vibe, text));
  if (matched.length) {
    const boost = Math.min(12, matched.length * 4);
    adjustment += boost;
    reasons.push(`preference fit +${boost}: ${matched.join(", ")}`);
  }
  const avoided = preferences.avoidVibes.filter((vibe) => matchesPreference(vibe, text));
  if (avoided.length) {
    const penalty = Math.min(24, avoided.length * 10);
    adjustment -= penalty;
    reasons.push(`avoided vibe -${penalty}: ${avoided.join(", ")}`);
  }
  if (preferences.noise === "quiet") {
    if (/loud|nightclub|dance club|party|dj driven|high energy/.test(text)) {
      adjustment -= 14;
      reasons.push("quiet preference -14: high-noise evidence");
    } else if (/quiet|conversation|intimate|cozy|low key/.test(text)) {
      adjustment += 6;
      reasons.push("quiet preference +6");
    }
  } else if (preferences.noise === "lively" && /lively|energetic|dj|dancing|live music|party/.test(text)) {
    adjustment += 5;
    reasons.push("lively preference +5");
  }

  const price = Number(location.price_level ?? location.google_price_level ?? NaN);
  if (Number.isFinite(price) && preferences.budget) {
    if (preferences.budget === "budget") adjustment += price <= 2 ? 5 : price >= 4 ? -12 : 0;
    if (preferences.budget === "moderate") adjustment += price >= 2 && price <= 3 ? 5 : price >= 4 ? -7 : 0;
    if (preferences.budget === "premium") adjustment += price >= 3 ? 5 : 0;
  }
  return { adjustment, reasons };
}

function occasionAdjustment(plan: SearchPlan, candidate: ScoredCandidate, text: string) {
  const isActivity = candidate.selectedRole === "general_activity" || candidate.selectedRole.endsWith("_activity");
  const isRestaurant = candidate.selectedRole === "restaurant" || candidate.selectedRole.endsWith("_restaurant");
  let adjustment = 0;
  const reasons: string[] = [];

  if (plan.occasion === "date_night") {
    const explicitFamilyRequest = /\b(?:kids?|children|child|family)\b/i.test(plan.rawQuery);
    if (isActivity && !explicitFamilyRequest && /children'?s|kids?|toddler|playground|family fun center|child focused|children museum/.test(text)) {
      adjustment -= 24;
      reasons.push("date-night activity fit -24: child-focused venue");
    } else if (isActivity && /live music|jazz|comedy|art gallery|gallery|museum|karaoke|escape room|mini golf|rooftop|scenic|theater|theatre|concert/.test(text)) {
      adjustment += 8;
      reasons.push("date-night activity fit +8");
    }
    if (isRestaurant && /romantic|intimate|date night|cozy|upscale|classy|elegant/.test(text)) {
      adjustment += 6;
      reasons.push("date-night restaurant context +6");
    }
  } else if (plan.occasion === "girls_night") {
    if (/rooftop|cocktail|karaoke|live music|dj|dancing|lively|trendy/.test(text)) {
      adjustment += 7;
      reasons.push("girls-night fit +7");
    }
  } else if (plan.occasion === "family_outing") {
    if (/family|kids?|children|museum|park|aquarium|zoo|bowling|mini golf/.test(text)) {
      adjustment += 8;
      reasons.push("family-outing fit +8");
    }
    if (/nightclub|adult only|21\+|hookah/.test(text)) {
      adjustment -= 20;
      reasons.push("family-outing fit -20: adult-oriented venue");
    }
  }
  return { adjustment, reasons };
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function parseClock(value: string, fallbackMeridiem?: "am" | "pm" | null) {
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const meridiem = match[3]?.toLowerCase() as "am" | "pm" | undefined ?? fallbackMeridiem ?? undefined;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (meridiem === "pm" && hour !== 12) hour += 12;
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function timeInRange(now: number, start: number, end: number) {
  if (end <= start) return now >= start || now < end;
  return now >= start && now < end;
}

function weekdayLineStatus(source: unknown, weekday: string, minuteOfDay: number) {
  let lines: string[] = [];
  if (Array.isArray(source)) lines = source.map(String);
  else if (source && typeof source === "object") {
    const object = source as Record<string, any>;
    const candidate = object.weekday_text ?? object.weekdayText ?? object.weekday_descriptions ?? object.weekdayDescriptions;
    if (Array.isArray(candidate)) lines = candidate.map(String);
    if (!lines.length) {
      const dayValue = object[weekday.toLowerCase()] ?? object[weekday.slice(0, 3).toLowerCase()];
      if (dayValue != null) {
        lines = (Array.isArray(dayValue) ? dayValue : [dayValue]).map((entry) => `${weekday}: ${String(entry)}`);
      }
    }
  } else if (typeof source === "string") {
    try {
      const parsed = JSON.parse(source);
      return weekdayLineStatus(parsed, weekday, minuteOfDay);
    } catch {
      lines = source.split(/\n|;/).map((line) => line.trim()).filter(Boolean);
    }
  }
  const line = lines.find((entry) => entry.toLowerCase().startsWith(weekday.toLowerCase()));
  if (!line) return "unknown" as const;
  if (/closed/i.test(line)) return "closed" as const;
  if (/open 24 hours|24 hours/i.test(line)) return "open" as const;
  const body = line.replace(/^.*?:\s*/, "").replace(/[–—]/g, "-");
  const ranges = body.split(/,\s*/);
  let parsedAny = false;
  for (const range of ranges) {
    const parts = range.split(/\s+-\s+/);
    if (parts.length !== 2) continue;
    const endMeridiemMatch = parts[1].match(/\b(am|pm)\b/i);
    const inferredMeridiem = endMeridiemMatch?.[1]?.toLowerCase() as "am" | "pm" | undefined;
    const end = parseClock(parts[1]);
    const start = parseClock(parts[0], inferredMeridiem ?? null);
    if (start == null || end == null) continue;
    parsedAny = true;
    if (timeInRange(minuteOfDay, start, end)) return "open" as const;
  }
  return parsedAny ? "closed" as const : "unknown" as const;
}

function googlePeriodsStatus(source: unknown, targetDay: number, minuteOfDay: number) {
  if (!source || typeof source !== "object") return "unknown" as const;
  const periods = Array.isArray((source as Record<string, any>).periods) ? (source as Record<string, any>).periods : [];
  if (!periods.length) return "unknown" as const;
  const target = targetDay * 1440 + minuteOfDay;
  let parsedAny = false;
  for (const period of periods) {
    const openDay = Number(period?.open?.day);
    const closeDay = Number(period?.close?.day);
    const openHour = Number(period?.open?.hour ?? 0);
    const openMinute = Number(period?.open?.minute ?? 0);
    const closeHour = Number(period?.close?.hour ?? 0);
    const closeMinute = Number(period?.close?.minute ?? 0);
    if (![openDay, openHour, openMinute].every(Number.isFinite)) continue;
    parsedAny = true;
    const start = openDay * 1440 + openHour * 60 + openMinute;
    let end = Number.isFinite(closeDay) ? closeDay * 1440 + closeHour * 60 + closeMinute : start + 1440;
    if (end <= start) end += 7 * 1440;
    if ((target >= start && target < end) || (target + 7 * 1440 >= start && target + 7 * 1440 < end)) return "open" as const;
  }
  return parsedAny ? "closed" as const : "unknown" as const;
}

function plannedAvailabilityAdjustment(plan: SearchPlan, location: Record<string, any>) {
  if (!plan.plannedFor) return { adjustment: 0, reason: null as string | null };
  if (location.schedule_match === false || location.availability_status === "closed" || location.availability_status === "unavailable") {
    return { adjustment: -30, reason: "planned-time availability -30: known unavailable" };
  }
  const date = new Date(plan.plannedFor);
  if (Number.isNaN(date.getTime())) return { adjustment: 0, reason: null as string | null };
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  if (!weekday || !WEEKDAYS.includes(weekday) || !Number.isFinite(hour) || !Number.isFinite(minute)) return { adjustment: 0, reason: null as string | null };
  const minuteOfDay = hour * 60 + minute;
  const targetDay = WEEKDAYS.indexOf(weekday);
  const sources = [
    location.google_current_opening_hours,
    location.google_regular_opening_hours,
    location.special_hours,
    location.operating_hours,
    location.hours_raw,
    location.hours,
  ];
  for (const source of sources) {
    const periodStatus = googlePeriodsStatus(source, targetDay, minuteOfDay);
    if (periodStatus === "open") return { adjustment: 5, reason: "planned-time availability +5: structured hours match" };
    if (periodStatus === "closed") return { adjustment: -22, reason: "planned-time availability -22: outside structured hours" };
    const status = weekdayLineStatus(source, weekday, minuteOfDay);
    if (status === "open") return { adjustment: 5, reason: "planned-time availability +5: hours match" };
    if (status === "closed") return { adjustment: -22, reason: "planned-time availability -22: outside known hours" };
  }
  return { adjustment: 0, reason: "planned-time availability unknown; no penalty" };
}

function rerankOne(plan: SearchPlan, candidate: ScoredCandidate) {
  const location = locationOf(candidate);
  const text = normalizedText(location);
  const preference = preferenceAdjustment(plan, location, text);
  const occasion = occasionAdjustment(plan, candidate, text);
  const availability = plannedAvailabilityAdjustment(plan, location);
  const adjustment = preference.adjustment + occasion.adjustment + availability.adjustment;
  return {
    ...candidate,
    scores: {
      ...candidate.scores,
      total: clampScore(candidate.scores.total + adjustment),
    },
    reasons: [
      ...candidate.reasons,
      ...preference.reasons,
      ...occasion.reasons,
      availability.reason,
    ].filter(Boolean) as string[],
  };
}

function compare(a: ScoredCandidate, b: ScoredCandidate) {
  return geoTierRank(a.candidate.candidate.geoMatch?.tier) - geoTierRank(b.candidate.candidate.geoMatch?.tier) || b.scores.total - a.scores.total;
}

export function applyContextualRerank({
  plan,
  scored,
  trace,
}: {
  plan: SearchPlan;
  scored: { all: ScoredCandidate[]; restaurants: ScoredCandidate[]; activities: ScoredCandidate[] };
  trace?: SearchTrace;
}) {
  const byOriginal = new Map<ScoredCandidate, ScoredCandidate>();
  for (const item of scored.all) byOriginal.set(item, rerankOne(plan, item));
  const map = (items: ScoredCandidate[]) => items.map((item) => byOriginal.get(item) ?? rerankOne(plan, item)).sort(compare);
  const result = {
    all: map(scored.all),
    restaurants: map(scored.restaurants),
    activities: map(scored.activities),
  };
  if (trace) {
    trace.decisions.push({
      stage: "contextual_ranking",
      decision: "occasion_preferences_and_planned_time_applied",
      reason: JSON.stringify({
        occasion: plan.occasion,
        preferences: plan.preferences ?? null,
        plannedFor: plan.plannedFor,
        restaurantCount: result.restaurants.length,
        activityCount: result.activities.length,
      }),
    });
  }
  return result;
}
