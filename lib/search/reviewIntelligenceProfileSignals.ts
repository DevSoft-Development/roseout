export type ReviewIntelligenceSignalRow = {
  concept?: unknown;
  lifetime_count?: unknown;
  trailing_90d_count?: unknown;
  positive_ratio?: unknown;
  negative_ratio?: unknown;
  confidence?: unknown;
  updated_at?: unknown;
};

const clamp01 = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
};

const clamp100 = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
};

function signalScore(row?: ReviewIntelligenceSignalRow) {
  if (!row) return 0;
  const confidence = clamp01(row.confidence);
  const support = Math.min(1, Math.max(0, Number(row.lifetime_count ?? 0)) / 20);
  const positive = row.positive_ratio == null ? 0.5 : clamp01(row.positive_ratio);
  return clamp100((confidence * 0.7 + support * 0.3) * (0.8 + positive * 0.2) * 100);
}

function sentimentScore(row?: ReviewIntelligenceSignalRow, fallback = 50) {
  if (!row) return fallback;
  const confidence = clamp01(row.confidence);
  const positive = row.positive_ratio == null ? 0.5 : clamp01(row.positive_ratio);
  const negative = row.negative_ratio == null ? 0 : clamp01(row.negative_ratio);
  return clamp100(50 + (positive - negative) * 50 * confidence);
}

function penaltyScore(row?: ReviewIntelligenceSignalRow) {
  if (!row) return 0;
  return clamp100(clamp01(row.negative_ratio) * clamp01(row.confidence) * 100);
}

export function deriveReviewProfileSignals(
  rows: ReviewIntelligenceSignalRow[],
): Record<string, unknown> | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const byConcept = new Map<string, ReviewIntelligenceSignalRow>();
  for (const row of rows) {
    const concept = String(row.concept ?? "").trim();
    if (!concept) continue;
    const existing = byConcept.get(concept);
    if (!existing || Number(row.confidence ?? 0) > Number(existing.confidence ?? 0)) {
      byConcept.set(concept, row);
    }
  }
  if (byConcept.size === 0) return null;

  const get = (concept: string) => byConcept.get(concept);
  const score = (concept: string) => signalScore(get(concept));
  const mentions = (concept: string) => Math.max(0, Number(get(concept)?.lifetime_count ?? 0));
  const positive = (concept: string) => sentimentScore(get(concept));

  const quiet = score("quiet");
  const romantic = score("romantic");
  const lively = score("lively");
  const groups = score("groups");
  const family = score("family");
  const upscale = score("upscale");
  const casual = score("casual");
  const birthday = score("birthday");
  const cocktails = score("cocktails");
  const views = score("views");
  const rooftop = score("rooftop");
  const liveMusic = score("live_music");

  const bestForTerms = [...byConcept.entries()]
    .filter(([, row]) =>
      clamp01(row.confidence) >= 0.2 &&
      (row.positive_ratio == null || clamp01(row.positive_ratio) >= 0.5)
    )
    .sort((a, b) => signalScore(b[1]) - signalScore(a[1]))
    .map(([concept]) => concept)
    .slice(0, 10);

  const avoidIfTerms = [...byConcept.entries()]
    .filter(([, row]) =>
      clamp01(row.confidence) >= 0.2 &&
      clamp01(row.negative_ratio) >= 0.3
    )
    .sort((a, b) => penaltyScore(b[1]) - penaltyScore(a[1]))
    .map(([concept]) => concept)
    .slice(0, 8);

  const confidence = Math.max(
    ...[...byConcept.values()].map((row) => clamp01(row.confidence)),
    0,
  ) * 100;

  const freshness = Math.max(
    ...[...byConcept.values()].map((row) => {
      const lifetime = Math.max(1, Number(row.lifetime_count ?? 0));
      return Math.min(1, Number(row.trailing_90d_count ?? 0) / lifetime);
    }),
    0,
  ) * 100;

  const weighted = [...byConcept.values()].reduce(
    (acc, row) => {
      const weight = Math.max(1, Number(row.lifetime_count ?? 0));
      const value = row.positive_ratio == null ? 0.5 : clamp01(row.positive_ratio);
      return { sum: acc.sum + value * weight, weight: acc.weight + weight };
    },
    { sum: 0, weight: 0 },
  );
  const overallQuality = weighted.weight ? (weighted.sum / weighted.weight) * 100 : 50;

  const updatedAt = [...byConcept.values()]
    .map((row) => String(row.updated_at ?? ""))
    .filter(Boolean)
    .sort()
    .pop() ?? null;

  return {
    updated_at: updatedAt,
    calculated_at: updatedAt,
    quiet_score: quiet,
    loud_score: score("noise"),
    romantic_score: romantic,
    group_score: groups,
    family_score: family,
    upscale_score: upscale,
    casual_score: casual,
    photo_worthy_score: Math.max(views, rooftop),
    lively_score: Math.max(lively, liveMusic, cocktails * 0.8),
    relaxed_score: Math.max(quiet, casual),
    grown_vibe_score: Math.max(upscale, cocktails * 0.65),
    date_night_score: romantic,
    birthday_score: Math.max(birthday, groups * 0.7),
    girls_night_score: Math.max(groups * 0.85, cocktails * 0.8, lively * 0.75),
    service_score: positive("service"),
    food_score: positive("food_quality"),
    ambiance_score: Math.max(50, romantic, upscale, views, rooftop),
    value_score: positive("value",),
    wait_penalty: penaltyScore(get("wait_time")),
    overpriced_penalty: penaltyScore(get("value")),
    service_penalty: penaltyScore(get("service")),
    noise_penalty: penaltyScore(get("noise")),
    crowded_penalty: 0,
    quiet_mention_count: mentions("quiet"),
    loud_mention_count: mentions("noise"),
    romantic_mention_count: mentions("romantic"),
    group_mention_count: mentions("groups"),
    family_mention_count: mentions("family"),
    photo_worthy_mention_count: Math.max(mentions("views"), mentions("rooftop")),
    service_issue_count: Math.round(mentions("service") * clamp01(get("service")?.negative_ratio)),
    wait_issue_count: Math.round(mentions("wait_time") * clamp01(get("wait_time")?.negative_ratio)),
    value_issue_count: Math.round(mentions("value") * clamp01(get("value")?.negative_ratio)),
    best_for_terms: bestForTerms,
    avoid_if_terms: avoidIfTerms,
    top_positive_terms: bestForTerms,
    top_negative_terms: avoidIfTerms,
    review_confidence_score: clamp100(confidence),
    review_freshness_score: clamp100(freshness),
    overall_review_quality_score: clamp100(overallQuality),
    review_summary: "External review intelligence is contributing intent-fit and quality signals.",
  };
}
