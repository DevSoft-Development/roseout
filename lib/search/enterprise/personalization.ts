export type PreferenceEvent = {
  userId: string;
  type: "click" | "save" | "reservation" | "completed";
  occurredAt: string;
  cuisine?: string;
  activity?: string;
  market?: string;
  price?: string;
};

export type UserPreferenceProfile = {
  userId: string;
  evidence: number;
  weightedEvidence: number;
  cuisines: Record<string, number>;
  activities: Record<string, number>;
  markets: Record<string, number>;
};

export type PersonalizationMode = "disabled" | "shadow" | "enabled";

export type PersonalizationEvaluation = {
  adjustment: number;
  eligible: boolean;
  reason:
    | "eligible"
    | "missing_profile"
    | "insufficient_evidence"
    | "explicit_intent_conflict"
    | "no_matching_preferences";
  matchedCuisine?: string;
  matchedActivity?: string;
  matchedMarket?: string;
};

const EVENT_WEIGHTS: Record<PreferenceEvent["type"], number> = {
  click: 1,
  save: 3,
  reservation: 5,
  completed: 6,
};

const MIN_PERSONALIZATION_EVIDENCE = 3;
const HALF_LIFE_DAYS = 90;
const MAX_PERSONALIZATION_ADJUSTMENT = 8;

function normalizeToken(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, " ");
}

function addScore(target: Record<string, number>, key: unknown, value: number) {
  const normalized = normalizeToken(key);
  if (!normalized || !Number.isFinite(value) || value <= 0) return;
  target[normalized] = Number(((target[normalized] ?? 0) + value).toFixed(4));
}

function validEventDate(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function buildUserPreferenceProfile(
  userId: string,
  events: PreferenceEvent[],
  now = new Date(),
): UserPreferenceProfile {
  const profile: UserPreferenceProfile = {
    userId,
    evidence: 0,
    weightedEvidence: 0,
    cuisines: {},
    activities: {},
    markets: {},
  };

  const nowMs = now.getTime();

  events
    .filter((event) => event.userId === userId)
    .map((event) => ({ event, occurredAtMs: validEventDate(event.occurredAt) }))
    .filter(
      (entry): entry is { event: PreferenceEvent; occurredAtMs: number } =>
        entry.occurredAtMs !== null && entry.occurredAtMs <= nowMs,
    )
    .sort((a, b) => a.occurredAtMs - b.occurredAtMs)
    .forEach(({ event, occurredAtMs }) => {
      const baseWeight = EVENT_WEIGHTS[event.type];
      const ageDays = Math.max(0, (nowMs - occurredAtMs) / 86_400_000);
      const decayedWeight = baseWeight * Math.pow(0.5, ageDays / HALF_LIFE_DAYS);

      profile.evidence += baseWeight;
      profile.weightedEvidence += decayedWeight;
      addScore(profile.cuisines, event.cuisine, decayedWeight);
      addScore(profile.activities, event.activity, decayedWeight);
      addScore(profile.markets, event.market, decayedWeight);
    });

  profile.weightedEvidence = Number(profile.weightedEvidence.toFixed(4));
  return profile;
}

export function personalizationMode(
  value = process.env.SEARCH_PERSONALIZATION_MODE,
): PersonalizationMode {
  return value === "enabled" || value === "shadow" ? value : "disabled";
}

export function evaluatePersonalization(
  profile: UserPreferenceProfile | undefined,
  candidate: {
    cuisine?: unknown;
    cuisine_type?: unknown;
    activity_type?: unknown;
    market?: unknown;
  },
  explicitTerms: string[] = [],
): PersonalizationEvaluation {
  if (!profile) {
    return { adjustment: 0, eligible: false, reason: "missing_profile" };
  }

  if (profile.evidence < MIN_PERSONALIZATION_EVIDENCE) {
    return { adjustment: 0, eligible: false, reason: "insufficient_evidence" };
  }

  const explicit = new Set(explicitTerms.map(normalizeToken).filter(Boolean));
  const cuisine = normalizeToken(candidate.cuisine ?? candidate.cuisine_type);
  const activity = normalizeToken(candidate.activity_type);
  const market = normalizeToken(candidate.market);

  if (explicit.size > 0 && cuisine && !explicit.has(cuisine)) {
    return {
      adjustment: 0,
      eligible: false,
      reason: "explicit_intent_conflict",
    };
  }

  const cuisineScore = profile.cuisines[cuisine] ?? 0;
  const activityScore = (profile.activities[activity] ?? 0) * 0.8;
  const marketScore = (profile.markets[market] ?? 0) * 0.25;
  const raw = cuisineScore + activityScore + marketScore;

  if (raw <= 0) {
    return {
      adjustment: 0,
      eligible: true,
      reason: "no_matching_preferences",
    };
  }

  return {
    adjustment: Number(Math.min(MAX_PERSONALIZATION_ADJUSTMENT, raw).toFixed(3)),
    eligible: true,
    reason: "eligible",
    matchedCuisine: cuisineScore > 0 ? cuisine : undefined,
    matchedActivity: activityScore > 0 ? activity : undefined,
    matchedMarket: marketScore > 0 ? market : undefined,
  };
}

export function personalizationAdjustment(
  profile: UserPreferenceProfile | undefined,
  candidate: {
    cuisine?: unknown;
    cuisine_type?: unknown;
    activity_type?: unknown;
    market?: unknown;
  },
  explicitTerms: string[] = [],
) {
  return evaluatePersonalization(profile, candidate, explicitTerms).adjustment;
}
