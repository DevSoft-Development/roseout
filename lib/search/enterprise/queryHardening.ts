import type { SearchIntent } from "./types";

const uniq = (values: string[]) => Array.from(new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean)));

export type SearchRecoveryProfile = {
  reasons: string[];
  originalRadiusMiles: number | null;
  hardenedRadiusMiles: number | null;
};

export function hardenProductionSearchIntent(intent: SearchIntent): {
  intent: SearchIntent;
  profile: SearchRecoveryProfile;
} {
  const query = String(intent.rawQuery ?? "").toLowerCase();
  const activityTerms = [...(intent.activityIntent?.activityTerms ?? [])];
  const categoryTerms = [...(intent.activityIntent?.categoryTerms ?? [])];
  const featureTerms = [...(intent.activityIntent?.featureTerms ?? [])];
  const reasons: string[] = [];

  if (/\bkaraoke\b/.test(query)) {
    activityTerms.push("karaoke", "karaoke bar", "karaoke lounge", "private karaoke", "sing along");
    categoryTerms.push("karaoke", "nightlife", "entertainment");
    reasons.push("karaoke_alias_recovery");
  }

  if (/\b(knicks|sports? bar|watch (?:the )?game|game day|live sports|bar with tvs?|big screens?)\b/.test(query)) {
    activityTerms.push("sports bar", "sports lounge", "pub", "tavern", "bar and grill", "watch party");
    featureTerms.push("tv", "tvs", "screens", "big screen", "live sports", "sports viewing");
    categoryTerms.push("sports bar", "bar", "pub");
    reasons.push("sports_watch_alias_recovery");
  }

  if (/\b(hookah|shisha)\b/.test(query)) {
    activityTerms.push("hookah", "hookah lounge", "hookah bar", "shisha lounge", "lounge");
    categoryTerms.push("hookah", "lounge", "nightlife");
    reasons.push("hookah_alias_recovery");
  }

  if (/\b(relaxed|relaxing|chill|laid back|low key|casual activity)\b/.test(query)) {
    activityTerms.push(
      "relaxed activity",
      "chill activity",
      "board games",
      "art gallery",
      "museum",
      "scenic walk",
      "park",
      "billiards",
      "paint and sip",
      "low key live music",
    );
    reasons.push("relaxed_activity_recovery");
  }

  const originalRadius = Number(intent.geo?.radiusMiles);
  const anchoredNearby = /\bnear\b/.test(query) && /\b(paramount|center|centre|theater|theatre|arena|stadium|venue)\b/.test(query);
  const hardenedRadius = anchoredNearby
    ? Math.max(Number.isFinite(originalRadius) ? originalRadius : 0, 8)
    : originalRadius;
  if (anchoredNearby) reasons.push("anchor_nearby_radius_recovery");

  const hardened: SearchIntent = {
    ...intent,
    strictness: reasons.length ? "medium" : intent.strictness,
    geo: {
      ...intent.geo,
      radiusMiles: Number.isFinite(hardenedRadius) ? hardenedRadius : intent.geo?.radiusMiles,
      geoStrictness: anchoredNearby && intent.geo?.geoStrictness === "strict" ? "medium" : intent.geo?.geoStrictness,
    },
    activityIntent: {
      ...intent.activityIntent,
      activityTerms: uniq(activityTerms),
      categoryTerms: uniq(categoryTerms),
      featureTerms: uniq(featureTerms),
    },
  };

  return {
    intent: hardened,
    profile: {
      reasons,
      originalRadiusMiles: Number.isFinite(originalRadius) ? originalRadius : null,
      hardenedRadiusMiles: Number.isFinite(Number(hardened.geo?.radiusMiles)) ? Number(hardened.geo?.radiusMiles) : null,
    },
  };
}
