import type {
  RetrievalCandidate,
  RetrievalLaneResult,
  SearchIntentGraph,
  SearchRetrievalProvider,
  SearchV3Request,
} from "@/lib/search-framework";

export interface ReviewIntelligenceSupabaseClient {
  from(table: string): { select(columns?: string): any };
}

export interface ReviewIntelligenceRetrievalOptions {
  candidateLimit?: number;
}

type ReviewIntelligenceRow = {
  location_id: string;
  concept: string;
  lifetime_count: number | null;
  trailing_12m_count: number | null;
  trailing_90d_count: number | null;
  positive_ratio: number | null;
  negative_ratio: number | null;
  confidence: number | null;
  trend: string | null;
};

const CONCEPT_ALIASES: Readonly<Record<string, readonly string[]>> = {
  romantic: ["romantic", "date night", "anniversary", "intimate"],
  lively: ["lively", "energetic", "vibrant", "party", "fun atmosphere"],
  quiet: ["quiet", "peaceful", "calm", "relaxed", "intimate"],
  upscale: ["upscale", "elegant", "luxury", "fancy", "fine dining"],
  casual: ["casual", "laid back", "laid-back", "relaxed"],
  birthday: ["birthday", "celebration", "celebrate"],
  groups: ["group", "groups", "large party", "friends", "girls night", "girls' night"],
  family: ["family", "kids", "children", "kid friendly", "family friendly"],
  cocktails: ["cocktail", "cocktails", "drinks", "mixology", "bartender"],
  service: ["service", "server", "waiter", "waitress", "staff"],
  noise: ["loud", "noisy", "noise", "music volume"],
  parking: ["parking", "valet", "garage"],
  views: ["view", "views", "skyline", "scenic", "waterfront"],
  rooftop: ["rooftop", "roof top", "roof deck", "terrace"],
  live_music: ["live music", "jazz", "band", "dj"],
  value: ["value", "worth", "price", "prices", "expensive", "overpriced", "affordable"],
  wait_time: ["wait", "waited", "waiting", "line", "reservation delay"],
  portion_size: ["portion", "portions", "serving size"],
  food_quality: ["food quality", "great food", "good food", "meal", "dish"],
};

const SELECT_COLUMNS = [
  "location_id",
  "concept",
  "lifetime_count",
  "trailing_12m_count",
  "trailing_90d_count",
  "positive_ratio",
  "negative_ratio",
  "confidence",
  "trend",
].join(",");

export class SupabaseReviewIntelligenceRetrievalProvider
implements SearchRetrievalProvider {
  readonly providerId = "theouthaven.supabase-review-intelligence.v1";

  constructor(
    private readonly client: ReviewIntelligenceSupabaseClient,
    private readonly options: ReviewIntelligenceRetrievalOptions = {},
  ) {}

  async retrieve(args: {
    request: SearchV3Request;
    intent: SearchIntentGraph;
  }): Promise<RetrievalLaneResult> {
    const startedAt = Date.now();
    const concepts = reviewConceptsForIntent(args.intent);
    if (concepts.length === 0) {
      return {
        lane: "review_intelligence",
        candidates: [],
        elapsedMs: Date.now() - startedAt,
        truncated: false,
      };
    }

    const candidateLimit = Math.max(
      25,
      Math.min(this.options.candidateLimit ?? 300, 500),
    );
    const rowLimit = Math.min(candidateLimit * Math.max(1, concepts.length), 2000);
    const { data, error } = await this.client
      .from("location_review_intelligence")
      .select(SELECT_COLUMNS)
      .in("concept", concepts)
      .order("confidence", { ascending: false })
      .limit(rowLimit);
    if (error) throw new Error(error.message);

    const grouped = new Map<string, {
      score: number;
      evidence: string[];
      concepts: Array<Record<string, unknown>>;
    }>();

    for (const row of (data ?? []) as ReviewIntelligenceRow[]) {
      const confidence = clamp01(Number(row.confidence ?? 0));
      if (confidence <= 0) continue;
      const positiveRatio = clamp01(Number(row.positive_ratio ?? 0.5));
      const support = Math.min(1, Number(row.lifetime_count ?? 0) / 20);
      const recency = row.trailing_90d_count
        ? 1
        : row.trailing_12m_count
          ? 0.9
          : 0.75;
      const conceptScore =
        confidence * (0.7 + 0.3 * positiveRatio) * (0.8 + 0.2 * support) * recency;

      const current = grouped.get(row.location_id) ?? {
        score: 0,
        evidence: [],
        concepts: [],
      };
      current.score += conceptScore;
      current.evidence.push(
        `review:${row.concept}:confidence=${confidence.toFixed(3)}`,
      );
      current.concepts.push({
        concept: row.concept,
        confidence,
        positiveRatio,
        lifetimeCount: Number(row.lifetime_count ?? 0),
        trailing90dCount: Number(row.trailing_90d_count ?? 0),
        trend: row.trend ?? null,
        score: conceptScore,
      });
      grouped.set(row.location_id, current);
    }

    const candidates: RetrievalCandidate[] = [...grouped.entries()]
      .sort((a, b) =>
        b[1].score - a[1].score || a[0].localeCompare(b[0])
      )
      .slice(0, candidateLimit)
      .map(([locationId, value], index) => ({
        locationId,
        lane: "review_intelligence",
        rank: index + 1,
        score: value.score,
        evidence: value.evidence,
        metadata: {
          matchedReviewConcepts: value.concepts,
          requestedConcepts: concepts,
        },
      }));

    return {
      lane: "review_intelligence",
      candidates,
      elapsedMs: Date.now() - startedAt,
      truncated: grouped.size > candidateLimit || (data ?? []).length >= rowLimit,
    };
  }
}

export function reviewConceptsForIntent(intent: SearchIntentGraph): string[] {
  const haystack = normalize([
    intent.rawQuery,
    intent.occasion ?? "",
    ...intent.constraints.map((constraint) => String(constraint.value)),
  ].join(" "));

  const concepts: string[] = [];
  for (const [concept, aliases] of Object.entries(CONCEPT_ALIASES)) {
    if (aliases.some((alias) => containsPhrase(haystack, normalize(alias)))) {
      concepts.push(concept);
    }
  }
  return concepts;
}

function containsPhrase(haystack: string, phrase: string): boolean {
  if (!phrase) return false;
  return ` ${haystack} `.includes(` ${phrase} `);
}

function normalize(value: string): string {
  return String(value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
